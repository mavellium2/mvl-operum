// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { excluirArquivo, listarArquivos, registrarArquivo, urlDeAcesso, urlDeEnvio } from '@/services/arquivosProjetoService'
import type { SessaoAuthz } from '@/services/authz'

const testUrl = process.env.OPERUM_DOCUMENT_TEST_DATABASE_URL
const comMinio = process.env.OPERUM_ARQUIVOS_TEST_MINIO === '1'
let gerente: SessaoAuthz
let membro: SessaoAuthz
let projetoId: string
let outroProjetoId: string

// Banco dedicado e MinIO local obrigatórios (mesma trava do teste de documentos).
describe.skipIf(!testUrl || !comMinio)('arquivos do projeto — PostgreSQL e MinIO reais', () => {
  beforeAll(() => {
    const url = new URL(testUrl!)
    if (url.pathname !== '/operum_document_test' || !['localhost', '127.0.0.1'].includes(url.hostname) || process.env.DATABASE_URL !== testUrl) {
      throw new Error('Use exclusivamente o banco local operum_document_test com as duas variáveis iguais')
    }
  })
  beforeEach(async () => {
    const id = randomUUID()
    const tenant = await prisma.tenant.create({ data: { name: `Arquivos ${id}`, subdomain: `arq-${id}` } })
    const g = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Gerente', email: `${id}@g.test`, passwordHash: 'test-only' } })
    const m = await prisma.user.create({ data: { tenantId: tenant.id, name: 'Membro', email: `${id}@m.test`, passwordHash: 'test-only' } })
    projetoId = (await prisma.project.create({ data: { tenantId: tenant.id, name: `Projeto ${id}` } })).id
    outroProjetoId = (await prisma.project.create({ data: { tenantId: tenant.id, name: `Outro ${id}` } })).id
    await prisma.userProject.createMany({ data: [{ userId: g.id, projectId: projetoId }, { userId: m.id, projectId: projetoId }, { userId: g.id, projectId: outroProjetoId }] })
    const role = await prisma.role.create({ data: { tenantId: tenant.id, name: 'Gerente', nameKey: 'gerente', scope: 'PROJETO' } })
    await prisma.userProjectRole.createMany({ data: [{ userId: g.id, projectId: projetoId, roleId: role.id }, { userId: g.id, projectId: outroProjetoId, roleId: role.id }] })
    gerente = { userId: g.id, tenantId: tenant.id, role: 'member' }
    membro = { userId: m.id, tenantId: tenant.id, role: 'member' }
  })
  afterAll(async () => { await prisma.$disconnect() })

  it('envia direto ao storage, registra, lista, abre pela URL assinada e exclui', async () => {
    const conteudo = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
    const { url, chave } = await urlDeEnvio(gerente, projetoId, 'FOTOS_VIDEOS', 'Visita à escola.png', 'image/png', conteudo.length)
    expect(chave.startsWith(`projetos/${projetoId}/fotos-videos/`)).toBe(true)
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: conteudo })
    expect(put.ok).toBe(true)
    const arquivo = await registrarArquivo(gerente, projetoId, 'FOTOS_VIDEOS', chave, 'Visita à escola.png')
    expect(arquivo).toMatchObject({ nome: 'Visita à escola.png', tipo: 'image/png', tamanho: conteudo.length, enviadoPorId: gerente.userId })
    // Cada seção tem a sua lista; o membro (só ver) enxerga.
    expect((await listarArquivos(membro, projetoId, 'FOTOS_VIDEOS')).map(a => a.id)).toEqual([arquivo.id])
    expect(await listarArquivos(membro, projetoId, 'APRESENTACAO')).toEqual([])
    const acesso = await urlDeAcesso(membro, projetoId, arquivo.id, true)
    const get = await fetch(acesso)
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(conteudo)
    expect(get.headers.get('content-disposition')).toMatch(/^attachment;/)
    await expect(excluirArquivo(membro, projetoId, arquivo.id)).rejects.toThrow(/permissão/i)
    await excluirArquivo(gerente, projetoId, arquivo.id)
    expect(await listarArquivos(gerente, projetoId, 'FOTOS_VIDEOS')).toEqual([])
    expect((await fetch(await urlDeAcesso(gerente, projetoId, arquivo.id, false).catch(() => 'http://x.invalid'))
      .catch(() => ({ ok: false }))).ok).toBe(false)
    expect(await prisma.auditLog.count({ where: { entityId: arquivo.id } })).toBe(2)
  })

  it('recusa tipo errado, chave de outro projeto ou seção e objeto que não bate com o tipo aceito', async () => {
    await expect(urlDeEnvio(gerente, projetoId, 'FOTOS_VIDEOS', 'slides.pdf', 'application/pdf', 10)).rejects.toThrow(/fotos/i)
    await expect(urlDeEnvio(gerente, projetoId, 'APRESENTACAO', 'grande.mp4', 'video/mp4', 2 * 1024 * 1024 * 1024)).rejects.toThrow(/1 GB/)
    // Membro edita documentos por padrão, então envia; quem não é do projeto, não.
    await expect(urlDeEnvio(membro, projetoId, 'FOTOS_VIDEOS', 'a.png', 'image/png', 10)).resolves.toHaveProperty('chave')
    await expect(urlDeEnvio(membro, outroProjetoId, 'FOTOS_VIDEOS', 'a.png', 'image/png', 10)).rejects.toThrow(/permissão/i)
    const deOutro = await urlDeEnvio(gerente, outroProjetoId, 'FOTOS_VIDEOS', 'a.png', 'image/png', 4)
    await expect(registrarArquivo(gerente, projetoId, 'FOTOS_VIDEOS', deOutro.chave, 'a.png')).rejects.toThrow(/inválido/)
    const outraSecao = await urlDeEnvio(gerente, projetoId, 'APRESENTACAO', 'a.pdf', 'application/pdf', 4)
    await expect(registrarArquivo(gerente, projetoId, 'FOTOS_VIDEOS', outraSecao.chave, 'a.pdf')).rejects.toThrow(/inválido/)
    // Enviado com outro Content-Type do que o assinado: o storage recusa a assinatura.
    const { url, chave } = await urlDeEnvio(gerente, projetoId, 'FOTOS_VIDEOS', 'b.png', 'image/png', 4)
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: new Uint8Array([1, 2, 3, 4]) })
    expect(put.ok).toBe(false)
    await expect(registrarArquivo(gerente, projetoId, 'FOTOS_VIDEOS', chave, 'b.png')).rejects.toThrow(/não chegou/)
  })

  it('segunda barreira: objeto no storage com tipo fora da seção é recusado e apagado no registro', async () => {
    const { PutObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3')
    const { s3, BUCKET } = await import('@/lib/minio')
    const { chave } = await urlDeEnvio(gerente, projetoId, 'FOTOS_VIDEOS', 'c.png', 'image/png', 4)
    // Grava direto (sem a URL assinada) com um tipo proibido, simulando um envio adulterado.
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: chave, ContentType: 'text/html', Body: '<b>x</b>' }))
    await expect(registrarArquivo(gerente, projetoId, 'FOTOS_VIDEOS', chave, 'c.png')).rejects.toThrow(/Envie fotos/)
    await expect(s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: chave }))).rejects.toBeTruthy()
  })
})
