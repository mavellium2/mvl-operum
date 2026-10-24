'use server'

import { erroCustosMacroFases, erroMoeda, parseMoeda } from '@/lib/dinheiro'
import { normalizarContato } from '@/lib/contato'
import { submeterDocumento } from '@/services/documentRevisionService'
import { planilhaDoProjeto } from '@/services/planilhaService'
import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { projectsApi } from '@/lib/api-client'
import prisma from '@/lib/prisma'
import { setProjectManagerRole, removeProjectRole, isProjectManager } from '@/services/projectRoleService'
import { notificarPendenciasDoMembroInativo } from '@/services/membroInativo'
import { getTree } from '@/services/wbsService'
import { validateAvatarUrl } from '@/lib/validation/avatarUrl'
import { requireProjectPermission } from '@/services/projectAccess'
import { reconcileMacroFases } from '@/services/macroFaseSyncService'
import { parseHoras } from '@/lib/validation/horas'
import { dependenciasDoProjeto, mensagemDeBloqueio, type DependenciaProjeto } from '@/services/projetoDependencias'
import { primeiraDataDeTarefa } from '@/services/inicioDoProjeto'

/**
 * Garante que o catálogo (Department) tenha os departamentos escolhidos e
 * sincroniza as associações reais (ProjetoDepartamento) do projeto com essa
 * seleção — o form de projeto agora fica conectado ao cadastro global.
 */
async function syncProjetoDepartamentos(projetoId: string, tenantId: string, names: string[]) {
  const uniqueNames = [...new Set(names.map(n => n.trim()).filter(Boolean))]

  // Resolve (ou cria) cada departamento no catálogo global do tenant.
  const departmentIds: string[] = []
  for (const name of uniqueNames) {
    const existing = await prisma.department.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    })
    let dept = existing
    if (!dept) {
      dept = await prisma.department.create({ data: { tenantId, name } })
    } else if (dept.deletedAt !== null) {
      dept = await prisma.department.update({ where: { id: dept.id }, data: { deletedAt: null } })
    }
    departmentIds.push(dept.id)
  }

  const current = await prisma.projetoDepartamento.findMany({
    where: { projetoId },
    select: { id: true, departamentoId: true },
  })
  const currentIds = new Set(current.map(c => c.departamentoId))
  const desired = new Set(departmentIds)

  const toCreate = departmentIds.filter(id => !currentIds.has(id))
  const toDelete = current.filter(c => !desired.has(c.departamentoId))

  if (toCreate.length > 0) {
    await prisma.projetoDepartamento.createMany({
      data: toCreate.map(departamentoId => ({ projetoId, departamentoId })),
      skipDuplicates: true,
    })
  }
  if (toDelete.length > 0) {
    await prisma.projetoDepartamento.deleteMany({
      where: { projetoId, departamentoId: { in: toDelete.map(d => d.departamentoId) } },
    })
  }
}

export async function createProjetoAction(
  _prevState: unknown,
  input: {
    name: string
    description?: string
    initialMemberId?: string
    startDate?: string
    endDate?: string
    location?: string
    logoUrl?: string
    slogan?: string
    justificativa?: string
    objetivos?: string
    metodologia?: string
    descricaoProduto?: string
    premissas?: string
    restricoes?: string
    limitesAutoridade?: string
    semestre?: string
    termo?: string
    turno?: string
    ano?: string
    departamentos?: string[]
    macroFases?: Array<{ fase: string; dataLimite: string; custo: string }>
  },
) {
  try {
    const session = await verifySession()
    const { tenantId } = session
    if (session.role !== 'admin') throw new Error('Só o administrador cria projetos')
    const { initialMemberId, ano: anoStr, macroFases, startDate, endDate, ...rest } = input
    const erroCusto = erroCustosMacroFases(macroFases)
    if (erroCusto) throw new Error(erroCusto)
    const ano = anoStr ? Number(anoStr) : undefined
    const toISO = (d?: string) => d ? new Date(d).toISOString() : undefined

    const projeto = await projectsApi.create({
      ...rest,
      tenantId,
      macroFases,
      ano,
      startDate: toISO(startDate),
      endDate: toISO(endDate),
    }) as Record<string, unknown>

    if (initialMemberId) {
      await projectsApi.addMember(projeto.id as string, { userId: initialMemberId })
      // Vincula de verdade o papel de Gerente de Projeto (UserProjectRole) —
      // antes só criava o membro e a função desaparecia nos stakeholders.
      await setProjectManagerRole(initialMemberId, projeto.id as string, tenantId)
      // O novo membro pode estar parado em /no-project — libera o gate dele.
      revalidatePath('/no-project')
      revalidatePath('/')
    }

    const macroFasesSync = macroFases !== undefined ? await reconcileMacroFases(projeto.id as string, tenantId, session.userId) : undefined

    if (rest.departamentos && rest.departamentos.length > 0) {
      await syncProjetoDepartamentos(projeto.id as string, tenantId, rest.departamentos)
    }

    revalidatePath('/projetos')
    revalidatePath(`/projetos/${projeto.id}/wbs`)
    revalidatePath(`/projetos/${projeto.id}/planilha-custos`)
    return { projeto, macroFasesSync }
  } catch (err) {
    return { error: err instanceof Error ? (err.message || 'Erro ao criar projeto') : 'Erro ao criar projeto' }
  }
}

