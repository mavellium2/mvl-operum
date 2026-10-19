// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { documentoVigente, submeterDocumento, revisarDocumento, salvarRascunho, rascunhoDocumento, excluirAta, excluirVersao } from '@/services/documentRevisionService'
import type { SessaoAuthz } from '@/services/authz'

const testUrl = process.env.OPERUM_DOCUMENT_TEST_DATABASE_URL
const meta = { commitTitle: 'Proposta de teste', versao: '2.0', elaboradoPor: 'Membro', aprovadoPor: '', dataAprovacao: '' }
let member: SessaoAuthz
let manager: SessaoAuthz
let projectId: string
let foreignProjectId: string
let otherProjectId: string
let foreignUserId: string

// Banco dedicado obrigatório: nunca executa com DATABASE_URL sozinho.
describe.skipIf(!testUrl)('revisões documentais — PostgreSQL real', () => {
  beforeAll(() => {
    const url = new URL(testUrl!)
    if (url.pathname !== '/operum_document_test' || !['localhost', '127.0.0.1'].includes(url.hostname) || process.env.DATABASE_URL !== testUrl) {
      throw new Error('Use exclusivamente o banco local operum_document_test com as duas variáveis iguais')
    }
  })
  beforeEach(async () => {
    const id = randomUUID()
    const tenant = await prisma.tenant.create({ data: { name: `Documento ${id}`, subdomain: `doc-${id}` } })
    const foreign = await prisma.tenant.create({ data: { name: `Outro ${id}`, subdomain: `outro-${id}` } })
    const author = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Membro', email: `${id}@author.test`, passwordHash: 'test-only' } })
    const approver = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Gerente', email: `${id}@manager.test`, passwordHash: 'test-only' } })
    const other = await prisma.user.create({ data: { tenantId: foreign.id, name: 'Outro', email: `${id}@other.test`, passwordHash: 'test-only' } })
    foreignUserId = other.id
    const project = await prisma.project.create({ data: { tenantId: tenant.id, name: `Projeto ${id}`, justificativa: 'Vigente' } })
    projectId = project.id
    otherProjectId = (await prisma.project.create({ data: { tenantId: tenant.id, name: `Sem vínculo ${id}` } })).id
    foreignProjectId = (await prisma.project.create({ data: { tenantId: foreign.id, name: `Outro projeto ${id}` } })).id
    await prisma.userProject.createMany({ data: [{ userId: author.id, projectId }, { userId: approver.id, projectId }] })
    const role = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Gerente', nameKey: 'gerente', scope: 'PROJETO' } })
    await prisma.userProjectRole.create({ data: { userId: approver.id, projectId, roleId: role.id } })
    member = { userId: author.id, tenantId: tenant.id, role: 'member' }
    manager = { userId: approver.id, tenantId: tenant.id, role: 'member' }
  })
  afterAll(async () => { await prisma.$disconnect() })

  it('membro salva PENDING; só aprovação publica o Termo e ambos gravam auditoria', async () => {
    const version = await submeterDocumento(member, projectId, 'CHARTER', { justificativa: 'Proposta' }, meta)
    expect(version.status).toBe('PENDING')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).justificativa).toBe('Vigente')
    expect(await documentoVigente(member, projectId, 'CHARTER')).toBeNull()
    await expect(revisarDocumento(member, projectId, version.id, 'approve')).rejects.toThrow(/permissão/i)
    await revisarDocumento(manager, projectId, version.id, 'approve')
    expect((await documentoVigente(member, projectId, 'CHARTER'))?.payload).toMatchObject({ justificativa: 'Proposta' })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).justificativa).toBe('Proposta')
    const logs = await prisma.auditLog.findMany({ where: { tenantId: member.tenantId, entityId: projectId }, orderBy: { timestamp: 'asc' } })
    expect(logs.map(log => log.action)).toEqual(['DOCUMENTO_VERSAO', 'DOCUMENTO_APROVAR'])
    expect(logs.map(log => log.userId)).toEqual([member.userId, manager.userId])
  })

  it('submissão parcial do Termo preserva os demais campos dentro do snapshot', async () => {
    await submeterDocumento(manager, projectId, 'CHARTER', { justificativa: 'Texto preservado', objetivos: 'Objetivo inicial', macroFases: [{ fase: 'Planejamento', custo: '100' }] }, meta)
    const pending = await submeterDocumento(member, projectId, 'CHARTER', { objetivos: 'Novo objetivo' }, meta)
    expect(pending.payload).toMatchObject({ justificativa: 'Texto preservado', objetivos: 'Novo objetivo', macroFases: [{ fase: 'Planejamento', custo: '100' }] })
    await revisarDocumento(manager, projectId, pending.id, 'approve')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).justificativa).toBe('Texto preservado')
  })

  it('snapshot e diff persistem com autor, referência anterior e cabeçalho, sem mudar na aprovação', async () => {
    const first = await submeterDocumento(manager, projectId, 'CHARTER', { categoria: 'Faculdade', objetivos: 'Antes', documentContext: { nomeProjeto: 'Nome original', gerenteProjeto: 'Gerente', membros: [{ name: 'Autor' }] } }, meta)
    const pending = await submeterDocumento(member, projectId, 'CHARTER', { objetivos: 'Depois' }, meta)
    expect(pending.previousVersionId).toBe(first.id)
    expect(pending.changes).toContainEqual({ field: 'objetivos', before: 'Antes', after: 'Depois' })
    expect(pending.authorId).toBe(member.userId)
    expect(pending.createdAt).toBeInstanceOf(Date)
    await prisma.project.update({ where: { id: projectId }, data: { name: 'Nome atual' } })
    await revisarDocumento(manager, projectId, pending.id, 'approve')
    const saved = await prisma.documentVersion.findUniqueOrThrow({ where: { id: pending.id } })
    expect(saved.payload).toEqual(pending.payload)
    expect(saved.changes).toEqual(pending.changes)
    expect(saved.payload).toMatchObject({ categoria: 'Faculdade', documentContext: { nomeProjeto: 'Nome original' } })
  })

  it('Termo captura macrofases da WBS e sua aprovação não altera a planilha', async () => {
    const root = await prisma.wbsNode.create({ data: { projectId, tenantId: member.tenantId, parentId: null, order: 0, code: '1', title: 'Raiz', style: {}, properties: {} } })
    const phase = await prisma.wbsNode.create({ data: { projectId, tenantId: member.tenantId, parentId: root.id, order: 0, code: '1.1', title: 'Fase vigente', style: {}, properties: { custo: '150', elaboradoPorUserId: member.userId } } })
    const pending = await submeterDocumento(member, projectId, 'CHARTER', { objetivos: 'Proposta' }, meta)
    expect(pending.payload).toMatchObject({ macroFases: [{ fase: 'Fase vigente', custo: '150' }] })
    await revisarDocumento(manager, projectId, pending.id, 'approve')
    const node = await prisma.wbsNode.findUniqueOrThrow({ where: { id: phase.id } })
    expect(node.title).toBe('Fase vigente')
    expect(node.properties).toEqual({ custo: '150', elaboradoPorUserId: member.userId })
  })

  it('ajuste DENY da 5.1 bloqueia edição mesmo com o padrão de membro', async () => {
    const permission = await prisma.permission.upsert({ where: { resource_action: { resource: 'documentos', action: 'editar' } }, update: {}, create: { name: 'documentos:editar', resource: 'documentos', action: 'editar' } })
    await prisma.userPermission.create({ data: { userId: member.userId, projectId, permissionId: permission.id, effect: 'DENY' } })
    await expect(submeterDocumento(member, projectId, 'CHARTER', {}, meta)).rejects.toThrow(/permissão/i)
    expect(await prisma.documentVersion.count({ where: { projectId } })).toBe(0)
  })

  it('rejeição preserva a versão vigente e impede segunda revisão', async () => {
    const approved = await submeterDocumento(manager, projectId, 'CHARTER', { justificativa: 'Aprovada' }, meta)
    const pending = await submeterDocumento(member, projectId, 'CHARTER', { justificativa: 'Rejeitada' }, meta)
    await revisarDocumento(manager, projectId, pending.id, 'reject')
    expect((await documentoVigente(member, projectId, 'CHARTER'))?.id).toBe(approved.id)
    await expect(revisarDocumento(manager, projectId, pending.id, 'approve')).rejects.toThrow(/já revisada/)
  })

  it('falha da auditoria desfaz status e publicação na mesma transação', async () => {
    const pending = await submeterDocumento(member, projectId, 'CHARTER', { justificativa: 'Não publicar' }, meta)
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_document_approval_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'DOCUMENTO_APROVAR' THEN RAISE EXCEPTION 'audit failure test'; END IF; RETURN NEW; END $$`)
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_document_approval_test BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_document_approval_test()`)
    try {
      await expect(revisarDocumento(manager, projectId, pending.id, 'approve')).rejects.toThrow()
      expect((await prisma.documentVersion.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('PENDING')
      expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).justificativa).toBe('Vigente')
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_document_approval_test ON "AuditLog"')
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_document_approval_test()')
    }
  })

  it('duas aprovações concorrentes produzem uma única publicação e um único log', async () => {
    const pending = await submeterDocumento(member, projectId, 'CHARTER', { objetivos: 'Concorrente' }, meta)
    const results = await Promise.allSettled([revisarDocumento(manager, projectId, pending.id, 'approve'), revisarDocumento(manager, projectId, pending.id, 'approve')])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.auditLog.count({ where: { entityId: projectId, action: 'DOCUMENTO_APROVAR' } })).toBe(1)
  })

  it('membro e administrador não acessam outro tenant; projeto sem vínculo também é negado', async () => {
    await expect(submeterDocumento(member, otherProjectId, 'CHARTER', {}, meta)).rejects.toThrow(/permissão/i)
    await expect(submeterDocumento(member, foreignProjectId, 'CHARTER', {}, meta)).rejects.toThrow(/permissão/i)
    await expect(submeterDocumento({ ...manager, role: 'admin' }, foreignProjectId, 'CHARTER', {}, meta)).rejects.toThrow(/permissão/i)
    const pending = await submeterDocumento(member, projectId, 'CHARTER', {}, meta)
    await expect(revisarDocumento(manager, foreignProjectId, pending.id, 'approve')).rejects.toThrow(/permissão/i)
  })

  it('rascunho é privado e não muda o publicado; submissão remove o rascunho enviado', async () => {
    await salvarRascunho(member, projectId, 'CHARTER', { objetivos: 'Privado' })
    expect((await rascunhoDocumento(member, projectId, 'CHARTER'))?.payload).toEqual({ objetivos: 'Privado' })
    expect(await rascunhoDocumento(manager, projectId, 'CHARTER')).toBeNull()
    await submeterDocumento(member, projectId, 'CHARTER', { objetivos: 'Privado' }, meta)
    expect(await rascunhoDocumento(member, projectId, 'CHARTER')).toBeNull()
  })

  it('novo snapshot de partes interessadas só fica vigente após aprovação', async () => {
    const payload = { header: { categoria: '', nomeProjeto: 'Projeto', gerenteProjeto: 'Gerente', elaboradoPor: 'Membro', aprovadoPor: '', versao: '2', dataCriacao: '', dataAprovacao: '' }, stakeholders: [{ ref: '01', nome: 'Pessoa', empresaEquipe: '', cargoCompetencia: '', email: '', telefoneFax: '', endereco: '' }] }
    const pending = await submeterDocumento(member, projectId, 'STAKEHOLDER', payload, meta)
    expect(await documentoVigente(member, projectId, 'STAKEHOLDER')).toBeNull()
    await revisarDocumento(manager, projectId, pending.id, 'approve')
    expect(pending.payload).toMatchObject({ ...payload, header: { ...payload.header, aprovadoPor: 'Gerente' } })
    expect(pending.aprovadoPor).toBe('Gerente')
    expect((await documentoVigente(member, projectId, 'STAKEHOLDER'))?.payload).toMatchObject({ ...payload, header: { ...payload.header, aprovadoPor: 'Gerente' } })
  })

  it('EAP pendente preserva a árvore vigente e aprovação publica códigos normalizados', async () => {
    const pending = await submeterDocumento(member, projectId, 'EAP', { projectName: 'Proposta', nodes: [{ id: 'root', title: 'Raiz', children: [{ id: 'child', title: 'Filho', children: [] }] }] }, meta)
    expect((await prisma.eapDocument.findUniqueOrThrow({ where: { projectId } })).projectName).not.toBe('Proposta')
    await revisarDocumento(manager, projectId, pending.id, 'approve')
    const published = await prisma.eapDocument.findUniqueOrThrow({ where: { projectId } })
    expect(published.projectName).toBe('Proposta')
    expect(published.nodes).toMatchObject([{ code: '1', children: [{ code: '1.1', parentId: 'root' }] }])
  })

  it('nova ata pendente não é publicada; aprovação cria a ata e rejeita participantes de outro tenant', async () => {
    const payload = { data: new Date().toISOString(), elaboradoPor: 'Membro', elaboradoPorUserId: member.userId, presentes: [], acoes: [], anexos: [], copiasPara: [] }
    const id = randomUUID()
    await expect(submeterDocumento(member, projectId, 'ATA', { ...payload, elaboradoPorUserId: foreignUserId }, meta, randomUUID())).rejects.toThrow(/membros ativos/)
    const pending = await submeterDocumento(member, projectId, 'ATA', payload, meta, id)
    expect(await prisma.ata.findUnique({ where: { id } })).toBeNull()
    await revisarDocumento(manager, projectId, pending.id, 'approve')
    expect(await prisma.ata.findUnique({ where: { id } })).toMatchObject({ projetoId: projectId, tenantId: member.tenantId, numero: 1 })
  })

  it('excluir ata cancela propostas pendentes e impede republicação', async () => {
    const id = randomUUID()
    const payload = { data: new Date().toISOString(), elaboradoPor: 'Membro' }
    await submeterDocumento(manager, projectId, 'ATA', payload, meta, id)
    const pending = await submeterDocumento(member, projectId, 'ATA', { ...payload, observacoes: 'Alteração' }, meta, id)
    await excluirAta(manager, projectId, id)
    expect((await prisma.ata.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull()
    expect((await prisma.documentVersion.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('REJECTED')
    await expect(revisarDocumento(manager, projectId, pending.id, 'approve')).rejects.toThrow()
    await expect(submeterDocumento(member, projectId, 'ATA', payload, meta, id)).rejects.toThrow(/Ata não encontrada/)
    expect(await prisma.auditLog.count({ where: { entityId: projectId, action: 'DOCUMENTO_EXCLUIR' } })).toBe(1)
  })

  it('duas novas atas aprovadas em paralelo recebem números distintos', async () => {
    const payload = { data: new Date().toISOString(), elaboradoPor: 'Membro' }
    const versions = await Promise.all([submeterDocumento(member, projectId, 'ATA', payload, meta, randomUUID()), submeterDocumento(member, projectId, 'ATA', payload, meta, randomUUID())])
    await Promise.all(versions.map(version => revisarDocumento(manager, projectId, version.id, 'approve')))
    const atas = await prisma.ata.findMany({ where: { projetoId: projectId }, orderBy: { numero: 'asc' } })
    expect(atas.map(ata => ata.numero)).toEqual([1, 2])
  })

  it('versões legadas sem snapshot não são aprováveis; exclusão não remove aprovada', async () => {
    const legacy = await prisma.documentVersion.create({ data: { projectId, documentType: 'CHARTER', status: 'PENDING', ...meta } })
    await expect(revisarDocumento(manager, projectId, legacy.id, 'approve')).rejects.toThrow(/legada sem conteúdo/)
    await revisarDocumento(manager, projectId, legacy.id, 'reject')
    await excluirVersao(manager, projectId, legacy.id)
    expect(await prisma.auditLog.count({ where: { entityId: projectId, action: 'DOCUMENTO_EXCLUIR_VERSAO' } })).toBe(1)
    const approved = await submeterDocumento(manager, projectId, 'CHARTER', {}, meta)
    await expect(excluirVersao(manager, projectId, approved.id)).rejects.toThrow(/preservadas/)
  })
})
