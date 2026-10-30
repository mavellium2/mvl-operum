// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn() }))
vi.mock('@/services/projectAccess', () => ({ canProjectPermission: vi.fn(), requireProjectPermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { documentVersion: { findMany: vi.fn() }, auditLog: { findMany: vi.fn() }, user: { findMany: vi.fn() } } }))
vi.mock('@/services/documentRevisionService', () => ({ submeterDocumento: vi.fn(), revisarDocumento: vi.fn(), salvarRascunho: vi.fn(), rascunhoDocumento: vi.fn(), excluirVersao: vi.fn(), descartarRascunho: vi.fn() }))
import { verifySession } from '@/lib/dal'
import { requireProjectPermission } from '@/services/projectAccess'
import { SemPermissaoError } from '@/services/authz'
import prisma from '@/lib/prisma'
import { GET, POST, PATCH, DELETE } from '@/app/api/projects/[projetoId]/revisions/route'
import { rascunhoDocumento, excluirVersao, submeterDocumento, revisarDocumento, descartarRascunho } from '@/services/documentRevisionService'
const session = { tenantId: 't1', userId: 'u1', role: 'member' }
const ctx = { params: Promise.resolve({ projetoId: 'p1' }) }
function req(method: string, body: unknown) { return new Request('http://localhost/api/projects/p1/revisions', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(verifySession).mockResolvedValue(session as never)
  vi.mocked(prisma.documentVersion.findMany).mockResolvedValue([])
  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([])
  vi.mocked(prisma.user.findMany).mockResolvedValue([])
  vi.mocked(revisarDocumento).mockResolvedValue({ id: 'v1', status: 'APPROVED' } as never)
  vi.mocked(excluirVersao).mockResolvedValue({ deleted: true })
})
describe('API de revisões unificada', () => {
  it('nega leitura antes de consultar versões ou logs', async () => {
    vi.mocked(requireProjectPermission).mockRejectedValue(new SemPermissaoError('documentos:ver'))
    expect((await GET(new Request('http://localhost/revisions?type=ATA&tab=registro'), ctx)).status).toBe(403)
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled()
  })
  it('escopa versões por projeto, tipo e ata específica', async () => {
    const response = await GET(new Request('http://localhost/revisions?type=ATA&resourceId=a1'), ctx)
    expect(response.status).toBe(200)
    expect(prisma.documentVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', documentType: 'ATA', resourceId: 'a1' } }))
  })
  it('histórico geral de atas inclui propostas novas ainda sem ata publicada', async () => {
    await GET(new Request('http://localhost/revisions?type=ATA'), ctx)
    expect(prisma.documentVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', documentType: 'ATA' } }))
  })
  it('logs são filtrados pelo tenant, projeto e documento e recebem nomes dos autores', async () => {
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([{ id: 'l1', userId: 'u1', action: 'DOCUMENTO_VERSAO' }] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u1', name: 'Autor' }] as never)
    const response = await GET(new Request('http://localhost/revisions?type=CHARTER&tab=registro'), ctx)
    expect(await response.json()).toMatchObject([{ userName: 'Autor' }])
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', entityId: 'p1', AND: [{ details: { path: ['documentType'], equals: 'CHARTER' } }, { details: { path: ['resourceId'], equals: '' } }] }) }))
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1' }) }))
  })
  it('rejeita tipo e recurso incompatíveis', async () => {
    expect((await GET(new Request('http://localhost/revisions?type=INVALID'), ctx)).status).toBe(400)
    expect((await GET(new Request('http://localhost/revisions?type=CHARTER&resourceId=a1'), ctx)).status).toBe(400)
    expect(prisma.documentVersion.findMany).not.toHaveBeenCalled()
  })
  it('rascunho usa o usuário da sessão e o documento selecionado', async () => {
    vi.mocked(rascunhoDocumento).mockResolvedValue(null)
    expect((await GET(new Request('http://localhost/revisions?type=CHARTER&draft=1'), ctx)).status).toBe(200)
    expect(rascunhoDocumento).toHaveBeenCalledWith(session, 'p1', 'CHARTER', '')
  })
  it('"Descartar alterações" apaga só o rascunho do usuário da sessão, sem excluir versão', async () => {
    vi.mocked(descartarRascunho).mockResolvedValue({ descartado: true })
    const response = await DELETE(req('DELETE', { draft: true, type: 'ATA', resourceId: 'a1' }), ctx)
    expect(response.status).toBe(200)
    expect(descartarRascunho).toHaveBeenCalledWith(session, 'p1', 'ATA', 'a1')
    expect(excluirVersao).not.toHaveBeenCalled()
    expect((await DELETE(req('DELETE', { draft: true, type: 'INVALID' }), ctx)).status).toBe(400)
  })
  it('encaminha submissão, revisão e exclusão ao serviço com escopo da sessão', async () => {
    vi.mocked(submeterDocumento).mockResolvedValue({ status: 'PENDING' } as never)
    expect((await POST(req('POST', { type: 'EAP', payload: {}, meta: { commitTitle: 'Teste', versao: '1' } }), ctx)).status).toBe(201)
    expect(submeterDocumento).toHaveBeenCalledWith(session, 'p1', 'EAP', {}, expect.any(Object), '')
    await PATCH(req('PATCH', { versionId: 'v1', action: 'approve' }), ctx)
    expect(revisarDocumento).toHaveBeenCalledWith(session, 'p1', 'v1', 'approve')
    await DELETE(req('DELETE', { versionId: 'v1' }), ctx)
    expect(excluirVersao).toHaveBeenCalledWith(session, 'p1', 'v1')
  })
  it('mantém o redirecionamento de sessão e não expõe mensagens internas de banco', async () => {
    vi.mocked(verifySession).mockRejectedValue(new Error('NEXT_REDIRECT'))
    await expect(GET(new Request('http://localhost/revisions?type=CHARTER'), ctx)).rejects.toThrow('NEXT_REDIRECT')
    vi.mocked(verifySession).mockResolvedValue(session as never)
    vi.mocked(prisma.documentVersion.findMany).mockRejectedValue(new Error('database password secret'))
    const response = await GET(new Request('http://localhost/revisions?type=CHARTER'), ctx)
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('password')
  })
})