export async function getProjetosAction(): Promise<{ id: string; name: string }[]> {
  try {
    const result = await projectsApi.list()
    return result.items
  } catch {
    return []
  }
}

export async function getProjetoAction(id: string) {
  try {
    const session = await verifySession()
    const { tenantId } = session
    await requireProjectPermission(session, id, 'projeto:ver')
    const projeto = await projectsApi.get(id)
    if (!projeto) return { error: 'Projeto não encontrado' }
    const associados = await prisma.projetoDepartamento.findMany({
      where: { projetoId: id },
      select: { department: { select: { id: true, name: true } } },
    })
    const gerente = await prisma.userProjectRole.findFirst({
      where: {
        projectId: id,
        deletedAt: null,
        role: { is: { nameKey: 'gerente', scope: 'PROJETO' } },
      },
      select: { userId: true },
    })

    const macroFasesSyncPending = (projeto.macroFasesRevision ?? 0) > (projeto.macroFasesSyncedRevision ?? 0)

    // Fonte única de macrofases = árvore WBS top-level (EAP/Planilha).
    // Fallback: ProjectMacroFase (projetos legados sem árvore).
    let macroFasesFromTree: Array<{ fase: string; dataLimite: string; custo: string }> | null = null
    const tree = await getTree(id, tenantId)
    const planilha = await planilhaDoProjeto(id, tenantId)
    const fasesCalculadas = new Map(planilha?.macrofases.map(f => [f.nodeId, f]) ?? [])
    if (tree.rootId && tree.nodes[tree.rootId]) {
      const topLevelIds = tree.nodes[tree.rootId].childrenIds
      if (topLevelIds.length > 0) {
        macroFasesFromTree = topLevelIds.map(faseId => {
          const fase = tree.nodes[faseId]
          const props = (fase?.properties as Record<string, unknown>) ?? {}
          return {
            fase: fase?.title ?? '',
            dataLimite: fasesCalculadas.get(faseId)?.dataFim ?? (typeof props.dataLimite === 'string' ? props.dataLimite : ''),
            custo: (fasesCalculadas.get(faseId)?.atividades.some(a => a.totalOrcado !== null) ? fasesCalculadas.get(faseId)!.totalOrcado : typeof props.custo === 'number' ? props.custo : null)?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? (typeof props.custo === 'string' ? props.custo : ''),
          }
        }).filter(f => f.fase)
      }
    }

    // Início = primeira tarefa com data; sem nenhuma, vale a data informada no projeto.
    const primeiraTarefa = await primeiraDataDeTarefa(id, tenantId)

    return {
      projeto: {
        ...projeto,
        startDate: primeiraTarefa ? primeiraTarefa.toISOString() : projeto.startDate,
        inicioPelaPrimeiraTarefa: primeiraTarefa !== null,
        endDate: planilha?.dataFimProjeto ?? projeto.endDate,
        macroFases: macroFasesSyncPending ? projeto.macroFases ?? [] : macroFasesFromTree ?? projeto.macroFases ?? [],
        macroFasesSyncPending,
      },
      departamentosAssociados: associados.map(a => a.department),
      gerenteId: gerente?.userId ?? '',
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao buscar projeto' }
  }
}

export async function updateProjetoAction(
  _prevState: unknown,
  id: string,
  data: Record<string, unknown> & { ano?: string | number; macroFases?: Array<{ fase: string; dataLimite: string; custo: string }> },
) {
  try {
    data = { ...data }
    const session = await verifySession()
    const { tenantId } = session
    await requireProjectPermission(session, id, 'projeto:editar')
    const complementares = Object.fromEntries(['justificativa', 'objetivos', 'metodologia', 'descricaoProduto', 'premissas', 'restricoes', 'limitesAutoridade'].filter(key => key in data).map(key => [key, data[key]]))
    if (Object.keys(complementares).length) {
      await requireProjectPermission(session, id, 'documentos:editar')
      await requireProjectPermission(session, id, 'documentos:aprovar')
      for (const key of Object.keys(complementares)) delete data[key]
    }
    if (data.initialMemberId !== undefined && session.role !== 'admin') {
      const current = await prisma.userProjectRole.findFirst({ where: { projectId: id, deletedAt: null, role: { is: { nameKey: 'gerente', scope: 'PROJETO' } } }, select: { userId: true } })
      if ((data.initialMemberId || '') !== (current?.userId || '')) throw new Error('Só o administrador atribui o papel de gerente')
      delete data.initialMemberId
    }
    if (data.macroFases !== undefined) {
      const erroCusto = erroCustosMacroFases(data.macroFases)
      if (erroCusto) throw new Error(erroCusto)
      await requireProjectPermission(session, id, 'planilha:orcado')
      await requireProjectPermission(session, id, 'planilha:realizado-todos')
    }
    if (Array.isArray(data.departamentos)) await requireProjectPermission(session, id, 'cadastros:gerenciar')
    if (session.role !== 'admin' && Array.isArray(data.departamentos)) {
      for (const name of data.departamentos) {
        if (typeof name !== 'string' || !(await prisma.department.findFirst({ where: { tenantId, name: { equals: name.trim(), mode: 'insensitive' }, deletedAt: null }, select: { id: true } }))) throw new Error('Só o administrador cria departamentos')
      }
    }
    const { ano: anoRaw, macroFases, startDate, endDate, initialMemberId, ...rest } = data
    const ano = anoRaw !== undefined && anoRaw !== '' ? Number(anoRaw) : undefined
    const toISO = (d: unknown) => (typeof d === 'string' && d) ? new Date(d).toISOString() : undefined
    const projeto = await projectsApi.update(id, {
      ...rest,
      ...(macroFases !== undefined && { macroFases }),
      ...(ano !== undefined && { ano }),
      ...(startDate !== undefined && { startDate: toISO(startDate) }),
      ...(endDate !== undefined && { endDate: toISO(endDate) }),
    })

    const macroFasesSync = macroFases !== undefined ? await reconcileMacroFases(id, tenantId, session.userId) : undefined

    const departamentos = rest.departamentos as string[] | undefined
    if (departamentos) {
      // Mantém o catálogo e as associações reais em sincronia com o form.
      await syncProjetoDepartamentos(id, tenantId, departamentos)
    }

    // Gerente do Projeto: troca o responsável (ou remove quando "Ainda não definido")
    if (initialMemberId !== undefined) {
      if (initialMemberId) {
        const gerenteUserId = initialMemberId as string
        await projectsApi.addMember(id, { userId: gerenteUserId })
        await setProjectManagerRole(gerenteUserId, id, tenantId)
        revalidatePath('/no-project')
      } else {
        const gerente = await prisma.userProjectRole.findFirst({
          where: {
            projectId: id,
            deletedAt: null,
            role: { is: { nameKey: 'gerente', scope: 'PROJETO' } },
          },
        })
        if (gerente) await removeProjectRole(gerente.userId, id)
      }
    }

    if (Object.keys(complementares).length) {
      const previous = await prisma.documentVersion.findFirst({ where: { projectId: id, documentType: 'CHARTER', status: 'APPROVED' }, orderBy: [{ approvedAt: 'desc' }, { sequence: 'desc' }] })
      await submeterDocumento(session, id, 'CHARTER', { ...((previous?.payload as object) ?? {}), ...complementares }, { commitTitle: 'Dados complementares atualizados na edição do projeto', versao: previous?.versao ?? '1.0', elaboradoPor: '', aprovadoPor: '', dataAprovacao: '' })
    }
    revalidatePath('/projetos')
    revalidatePath(`/projetos/${id}`)
    revalidatePath(`/projetos/${id}/wbs`)
    revalidatePath(`/projetos/${id}/planilha-custos`)
    return { projeto, macroFasesSync }
  } catch (err) {
    return { error: err instanceof Error ? (err.message || 'Erro ao atualizar projeto') : 'Erro ao atualizar projeto' }
  }
}

/** Verifica, antes de confirmar, se o projeto pode ser excluído. */
export async function verificarExclusaoProjetoAction(id: string): Promise<{ podeExcluir: boolean; motivo?: string; dependencias?: DependenciaProjeto[] } | { error: string }> {
  try {
    const { tenantId, userId } = await verifySession()
    const dependencias = await dependenciasDoProjeto(id, tenantId, userId)
    return dependencias.length
      ? { podeExcluir: false, motivo: mensagemDeBloqueio(dependencias), dependencias }
      : { podeExcluir: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao verificar o projeto' }
  }
}

export async function deleteProjetoAction(id: string) {
  try {
    const { tenantId, userId } = await verifySession()

    // Só exclui quando nada ficaria órfão (sprints, cards, tempo, atas, documentos, membros).
    const dependencias = await dependenciasDoProjeto(id, tenantId, userId)
    if (dependencias.length) return { error: mensagemDeBloqueio(dependencias), dependencias }

    // projectsApi.delete chama o project-service, que escopa por x-tenant-id
    // (project.service.ts remove -> findOne) e lança NotFoundException se o
    // projeto não pertencer ao tenant do usuário — não precisa revalidar aqui.
    await projectsApi.delete(id)

    // O delete do projeto é soft (deletedAt); rascunhos não têm cascade e reapareceriam
    // no formulário de "novo projeto"/edição se não forem limpos aqui. O filtro por
    // tenantId torna essa limpeza inofensiva mesmo que `id` não pertença a este tenant.
    await prisma.projectDraft.deleteMany({ where: { projectId: id, tenantId } })
    revalidatePath('/projetos')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao deletar projeto' }
  }
}

export async function addMemberAction(projetoId: string, userId: string) {
  try {
    await verifySession()
    await projectsApi.addMember(projetoId, { userId })
    revalidatePath(`/projetos/${projetoId}/membros`)
    revalidatePath(`/projetos/${projetoId}`)
    // O membro adicionado pode estar parado em /no-project — libera o gate dele.
    revalidatePath('/no-project')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao adicionar membro' }
  }
}

export async function removeMemberAction(projetoId: string, userId: string) {
  try {
    await verifySession()
    await projectsApi.removeMember(projetoId, userId)
    revalidatePath(`/projetos/${projetoId}/membros`)
    revalidatePath(`/projetos/${projetoId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao remover membro' }
  }
}

/**
 * Inativa (com motivo) ou reativa um membro da equipe no projeto. Inativo perde o
 * acesso, mas continua em Stakeholders e em Partes Interessadas, em vermelho com o
 * motivo, e nos cards em que já era responsável. Os gerentes recebem a pendência
 * dos cards que ficaram sem responsável ativo. Exige projeto:equipe (aqui e no gateway).
 */
export async function setMembroAtivoAction(projetoId: string, userId: string, ativo: boolean, motivo?: string) {
  try {
    const session = await verifySession()
    await requireProjectPermission(session, projetoId, 'projeto:equipe')
    const reason = (motivo ?? '').trim()
    if (!ativo) {
      if (reason.length < 3) return { error: 'Informe o motivo da inativação.' }
      if (reason.length > 500) return { error: 'O motivo pode ter no máximo 500 caracteres.' }
      if (userId === session.userId) return { error: 'Você não pode inativar a si mesmo.' }
      if (await isProjectManager(userId, projetoId)) {
        return { error: 'Este membro é gerente do projeto. Tire o papel de gerente antes de inativá-lo.' }
      }
    }
    await projectsApi.setMemberSituacao(projetoId, userId, ativo, ativo ? undefined : reason)
    let pendentes = 0
    if (!ativo) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
      try {
        pendentes = (await notificarPendenciasDoMembroInativo(projetoId, user ?? { id: userId, name: 'Membro' }, reason)).pendentes
      } catch { /* best-effort: a inativação já foi gravada */ }
    }
    revalidatePath(`/projetos/${projetoId}/stakeholders`)
    revalidatePath(`/projetos/${projetoId}`, 'layout')
    return { success: true as const, pendentes }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar a situação do membro.' }
  }
}

export async function getMembrosAction(projetoId: string) {
  try {
    await verifySession()
    return await projectsApi.getMembers(projetoId)
  } catch {
    return []
  }
}

export async function updateUsuarioProjetoAction(
  userId: string,
  projetoId: string,
  data: {
    projectRole?: string
    cargos?: string[]
    departamentos?: string[]
    hourlyRate?: number | null
    active?: boolean
  },
) {
  try {
    const { tenantId } = await verifySession()
    if (data.hourlyRate != null) {
      const erroValor = erroMoeda(data.hourlyRate, { rotulo: 'Valor/hora' })
      if (erroValor) throw new Error(erroValor)
    }
    await projectsApi.addMember(projetoId, { userId, ...data, tenantId })
    revalidatePath(`/projetos/${projetoId}/membros`)
    revalidatePath(`/projetos/${projetoId}`)
    revalidatePath('/admin/users')
    // O vínculo do usuário mudou (ativado/desativado) — libera o gate dele.
    revalidatePath('/no-project')
    revalidatePath('/')
    return { membro: { userId, projetoId } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar membro' }
  }
}

export async function updateProjetoMemberAction(
  userId: string,
  projetoId: string,
  data: {
    name?: string
    email?: string
    avatarUrl?: string
    phone?: string
    cep?: string
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    estado?: string
    notes?: string
    remuneracao?: number | string
    horasDiarias?: number | string
    hourlyRate?: number
    cargos?: string[]
    departamento?: string[]
    isGerente?: boolean
  },
) {
  try {
    const { role, tenantId, userId: sessionUserId } = await verifySession()
    const isAdmin = role === 'admin'
    data = { ...data }
    await requireProjectPermission({ role, tenantId, userId: sessionUserId }, projetoId, 'projeto:equipe')
    const member = await prisma.userProject.findFirst({ where: { projectId: projetoId, userId, user: { tenantId, deletedAt: null } }, select: { role: true } })
    if (!member) throw new Error('Membro não encontrado neste projeto')
    // E-mail só é alterado pelo administrador; para os demais nem é validado.
    if (!isAdmin) delete data.email
    if (typeof data.email === 'string' || typeof data.phone === 'string') {
      const atual = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { email: true, phone: true } })
      const contato = normalizarContato(data, { atual })
      if (!contato.data) throw new Error(contato.error)
      data = contato.data
    }
    if (!isAdmin) {
      if (data.cargos !== undefined && data.cargos.join(', ') !== (member.role ?? '')) throw new Error('Só o administrador atribui cargos')
      if (data.isGerente !== undefined && data.isGerente !== Boolean(await prisma.userProjectRole.findFirst({ where: { userId, projectId: projetoId, deletedAt: null, role: { is: { nameKey: 'gerente', scope: 'PROJETO' } } } }))) throw new Error('Só o administrador atribui o papel de gerente')
      delete data.cargos
      delete data.isGerente
    }

    const { isGerente: makeGerente, cargos, departamento, remuneracao: rawRemuneracao, horasDiarias: rawHorasDiarias, hourlyRate: rawHourlyRate, name, email, ...profileData } = data

    // Remuneração inválida é recusada; antes "abc" era descartado em silêncio.
    let remuneracao: number | undefined
    if (rawRemuneracao !== undefined && rawRemuneracao !== '') {
      const erroValor = erroMoeda(rawRemuneracao, { rotulo: 'Remuneração' })
      if (erroValor) throw new Error(erroValor)
      remuneracao = parseMoeda(rawRemuneracao) ?? undefined
    }

    // Mesma regra da tela (SDD 4.5): "8,5", "8.5" e "8:30" valem 8,5 h; fora de
    // 0–24 é recusado. Antes Number("8,5") virava NaN e o valor sumia em silêncio.
    let horasDiarias: number | undefined
    if (rawHorasDiarias !== undefined) {
      const { valor, erro } = parseHoras(rawHorasDiarias)
      if (erro) throw new Error(erro)
      if (valor !== null) horasDiarias = valor
    }

    const derivedHourlyRate =
      remuneracao !== undefined && horasDiarias !== undefined
        ? remuneracao / 30 / horasDiarias
        : undefined

    let directHourlyRate: number | undefined
    if (rawHourlyRate !== undefined) {
      const erroValor = erroMoeda(rawHourlyRate, { rotulo: 'Valor/hora' })
      if (erroValor) throw new Error(erroValor)
      if (rawHourlyRate > 0) directHourlyRate = rawHourlyRate
    }
    // Alguns formulários (ex.: edição de membro em ProjetoMembrosClient) enviam
    // hourlyRate direto em vez de remuneracao+horasDiarias — respeita esse valor quando presente.
    const hourlyRate = directHourlyRate !== undefined ? directHourlyRate : derivedHourlyRate

    if (!isAdmin && departamento?.length) {
      const existing = await prisma.department.findFirst({ where: { tenantId, name: { equals: departamento[0].trim(), mode: 'insensitive' }, deletedAt: null }, select: { id: true } })
      if (!existing) throw new Error('Só o administrador cria departamentos')
    }

    // 1. Update User profile via Prisma (name/email only for admin)
    const userUpdateData: Record<string, unknown> = { ...profileData }
    if ('avatarUrl' in profileData) {
      userUpdateData.avatarUrl = validateAvatarUrl(profileData.avatarUrl)
    }
    if (isAdmin) {
      if (name?.trim()) userUpdateData.name = name.trim()
      if (email?.trim()) userUpdateData.email = email.trim()
    }
    await prisma.user.update({
      where: { id: userId, tenantId, deletedAt: null },
      data: userUpdateData,
    })

    // 2a. Upsert cargos — sequential to avoid race conditions; upsert handles soft-deleted records
    if (cargos !== undefined && cargos.length > 0) {
      for (const cargoName of cargos) {
        const name = cargoName.trim()
        if (!name) continue
        const byName = await prisma.role.findFirst({
          where: { tenantId, name: { equals: name, mode: 'insensitive' } },
          select: { id: true, deletedAt: true },
        })
        if (byName) {
          if (byName.deletedAt !== null) {
            await prisma.role.update({ where: { id: byName.id }, data: { deletedAt: null } })
          }
        } else {
          const nameKey = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
          await prisma.role.upsert({
            where: { nameKey_tenantId_scope: { nameKey, tenantId, scope: 'TENANT' } },
            create: { tenantId, name, nameKey, scope: 'TENANT' },
            update: { name, deletedAt: null },
          })
        }
      }
    }

    // 2b. Upsert department — case-insensitive name search, resolve id
    let deptId: string | null | undefined
    if (departamento !== undefined) {
      if (departamento.length > 0) {
        const deptName = departamento[0].trim()
        const byName = await prisma.department.findFirst({
          where: { tenantId, name: { equals: deptName, mode: 'insensitive' } },
          select: { id: true, deletedAt: true },
        })
        if (byName) {
          if (byName.deletedAt !== null) {
            await prisma.department.update({ where: { id: byName.id }, data: { deletedAt: null } })
          }
          deptId = byName.id
        } else {
          const created = await prisma.department.create({
            data: { name: deptName, tenantId },
            select: { id: true },
          })
          deptId = created.id
        }
      } else {
        deptId = null
      }
    }

    // 2c. Update UserProject
    const userProjectData: Record<string, unknown> = {}
    if (cargos !== undefined) userProjectData.role = cargos.join(', ')
    if (remuneracao !== undefined) userProjectData.remuneracao = remuneracao
    if (horasDiarias !== undefined) userProjectData.horasDiarias = horasDiarias
    if (hourlyRate !== undefined) userProjectData.hourlyRate = hourlyRate
    if (deptId !== undefined) userProjectData.departmentId = deptId

    if (Object.keys(userProjectData).length > 0) {
      await prisma.userProject.update({
        where: { userId_projectId: { userId, projectId: projetoId } },
        data: userProjectData,
      })
    }

    // 3. Handle gerente role via projectRoleService (uses correct role cuid)
    if (makeGerente === true) {
      await setProjectManagerRole(userId, projetoId, tenantId)
    } else if (makeGerente === false) {
      await removeProjectRole(userId, projetoId)
    }

    revalidatePath(`/projetos/${projetoId}/stakeholders`)
    revalidatePath(`/projetos/${projetoId}/membros`)
    revalidatePath(`/projetos/${projetoId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar membro' }
  }
}

export async function getUserProjetosAction(userId: string) {
  try {
    await verifySession()
    return await projectsApi.getUserProjects(userId)
  } catch {
    return []
  }
}

export async function retryMacroFasesSyncAction(projectId: string) {
  try {
    const session = await verifySession()
    await requireProjectPermission(session, projectId, 'projeto:editar')
    await requireProjectPermission(session, projectId, 'planilha:orcado')
    await requireProjectPermission(session, projectId, 'planilha:realizado-todos')
    const result = await reconcileMacroFases(projectId, session.tenantId, session.userId)
    revalidatePath(`/projetos/${projectId}`)
    revalidatePath(`/projetos/${projectId}/wbs`)
    revalidatePath(`/projetos/${projectId}/planilha-custos`)
    return result
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erro ao sincronizar macrofases' }
  }
}
