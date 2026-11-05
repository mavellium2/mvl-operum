// @vitest-environment node
import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { listarVersoesPlanilha, registrarVersaoPlanilha, restaurarVersaoPlanilha } from '@/services/planilhaVersoes'

const enabled = process.env.OPERUM_PLANILHA_HISTORY_TEST === '1'
describe.skipIf(!enabled)('histórico restaurável da planilha — PostgreSQL', () => {
  let tenantId: string, projectId: string, userId: string, nodeId: string, cardId: string
  const ctx = () => ({ tenantId, projectId, userId })
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!)
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Testes somente em banco local com tenant isolado.')
    const key = randomUUID()
    tenantId = (await prisma.tenant.create({ data: { name: key, subdomain: `history-${key}` } })).id
    userId = (await prisma.user.create({ data: { tenantId, name: 'Teste histórico', email: `${key}@history.test`, passwordHash: 'test-only' } })).id
    projectId = (await prisma.project.create({ data: { tenantId, name: key, departamentos: [] } })).id
    cardId = (await prisma.card.create({ data: { projectId, title: 'Inicial', description: 'Descrição inicial', priority: 'baixa' } })).id
    nodeId = (await prisma.wbsNode.create({ data: { tenantId, projectId, order: 0, code: '1', title: 'Projeto', style: {}, properties: { cardId, tempoRealMinutos: 12 } } })).id
  })
  afterAll(async () => {
    if (tenantId) {
      // Somente os dados do tenant criado por esta suíte são removidos.
      await prisma.$executeRaw`DELETE FROM files."Attachment" WHERE "cardId" IN (SELECT "id" FROM "Card" WHERE "projectId" = ${projectId})`
      await prisma.card.deleteMany({ where: { projectId } })
      await prisma.project.deleteMany({ where: { id: projectId, tenantId } })
      await prisma.auditLog.deleteMany({ where: { tenantId } })
      await prisma.user.deleteMany({ where: { tenantId } })
      await prisma.tenant.deleteMany({ where: { id: tenantId } })
    }
    await prisma.$disconnect()
  })
  it('deduplica versões iguais, restaura conteúdo e mantém as versões anteriores', async () => {
    expect(await registrarVersaoPlanilha(ctx())).toBe(1)
    expect(await registrarVersaoPlanilha(ctx())).toBe(1)
    await prisma.wbsNode.update({ where: { id: nodeId }, data: { title: 'Mudou', properties: { tempoRealMinutos: 40, cardId } } })
    await prisma.card.update({ where: { id: cardId }, data: { description: 'Mudou', priority: 'alta' } })
    expect(await registrarVersaoPlanilha(ctx())).toBe(2)
    expect(await restaurarVersaoPlanilha(ctx(), 1, 2)).toBe(3)
    expect((await prisma.wbsNode.findUniqueOrThrow({ where: { id: nodeId } })).title).toBe('Projeto')
    expect((await prisma.card.findUniqueOrThrow({ where: { id: cardId } })).priority).toBe('baixa')
    expect((await listarVersoesPlanilha(tenantId, projectId)).map(v => v.numero)).toEqual([3, 2, 1])
    await expect(restaurarVersaoPlanilha(ctx(), 2, 2)).rejects.toThrow('histórico mudou')
    expect((await listarVersoesPlanilha(tenantId, projectId))).toHaveLength(3)
  })
  it('não permite ler ou restaurar outro tenant e não perde alterações sem snapshot', async () => {
    expect(await listarVersoesPlanilha('outro-tenant', projectId)).toEqual([])
    await expect(restaurarVersaoPlanilha({ ...ctx(), tenantId: 'outro-tenant' }, 1, 3)).rejects.toThrow('Projeto não encontrado')
    await prisma.card.update({ where: { id: cardId }, data: { description: 'Edição em outra tela' } })
    expect(await restaurarVersaoPlanilha(ctx(), 2, 3)).toBe(5)
    expect((await listarVersoesPlanilha(tenantId, projectId)).map(v => v.numero)).toEqual([5, 4, 3, 2, 1])
  })
  it('restaura anexos, comentários e lançamentos sem recriar os registros', async () => {
    const attachment = await prisma.attachment.create({ data: { cardId, fileName: 'escopo.txt', fileType: 'text/plain', filePath: 'test-only', fileSize: 5 } })
    const fileId = `history-file-${randomUUID()}`
    await prisma.$executeRaw`INSERT INTO files."Attachment" ("id", "cardId", "fileName", "fileType", "filePath", "fileSize", "updatedAt") VALUES (${fileId}, ${cardId}, 'real.txt', 'text/plain', 'test-only', 5, NOW())`
    const comment = await prisma.comment.create({ data: { cardId, userId, content: 'Original' } })
    const entry = await prisma.timeEntry.create({ data: { cardId, userId, isManual: true, duration: 120, endedAt: new Date() } })
    expect(await registrarVersaoPlanilha(ctx())).toBe(6)
    await prisma.attachment.update({ where: { id: attachment.id }, data: { deletedAt: new Date(), fileName: 'mudou.txt' } })
    await prisma.$executeRaw`UPDATE files."Attachment" SET "deletedAt" = NOW(), "fileName" = 'changed.txt' WHERE "id" = ${fileId}`
    await prisma.comment.update({ where: { id: comment.id }, data: { content: 'Mudou' } })
    await prisma.timeEntry.update({ where: { id: entry.id }, data: { duration: 900 } })
    expect(await registrarVersaoPlanilha(ctx())).toBe(7)
    expect(await restaurarVersaoPlanilha(ctx(), 6, 7)).toBe(8)
    expect(await prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } })).toMatchObject({ fileName: 'escopo.txt', deletedAt: null })
    const files = await prisma.$queryRaw<{ fileName: string; deletedAt: Date | null }[]>`SELECT "fileName", "deletedAt" FROM files."Attachment" WHERE "id" = ${fileId}`
    expect(files[0]).toMatchObject({ fileName: 'real.txt', deletedAt: null })
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).content).toBe('Original')
    expect((await prisma.timeEntry.findUniqueOrThrow({ where: { id: entry.id } })).duration).toBe(120)
  })
  it('volta a estrutura e permite recuperar uma atividade criada depois', async () => {
    const card = await prisma.card.create({ data: { projectId, title: 'Nova' } })
    const node = await prisma.wbsNode.create({ data: { projectId, tenantId, parentId: nodeId, order: 0, code: '1.1', title: 'Nova', style: {}, properties: { cardId: card.id } } })
    expect(await registrarVersaoPlanilha(ctx())).toBe(9)
    expect(await restaurarVersaoPlanilha(ctx(), 8, 9)).toBe(10)
    expect(await prisma.wbsNode.findUnique({ where: { id: node.id } })).toBeNull()
    expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).deletedAt).not.toBeNull()
    expect(await restaurarVersaoPlanilha(ctx(), 9, 10)).toBe(11)
    expect(await prisma.wbsNode.findUnique({ where: { id: node.id } })).not.toBeNull()
    expect((await prisma.card.findUniqueOrThrow({ where: { id: card.id } })).deletedAt).toBeNull()
    expect(await Promise.all([registrarVersaoPlanilha(ctx()), registrarVersaoPlanilha(ctx())])).toEqual([11, 11])
  })
  it('impede restauração com cronômetro em andamento e reverte a transação', async () => {
    const timer = await prisma.timeEntry.create({ data: { cardId, userId, isRunning: true } })
    await expect(restaurarVersaoPlanilha(ctx(), 1, 11)).rejects.toThrow('Pare os cronômetros')
    expect((await listarVersoesPlanilha(tenantId, projectId))).toHaveLength(11)
    await prisma.timeEntry.delete({ where: { id: timer.id } })
  })
})
