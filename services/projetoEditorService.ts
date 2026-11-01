import 'server-only'
import { z } from 'zod'
import type { Prisma } from '@/lib/generated/prisma'
import { ConteudoVersaoSchema, RegistroVersaoSchema, type RegistroVersao } from '@/lib/projetoVersaoSchema'
import { validarProjeto } from '@/lib/validacaoProjeto'
import type { SessaoAuthz } from './authz'
import { executarOperacaoProjeto } from './projetoOperacaoService'
import { registrarVersaoProjetoEmTransacao } from './projetoVersoes'
import { syncMacrofasesComEapInTransaction } from './wbsService'
import { syncProjetoDepartamentos } from './projetoDepartamentos'
import { setProjectManagerRole, removeProjectRole } from './projectRoleService'
import { submeterDocumento } from './documentRevisionService'

const DadosEditor = ConteudoVersaoSchema.shape.form.partial().extend({
  ano: z.union([z.string(), z.number()]).optional(),
  anoAms: z.enum(['1', '2']).nullable().optional(),
  turno: z.string().max(30).optional(),
  macroFases: ConteudoVersaoSchema.shape.fases.element.extend({ nodeId: z.string().max(128).optional() }).array().max(500).optional(),
})

async function renomear(tx: Prisma.TransactionClient, projectId: string, tenantId: string, fases: { fase: string; nodeId?: string }[]) {
  const root = await tx.wbsNode.findFirst({ where: { projectId, tenantId, parentId: null }, select: { id: true } })
  if (!root) { if (fases.some(f => f.nodeId)) throw new Error('Uma fase foi removida. Atualize a tela antes de salvar.'); return }
  const nodes = await tx.wbsNode.findMany({ where: { projectId, tenantId, parentId: root.id }, select: { id: true, title: true } })
  const nomes = new Map(fases.filter(f => f.nodeId).map(f => [f.nodeId!, f.fase.trim()]))
  if ([...nomes.keys()].some(id => !nodes.some(n => n.id === id))) throw new Error('Uma fase foi removida. Atualize a tela antes de salvar.')
  const finais = nodes.map(n => (nomes.get(n.id) ?? n.title).trim().toLowerCase())
  if (new Set(finais).size !== finais.length) throw new Error('Há nomes de fases repetidos na EAP. Confira os nomes antes de salvar.')
  let mudou = false
  for (const node of nodes) {
    const title = nomes.get(node.id)
    if (title && title !== node.title) { await tx.wbsNode.update({ where: { id: node.id }, data: { title } }); mudou = true }
  }
  if (mudou) await tx.wbsNode.update({ where: { id: root.id }, data: { version: { increment: 1 } } })
}

/** Unidade de gravação do editor: sem HTTP ou transações independentes no meio. */
export async function salvarProjetoEditor(
  session: SessaoAuthz, projectId: string, input: Record<string, unknown>, complementares: Record<string, unknown>, registro: RegistroVersao,
) {
  const dados = DadosEditor.parse(input)
  const versao = RegistroVersaoSchema.parse(registro)
  const erro = validarProjeto({ ...dados, ...complementares })[0]
  if (erro) throw new Error(erro.mensagem)
  return executarOperacaoProjeto(session, projectId, versao.operacaoId, { tipo: 'salvar', dados, complementares, versao }, async tx => {
    const atual = await tx.project.findFirst({ where: { id: projectId, tenantId: session.tenantId, deletedAt: null } })
    if (!atual) throw new Error('Projeto não encontrado')
    const { macroFases, initialMemberId, ano, startDate, endDate, ...fields } = dados
    if (dados.anoAms && (dados.semestre ?? atual.semestre) !== 'ano') throw new Error('Ano do AMS só pode ser informado no período Ano')
    const year = ano === undefined ? undefined : ano === '' ? null : Number(ano)
    if (year !== undefined && year !== null && !Number.isInteger(year)) throw new Error('Informe um ano válido para o projeto.')
    await tx.project.update({ where: { id: projectId }, data: {
      ...fields,
      ...(dados.semestre !== undefined && dados.semestre !== 'ano' ? { anoAms: null } : {}),
      ...(year !== undefined ? { ano: year } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
    } })
    let fasesSincronizadas: { fase: string; nodeId: string }[] = []
    if (macroFases !== undefined) {
      await renomear(tx, projectId, session.tenantId, macroFases)
      const phases = macroFases.filter(f => f.fase.trim()).map(({ fase, dataLimite, custo }) => ({ fase: fase.trim(), dataLimite, custo }))
      await tx.projectMacroFase.deleteMany({ where: { projectId } })
      if (phases.length) await tx.projectMacroFase.createMany({ data: phases.map((f, position) => ({ projectId, position, ...f })) })
      const projeto = await tx.project.update({ where: { id: projectId }, data: { macroFasesRevision: { increment: 1 }, macroFasesSyncError: null } })
      const nodes = await syncMacrofasesComEapInTransaction(tx, projectId, session.tenantId, phases, session.userId)
      fasesSincronizadas = phases.map(f => ({ fase: f.fase, nodeId: nodes.get(f.fase.toLowerCase())! }))
      await tx.project.update({ where: { id: projectId }, data: { macroFasesSyncedRevision: projeto.macroFasesRevision } })
    }
    if (dados.departamentos !== undefined) await syncProjetoDepartamentos(projectId, session.tenantId, dados.departamentos, tx)
    if (initialMemberId !== undefined) {
      if (initialMemberId) {
        if (!(await tx.user.findFirst({ where: { id: initialMemberId, tenantId: session.tenantId }, select: { id: true } }))) throw new Error('Gerente não encontrado nesta instituição.')
        await tx.userProject.upsert({ where: { userId_projectId: { userId: initialMemberId, projectId } }, create: { userId: initialMemberId, projectId }, update: { active: true, inactiveReason: null, inactivatedAt: null } })
        await setProjectManagerRole(initialMemberId, projectId, session.tenantId, tx)
      } else {
        const gerente = await tx.userProjectRole.findFirst({ where: { projectId, deletedAt: null, role: { is: { nameKey: 'gerente', scope: 'PROJETO' } } }, select: { userId: true } })
        if (gerente) await removeProjectRole(gerente.userId, projectId, tx)
      }
    }
    if (Object.keys(complementares).length) {
      const previous = await tx.documentVersion.findFirst({ where: { projectId, documentType: 'CHARTER', status: 'APPROVED' }, orderBy: [{ approvedAt: 'desc' }, { sequence: 'desc' }] })
      await submeterDocumento(session, projectId, 'CHARTER', { ...((previous?.payload as object) ?? {}), ...complementares }, { commitTitle: 'Dados complementares atualizados na edição do projeto', versao: previous?.versao ?? '1.0', elaboradoPor: '', aprovadoPor: '', dataAprovacao: '' }, '', tx)
    }
    const numero = await registrarVersaoProjetoEmTransacao(tx, { tenantId: session.tenantId, projectId, userId: session.userId }, versao)
    return { projeto: { id: projectId }, macroFasesSync: { pending: false }, numero, fasesSincronizadas }
  })
}
