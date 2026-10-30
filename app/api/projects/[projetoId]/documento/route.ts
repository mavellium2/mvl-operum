import { NextResponse } from 'next/server'
import { gerenteDoProjeto } from '@/services/gerenteProjeto'
import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { canProjectPermission as can } from '@/services/projectAccess'
import { documentoVigente } from '@/services/documentRevisionService'
import type { ProjetoHeader, Stakeholder } from '@/components/projetos/StakeholderDocument'
import { departamentosDoProjeto } from '@/services/departamentosDoProjeto'
import { linhaInstitucional } from '@/lib/linhaInstitucional'
import { acrescentarPartesDoCadastro, identificarPartesDoCadastro } from '@/lib/partesInteressadas'

function buildAddress(e: {
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
}): string {
  return [
    [e.logradouro, e.numero].filter(Boolean).join(', '),
    e.bairro,
    [e.cidade, e.estado].filter(Boolean).join('/'),
  ]
    .filter(Boolean)
    .join('. ')
}

function formatDate(d: Date): string {
  // startDate é gravado como meia-noite UTC do dia escolhido — usa componentes
  // UTC para evitar "dia anterior" dependendo do TZ do servidor.
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getUTCFullYear()}`
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projetoId: string }> },
) {
  const { projetoId } = await params

  const { tenantId, role, userId } = await verifySession()
  try {
    const canAccess = await can({ tenantId, role, userId }, projetoId, 'documentos:ver')
    if (!canAccess) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const [project, userProjects, projectStakeholders, gerente] = await Promise.all([
      prisma.project.findFirst({
        where: { id: projetoId, tenantId, deletedAt: null },
      }),
      prisma.userProject.findMany({
        // Membros inativados com motivo entram em vermelho; desvinculados não.
        where: { projectId: projetoId, OR: [{ active: true }, { inactiveReason: { not: null } }] },
        include: {
          user: {
            select: {
              name: true,
              email: true,
              phone: true,
              logradouro: true,
              numero: true,
              bairro: true,
              cidade: true,
              estado: true,
              notes: true,
              deletedAt: true,
              isActive: true,
            },
          },
          department: { select: { name: true } },
        },
        orderBy: { order: 'asc' },
      }),
      prisma.projectStakeholder.findMany({
        where: { projectId: projetoId },
        include: { stakeholder: true },
        orderBy: { order: 'asc' },
      }),
      gerenteDoProjeto(projetoId),
    ])

    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    const gerenteProjeto = gerente.nome
    const signatureUrl = gerente.signatureUrl

    const dept = (await departamentosDoProjeto(projetoId, tenantId, project.departamentos))[0] ?? ''
    const semestreLabel =
      project.semestre === '1' ? '1º Semestre' :
      project.semestre === '2' ? '2º Semestre' :
      (project.semestre ?? '')
    const semestreAno = [semestreLabel, project.ano].filter(Boolean).join(' ')
    const categoria = project.semestre === 'ano'
      ? linhaInstitucional({ ...project, departamentos: dept ? [dept] : [] })
      : [project.location ?? 'Stakeholder externo', dept, semestreAno].filter(Boolean).join(' - ')

    const header: ProjetoHeader = {
      categoria,
      nomeProjeto: project.name,
      gerenteProjeto,
      elaboradoPor: '',
      aprovadoPor: '',
      versao: '1.0',
      dataCriacao: project.startDate ? formatDate(project.startDate) : '',
      dataAprovacao: project.startDate ? formatDate(project.startDate) : '',
      logoUrl: project.logoUrl,
      signatureUrl,
    }

    const membros: Stakeholder[] = userProjects
      .filter(up => up.user.deletedAt === null && up.user.isActive)
      .map((up, i) => ({
        ref: String(i + 1).padStart(2, '0'),
        cadastroId: `interno:${up.userId}`,
        nome: up.user.name,
        empresaEquipe: up.department?.name ?? project.name,
        cargoCompetencia: up.role ?? '',
        email: up.user.email ?? '',
        telefoneFax: up.user.phone ?? '',
        endereco: buildAddress(up.user),
        observacoes: up.user.notes ?? '',
        ...(up.active === false ? { inativo: true, motivoInativo: up.inactiveReason ?? '' } : {}),
      }))

    const externos: Stakeholder[] = projectStakeholders.map((ps, i) => ({
      ref: String(membros.length + i + 1).padStart(2, '0'),
      cadastroId: `externo:${ps.stakeholder.id}`,
      nome: ps.stakeholder.name,
      empresaEquipe: ps.stakeholder.company ?? '',
      cargoCompetencia: ps.stakeholder.competence ?? '',
      email: ps.stakeholder.email ?? '',
      telefoneFax: ps.stakeholder.phone ?? '',
      endereco: buildAddress(ps.stakeholder),
      observacoes: ps.stakeholder.notes ?? '',
      ...(ps.stakeholder.isActive === false
        ? { inativo: true, motivoInativo: ps.stakeholder.inactiveReason ?? '' }
        : {}),
    }))

    // Após adicionar ao projeto, a tabela precisa do cadastro atual, não da versão aprovada antiga.
    if (new URL(request.url).searchParams.get('origem') === 'cadastro') {
      return NextResponse.json({ header, stakeholders: [...membros, ...externos] })
    }

    // Snapshots antigos não têm a marca de inativo: cruza pelo nome com os inativos atuais.
    const inativosPorNome = new Map([
      ...projectStakeholders
        .filter(ps => ps.stakeholder.isActive === false)
        .map(ps => [ps.stakeholder.name.trim().toLowerCase(), ps.stakeholder.inactiveReason ?? ''] as const),
      ...userProjects
        .filter(up => up.active === false)
        .map(up => [up.user.name.trim().toLowerCase(), up.inactiveReason ?? ''] as const),
    ])

    const vigente = await documentoVigente({ tenantId, role, userId }, projetoId, 'STAKEHOLDER')
    const payload = vigente?.payload as { header?: Partial<ProjetoHeader>; stakeholders?: Stakeholder[]; cadastrosExcluidos?: string[] } | null | undefined
    if (payload && Array.isArray(payload.stakeholders)) {
      payload.stakeholders = payload.stakeholders.map(row =>
        row.inativo === undefined && inativosPorNome.has(row.nome.trim().toLowerCase())
          ? { ...row, inativo: true, motivoInativo: inativosPorNome.get(row.nome.trim().toLowerCase()) }
          : row,
      )
    }
    // A categoria é automática e vem do cadastro atual (inclusive o ano AMS).
    // Atualiza só a leitura de trabalho; os snapshots históricos não são regravados.
    const cadastro = [...membros, ...externos]
    const linhasSalvas = payload?.stakeholders ?? []
    const atuais = acrescentarPartesDoCadastro(identificarPartesDoCadastro(linhasSalvas, cadastro), cadastro, payload?.cadastrosExcluidos)
    return NextResponse.json(payload
      ? { ...payload, header: { ...payload.header, nomeProjeto: header.nomeProjeto, gerenteProjeto: header.gerenteProjeto, logoUrl: header.logoUrl, categoria: header.categoria, signatureUrl: header.signatureUrl }, stakeholders: atuais, cadastroAtualizado: atuais.length > linhasSalvas.length }
      : { header, stakeholders: cadastro })
  } catch (err) {
    console.error('[documento/route]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
