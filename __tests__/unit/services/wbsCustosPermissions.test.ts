// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Permissao } from '@/lib/permissoes'
import { validarCamposCustos } from '@/lib/permissoesCustos'

const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  wbsNode: { findFirst: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn() },
  userProject: { findMany: vi.fn() },
  cardResponsible: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  card: { findUnique: vi.fn() },
  sprintColumn: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) } }))
import { updateNodeProperties } from '@/services/wbsService'
const permissions = (...p: Permissao[]) => new Set(p)
const input = { nodeId: 'n1', projectId: 'p1', tenantId: 't1', properties: { tempoRealMinutos: 30 } }

beforeEach(() => {
  vi.resetAllMocks()
  tx.$queryRaw.mockResolvedValue([{ id: 'n1' }])
  tx.wbsNode.findFirst.mockResolvedValueOnce({ id: 'n1', properties: { elaboradoPorUserId: 'u1', tempoMinutos: 100 } }).mockResolvedValue({ id: 'root', version: 1 })
  tx.wbsNode.update.mockResolvedValue({ version: 2 })
})

describe('Custos — permissões por campo e responsável persistido', () => {
  it.each(['tempoRealMinutos', 'materiaisReal', 'dataRealizacao', 'percentualConclusao'])('permite %s da própria linha', campo => {
    expect(() => validarCamposCustos(permissions('planilha:realizado-proprio'), 'u1', { elaboradoPorUserId: 'u1' }, { [campo]: 10 })).not.toThrow()
  })
  it.each([null, undefined, '', 'u2'])('recusa realizado próprio sem vínculo por ID (%s)', elaboradoPorUserId => {
    expect(() => validarCamposCustos(permissions('planilha:realizado-proprio'), 'u1', { elaboradoPorUserId, elaboradoPor: 'Mesmo nome' }, { tempoRealMinutos: 10 })).toThrow('Sem permissão')
  })
  it.each(['tempoMinutos', 'materiais', 'dataPrevista', 'elaboradoPorUserId', 'elaboradoPor', 'cost', 'durationDays'])('recusa campo orçado %s para quem só edita realizado', campo => {
    expect(() => validarCamposCustos(permissions('planilha:realizado-proprio'), 'u1', { elaboradoPorUserId: 'u1' }, { [campo]: 10 })).toThrow('Sem permissão')
  })
  it('editar orçado não concede edição do realizado', () => {
    expect(() => validarCamposCustos(permissions('planilha:orcado'), 'u1', {}, { tempoRealMinutos: 10 })).toThrow('Sem permissão')
  })
  it('realizado de todos não concede edição do orçado ou de metadados', () => {
    expect(() => validarCamposCustos(permissions('planilha:realizado-todos'), 'u1', {}, { tempoRealMinutos: 10 })).not.toThrow()
    expect(() => validarCamposCustos(permissions('planilha:realizado-todos'), 'u1', {}, { description: 'alterada' })).toThrow('Sem permissão')
    expect(() => validarCamposCustos(permissions('planilha:realizado-todos'), 'u1', {}, { tempoMinutos: 10 })).toThrow('Sem permissão')
  })
  it('bloqueia tentativa de trocar responsável e realizado na mesma chamada', async () => {
    await expect(updateNodeProperties({ ...input, properties: { elaboradoPorUserId: 'u1', tempoRealMinutos: 30 } }, { userId: 'u2', permissoes: permissions('planilha:realizado-proprio') })).rejects.toThrow('Sem permissão')
    expect(tx.wbsNode.update).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
  it('bloqueia leitura de nó de outro projeto/tenant antes de qualquer gravação', async () => {
    tx.wbsNode.findFirst.mockReset().mockResolvedValue(null)
    await expect(updateNodeProperties(input, { userId: 'u1', permissoes: permissions('planilha:realizado-todos') })).rejects.toThrow('Nó não encontrado')
    expect(tx.wbsNode.findFirst).toHaveBeenCalledWith({ where: { id: 'n1', projectId: 'p1', tenantId: 't1' } })
    expect(tx.wbsNode.update).not.toHaveBeenCalled()
  })
  it('bloqueia a linha antes de conferir responsável; merge e auditoria usam a mesma transação', async () => {
    expect(await updateNodeProperties(input, { userId: 'u1', permissoes: permissions('planilha:realizado-proprio') })).toEqual({ serverVersion: 2, responsaveisAdicionados: [], cardId: null })
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.wbsNode.findFirst.mock.invocationCallOrder[0])
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { properties: { elaboradoPorUserId: 'u1', tempoMinutos: 100, tempoRealMinutos: 30 } } })
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: { tenantId: 't1', userId: 'u1', action: 'PLANILHA_EDITAR', entity: 'WbsNode', entityId: 'n1', details: { projetoId: 'p1', campos: ['tempoRealMinutos'] } } })
  })
})

describe('vínculo com card/sprint (auditoria 24/10)', () => {
  it('editar propriedades não troca o card nem a sprint ligados ao nó', async () => {
    tx.wbsNode.findFirst.mockReset()
      .mockResolvedValueOnce({ id: 'n1', properties: { cardId: 'c1', tempoMinutos: 100 } })
      .mockResolvedValue({ id: 'root', version: 1 })
    const r = await updateNodeProperties(
      { ...input, properties: { cardId: 'c-outra-instituicao', sprintId: 's-outra', tempoMinutos: 120 } },
      { userId: 'g', permissoes: permissions('planilha:orcado') },
    )
    expect(r.cardId).toBe('c1')
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { properties: { cardId: 'c1', tempoMinutos: 120 } } })
  })
})

