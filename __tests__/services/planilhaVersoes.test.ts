// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { tx, db } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(), $executeRaw: vi.fn(),
    project: { findFirst: vi.fn() }, user: { findFirst: vi.fn() },
    wbsNode: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    card: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    sprint: { findMany: vi.fn(), updateMany: vi.fn() },
    attachment: { updateMany: vi.fn(), update: vi.fn() },
    comment: { updateMany: vi.fn() }, timeEntry: { count: vi.fn(), updateMany: vi.fn() },
    cardResponsible: { deleteMany: vi.fn() }, auditLog: { create: vi.fn() },
    planilhaVersao: { findFirst: vi.fn(), create: vi.fn() },
  }
  return { tx, db: { $transaction: vi.fn((callback: (transaction: unknown) => unknown) => callback(tx)) } }
})
vi.mock('@/lib/prisma', () => ({ default: db }))
import { garantirVersaoInicialPlanilha, restaurarVersaoPlanilha } from '@/services/planilhaVersoes'
const ctx = { tenantId: 'tenant', projectId: 'project', userId: 'user' }
const card = { id: 'card', title: 'Atividade', description: '', priority: 'baixa', startDate: null, endDate: null, sprintId: null, sprintColumnId: null, sprintPosition: 0, responsibles: [], comments: [], timeEntries: [] }
const content = { nodes: [], cards: [{ ...card, attachments: [] }], sprints: [], fileAttachments: [] }
beforeEach(() => {
  vi.clearAllMocks()
  tx.project.findFirst.mockResolvedValue({ id: 'project' })
  tx.user.findFirst.mockResolvedValue({ name: 'Usuário' })
  tx.wbsNode.findMany.mockResolvedValue([])
  tx.card.findMany.mockImplementation(async args => {
    if (args.select.attachments) throw new Error('public.Attachment não existe')
    return [card]
  })
  tx.card.findFirst.mockResolvedValue({ id: 'card' })
  tx.sprint.findMany.mockResolvedValue([])
  tx.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => {
    const query = sql.join('')
    if (query.includes('to_regclass')) return [{ present: false }]
    if (query.includes('FROM public."Attachment"')) throw new Error('public.Attachment não existe')
    return []
  })
  tx.planilhaVersao.findFirst.mockResolvedValue(null)
  tx.timeEntry.count.mockResolvedValue(0)
})
describe('histórico sem tabela legada de anexos', () => {
  it('abre a planilha e cria a versão inicial usando anexos atuais', async () => {
    expect(await garantirVersaoInicialPlanilha(ctx)).toBe(1)
    expect(tx.planilhaVersao.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ conteudo: content }) }))
  })
  it('restaura sem consultar ou atualizar anexos legados ausentes', async () => {
    tx.planilhaVersao.findFirst.mockResolvedValue({ numero: 1, conteudo: content })
    expect(await restaurarVersaoPlanilha(ctx, 1, 1)).toBe(2)
    expect(tx.attachment.updateMany).not.toHaveBeenCalled()
    expect(tx.attachment.update).not.toHaveBeenCalled()
    expect(tx.$executeRaw).toHaveBeenCalled()
  })
})
