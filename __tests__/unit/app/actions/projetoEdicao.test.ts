// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/projectAccess', () => ({ requireProjectPermission: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u1', tenantId: 't1', role: 'admin' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/services/planilhaService', () => ({ planilhaDoProjeto: vi.fn().mockResolvedValue({ macrofases: [{ nodeId: 'f1', totalOrcado: 500, totalReal: 120 }] }) }))
vi.mock('@/services/wbsService', () => ({ deleteNode: vi.fn().mockResolvedValue({ serverVersion: 2 }), getTree: vi.fn() }))
vi.mock('@/services/sprintHistoricoService', () => ({
  MOTIVO_MINIMO: 5,
  resumoDaSprint: vi.fn().mockResolvedValue({ projectId: 'p1', nome: '1.1 Escopo', cards: 3, segundosRegistrados: 7200 }),
  sprintTemDados: vi.fn().mockReturnValue(true),
}))
vi.mock('@/services/projetoVersoes', () => ({ registrarVersaoProjeto: vi.fn().mockResolvedValue(3), listarVersoesProjeto: vi.fn().mockResolvedValue([]) }))

const nos: Record<string, { id: string; title: string; code: string; parentId: string | null; properties: object }> = {
  raiz: { id: 'raiz', title: 'Projeto', code: '1', parentId: null, properties: {} },
  f1: { id: 'f1', title: 'Escopo', code: '1.1', parentId: 'raiz', properties: { sprintId: 's1' } },
  a1: { id: 'a1', title: 'Atividade', code: '1.1.1', parentId: 'f1', properties: { cardId: 'c1' } },
  a2: { id: 'a2', title: 'Outra', code: '1.1.2', parentId: 'f1', properties: { cardId: 'c2' } },
}
vi.mock('@/lib/prisma', () => ({
  default: {
    wbsNode: {
      findFirst: vi.fn(async ({ where }: { where: { id?: string; parentId?: null } }) => (where.id ? nos[where.id] ?? null : where.parentId === null ? nos.raiz : null)),
      findMany: vi.fn(async ({ where }: { where: { parentId?: string; id?: { in: string[] } } }) =>
        where.id ? where.id.in.map(id => nos[id]) : Object.values(nos).filter(n => n.parentId === where.parentId)),
    },
    card: { count: vi.fn().mockResolvedValue(2) },
    projectMacroFase: { findMany: vi.fn().mockResolvedValue([{ id: 'm1', fase: ' escopo ' }, { id: 'm2', fase: 'Outra fase' }]), deleteMany: vi.fn() },
  },
}))

import prisma from '@/lib/prisma'
import { deleteNode } from '@/services/wbsService'
import { registrarVersaoProjeto } from '@/services/projetoVersoes'
import { excluirFaseAction, impactoExclusaoFaseAction } from '@/app/actions/projetoEdicao'

beforeEach(() => vi.clearAllMocks())

describe('excluir macro fase pelo Editar projeto', () => {
  it('calcula o impacto: itens da EAP, tarefas, sprint com dados e custos', async () => {
    const r = await impactoExclusaoFaseAction('p1', 'f1')
    expect(r).toEqual({ impacto: expect.objectContaining({
      fase: 'Escopo', codigo: '1.1', itensEap: 2, tarefas: 2, orcado: 500, realizado: 120, exigeMotivo: true,
      sprints: [{ nome: '1.1 Escopo', tarefas: 3, segundosRegistrados: 7200, comDados: true }],
    }) })
  })

  it('exclui pela rotina da EAP (com motivo), tira a fase do cadastro de macro fases e grava a versão', async () => {
    const versao = { conteudo: { form: {} as never, fases: [] }, alteracoes: ['Fase 1.1 Escopo excluída'] }
    const r = await excluirFaseAction('p1', 'f1', 'Fase cancelada pelo cliente', versao as never)
    expect(r).toEqual({ ok: true })
    expect(deleteNode).toHaveBeenCalledWith({ nodeId: 'f1', projectId: 'p1', tenantId: 't1', motivoExclusao: 'Fase cancelada pelo cliente' }, 'u1')
    expect(prisma.projectMacroFase.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['m1'] }, projectId: 'p1' } })
    expect(registrarVersaoProjeto).toHaveBeenCalledWith({ tenantId: 't1', projectId: 'p1', userId: 'u1' }, versao)
  })

  it('não exclui o que não é macro fase nem aceita motivo curto', async () => {
    expect(await excluirFaseAction('p1', 'a1', '')).toEqual({ error: expect.stringContaining('macro fases') })
    expect(await excluirFaseAction('p1', 'f1', 'abc')).toEqual({ error: expect.stringContaining('motivo') })
    expect(deleteNode).not.toHaveBeenCalled()
  })
})