describe('Elaborado por = responsáveis do card', () => {
  const orcado = permissions('planilha:orcado')
  const membros = (...ids: string[]) => ids.map(id => ({ userId: id, user: { name: id.toUpperCase() } }))

  it('grava a lista com nomes do cadastro e acerta os responsáveis do card ligado', async () => {
    tx.wbsNode.findFirst.mockReset()
      .mockResolvedValueOnce({ id: 'n1', properties: { cardId: 'c1', elaboradoPorUserId: 'ana' } })
      .mockResolvedValue({ id: 'root', version: 1 })
    tx.userProject.findMany.mockResolvedValue(membros('ana', 'caio'))
    tx.cardResponsible.findMany.mockResolvedValue([{ userId: 'ana' }, { userId: 'bia' }])
    const r = await updateNodeProperties({ ...input, properties: { elaboradoPorUserIds: ['ana', 'caio'], elaboradoPor: 'nome do cliente' } }, { userId: 'g', permissoes: orcado })
    expect(r).toMatchObject({ responsaveisAdicionados: ['caio'], cardId: 'c1' })
    expect(tx.cardResponsible.deleteMany).toHaveBeenCalledWith({ where: { cardId: 'c1', userId: { in: ['bia'] } } })
    expect(tx.cardResponsible.createMany).toHaveBeenCalledWith({ data: [{ cardId: 'c1', userId: 'caio' }], skipDuplicates: true })
    expect(tx.wbsNode.update.mock.calls[0][0].data.properties).toMatchObject({
      elaboradoPorUserIds: ['ana', 'caio'], elaboradoPorUserId: 'ana', elaboradoPor: 'ANA, CAIO', elaboradoSincronizado: true,
    })
  })

  it('recusa quem não é membro ativo do projeto, sem gravar nada', async () => {
    tx.wbsNode.findFirst.mockReset().mockResolvedValueOnce({ id: 'n1', properties: { cardId: 'c1' } })
    tx.userProject.findMany.mockResolvedValue(membros('ana'))
    await expect(updateNodeProperties({ ...input, properties: { elaboradoPorUserIds: ['ana', 'estranho'] } }, { userId: 'g', permissoes: orcado })).rejects.toThrow('membros ativos')
    expect(tx.cardResponsible.createMany).not.toHaveBeenCalled()
    expect(tx.wbsNode.update).not.toHaveBeenCalled()
  })

  it('nó sem card: só grava a lista no nó', async () => {
    tx.wbsNode.findFirst.mockReset().mockResolvedValueOnce({ id: 'n1', properties: {} }).mockResolvedValue({ id: 'root', version: 1 })
    tx.userProject.findMany.mockResolvedValue(membros('ana'))
    const r = await updateNodeProperties({ ...input, properties: { elaboradoPorUserIds: ['ana'] } }, { userId: 'g', permissoes: orcado })
    expect(r).toMatchObject({ responsaveisAdicionados: [], cardId: null })
    expect(tx.cardResponsible.findMany).not.toHaveBeenCalled()
  })

  it('quem só edita o realizado não troca os elaboradores', async () => {
    tx.wbsNode.findFirst.mockReset().mockResolvedValueOnce({ id: 'n1', properties: { elaboradoPorUserIds: ['u1'] } })
    await expect(updateNodeProperties({ ...input, properties: { elaboradoPorUserIds: ['u1', 'u2'] } }, { userId: 'u1', permissoes: permissions('planilha:realizado-proprio') })).rejects.toThrow('Sem permissão')
  })
})

describe('Elaborado por vazio com card em "Em andamento" ou depois (ADR-045)', () => {
  it('recusa esvaziar: o card não pode ficar sem responsável', async () => {
    tx.wbsNode.findFirst.mockReset().mockResolvedValueOnce({ id: 'n1', properties: { cardId: 'c1', elaboradoPorUserIds: ['ana'] } })
    tx.card.findUnique.mockResolvedValue({ sprintId: 's1', sprintColumnId: 'doing' })
    tx.sprintColumn.findMany.mockResolvedValue([{ id: 'todo', title: 'A Fazer', position: 0 }, { id: 'doing', title: 'Em andamento', position: 1 }])
    await expect(updateNodeProperties({ ...input, properties: { elaboradoPorUserIds: [] } }, { userId: 'g', permissoes: permissions('planilha:orcado') })).rejects.toThrow('precisa de pelo menos um responsável')
    expect(tx.cardResponsible.deleteMany).not.toHaveBeenCalled()
  })

  it('em "A Fazer" pode esvaziar', async () => {
    tx.wbsNode.findFirst.mockReset().mockResolvedValueOnce({ id: 'n1', properties: { cardId: 'c1', elaboradoPorUserIds: ['ana'] } }).mockResolvedValue({ id: 'root', version: 1 })
    tx.card.findUnique.mockResolvedValue({ sprintId: 's1', sprintColumnId: 'todo' })
    tx.sprintColumn.findMany.mockResolvedValue([{ id: 'todo', title: 'A Fazer', position: 0 }, { id: 'doing', title: 'Em andamento', position: 1 }])
    tx.cardResponsible.findMany.mockResolvedValue([{ userId: 'ana' }])
    await updateNodeProperties({ ...input, properties: { elaboradoPorUserIds: [] } }, { userId: 'g', permissoes: permissions('planilha:orcado') })
    expect(tx.cardResponsible.deleteMany).toHaveBeenCalledWith({ where: { cardId: 'c1', userId: { in: ['ana'] } } })
  })
})

