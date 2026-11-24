// @vitest-environment node
/**
 * Pedido de 22/11/2026 (2.2): o gerente edita os dados dos stakeholders da equipe dele.
 * Usa a autorização real (services/authz + projectAccess) sobre um banco simulado:
 * - p1 e p2 são da instituição t1; p3 é da t2;
 * - g1 é gerente de p1; a1 é membro comum de p1; ad1 é admin e membro de p1;
 * - o1 só está em p2; i1 é membro INATIVO de p1; x1 (t2) está em p3.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn() }))
vi.mock('@/lib/api-client', () => ({
  projectsApi: {},
  adminApi: {},
  stakeholdersApi: { update: vi.fn().mockResolvedValue({ id: 's1' }) },
}))
vi.mock('@/lib/minio', () => ({ s3: { send: vi.fn().mockResolvedValue({}) }, BUCKET: 'b', publicUrl: (k: string) => `https://cdn/${k}` }))
vi.mock('@/lib/imagemAssinatura', () => ({ lerImagemAssinatura: vi.fn().mockResolvedValue({ ext: 'png', body: Buffer.from('x'), contentType: 'image/png' }) }))
vi.mock('@/services/membroInativo', () => ({ notificarPendenciasDoMembroInativo: vi.fn() }))

type Vinculo = { userId: string; projectId: string; active: boolean }
const projetos: Record<string, string> = { p1: 't1', p2: 't1', p3: 't2' }
const usuarios: Record<string, { tenantId: string; role: string }> = {
  g1: { tenantId: 't1', role: 'member' }, a1: { tenantId: 't1', role: 'member' }, ad1: { tenantId: 't1', role: 'admin' },
  o1: { tenantId: 't1', role: 'member' }, i1: { tenantId: 't1', role: 'member' }, x1: { tenantId: 't2', role: 'member' },
}
const vinculos: Vinculo[] = [
  { userId: 'g1', projectId: 'p1', active: true }, { userId: 'a1', projectId: 'p1', active: true },
  { userId: 'ad1', projectId: 'p1', active: true }, { userId: 'o1', projectId: 'p2', active: true },
  { userId: 'i1', projectId: 'p1', active: false }, { userId: 'x1', projectId: 'p3', active: true },
]
const gerentes = [{ userId: 'g1', projectId: 'p1' }]
// Contato s1 vinculado só a p1; s2 só a p2.
const contatos = [{ stakeholderId: 's1', projectId: 'p1' }, { stakeholderId: 's2', projectId: 'p2' }]

vi.mock('@/lib/prisma', () => {
  const db = {
    project: { findFirst: vi.fn() },
    userProject: { findUnique: vi.fn(), findFirst: vi.fn() },
    userProjectRole: { findFirst: vi.fn() },
    role: { findMany: vi.fn() },
    userPermission: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findFirst: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    stakeholder: { findFirst: vi.fn().mockResolvedValue({ email: null, phone: null }) },
    projectStakeholder: { findFirst: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
  return { default: db }
})

import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { stakeholdersApi } from '@/lib/api-client'
import { updateProjetoMemberAction } from '@/app/actions/projetos'
import { updateStakeholderAction, uploadMemberSignatureAction } from '@/app/actions/stakeholders'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const sessao = (userId: string) => ({ isAuth: true, userId, tenantId: usuarios[userId].tenantId, role: usuarios[userId].role })

beforeEach(() => {
  vi.clearAllMocks()
  db.project.findFirst.mockImplementation(async ({ where }) => (projetos[where.id] === where.tenantId ? { id: where.id } : null))
  db.userProject.findUnique.mockImplementation(async ({ where }) => {
    const v = vinculos.find(x => x.userId === where.userId_projectId.userId && x.projectId === where.userId_projectId.projectId)
    return v ? { active: v.active, funcoes: [] } : null
  })
  db.userProject.findFirst.mockImplementation(async ({ where }) => {
    const v = vinculos.find(x => x.projectId === where.projectId && x.userId === where.userId && (where.active !== true || x.active))
    const u = v && usuarios[v.userId]
    if (!v || !u || u.tenantId !== where.user.tenantId) return null
    if (where.user.role?.not && u.role === where.user.role.not) return null
    return { id: `${v.userId}:${v.projectId}`, funcoes: [], user: { role: u.role } }
  })
  db.userProjectRole.findFirst.mockImplementation(async ({ where }) => (gerentes.some(g => g.userId === where.userId && g.projectId === where.projectId) ? { roleId: 'rg' } : null))
  db.role.findMany.mockResolvedValue([{ id: 'rg', name: 'Gerente', nameKey: 'gerente', scope: 'PROJETO', permissoesDefinidasEm: null, permissions: [] }])
  db.projectStakeholder.findFirst.mockImplementation(async ({ where }) => {
    const ok = contatos.some(c => c.stakeholderId === where.stakeholderId && c.projectId === where.projectId)
    return ok && projetos[where.projectId] === where.project.tenantId ? { id: 'ps' } : null
  })
  db.user.findFirst.mockResolvedValue({ name: 'x' })
})

const alteracoes = () => db.auditLog.create.mock.calls.map(c => (c[0] as { data: Record<string, unknown> }).data)

describe('updateProjetoMemberAction — gerente edita a equipe do próprio projeto', () => {
  it('gerente edita nome e contato de um membro ativo e a ação é auditada', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    const r = await updateProjetoMemberAction('a1', 'p1', { name: ' Novo Nome ', cep: '01000-000', notes: 'ok' })
    expect(r).toEqual({ success: true })
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'a1', tenantId: 't1', deletedAt: null }, data: { cep: '01000-000', notes: 'ok', name: 'Novo Nome' } })
    const log = alteracoes()[0]
    expect(log).toMatchObject({ tenantId: 't1', userId: 'g1', action: 'USUARIO_EDITAR_NO_PROJETO', entity: 'User', entityId: 'a1' })
    expect(log.details).toMatchObject({ projectId: 'p1', porGerente: true })
  })

  it('gerente edita os próprios dados', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    expect(await updateProjetoMemberAction('g1', 'p1', { notes: 'meu contato' })).toEqual({ success: true })
    expect(db.user.update).toHaveBeenCalledOnce()
  })

  it('e-mail de login não é alterado pelo gerente (ignorado), só pelo admin', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    await updateProjetoMemberAction('a1', 'p1', { email: 'invasor@x.com', notes: 'n' })
    expect(db.user.update.mock.calls[0][0].data).toEqual({ notes: 'n' })

    vi.mocked(verifySession).mockResolvedValue(sessao('ad1') as never)
    await updateProjetoMemberAction('a1', 'p1', { email: 'novo@x.com' })
    expect(db.user.update.mock.calls[1][0].data).toEqual({ email: 'novo@x.com' })
  })

  it('gerente não atribui cargos nem eleva alguém a gerente', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    expect(await updateProjetoMemberAction('a1', 'p1', { cargos: ['Tech Lead'] })).toEqual({ error: 'Só o administrador atribui cargos' })
    expect(await updateProjetoMemberAction('a1', 'p1', { isGerente: true })).toEqual({ error: 'Só o administrador atribui o papel de gerente' })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('campos de conta (papel, tenant, operador, senha) nunca chegam ao User', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    await updateProjetoMemberAction('a1', 'p1', { notes: 'n', ...({ role: 'admin', tenantId: 't2', isActive: false, passwordHash: 'x' } as object) })
    expect(db.user.update.mock.calls[0][0].data).toEqual({ notes: 'n' })
  })

  it('gerente não edita a conta de um administrador, mesmo membro do projeto', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    const r = await updateProjetoMemberAction('ad1', 'p1', { name: 'Hack' })
    expect(r).toEqual({ error: 'Só o administrador edita os dados de um administrador' })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('membro inativo do projeto não é editado pelo gerente', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    expect(await updateProjetoMemberAction('i1', 'p1', { notes: 'n' })).toEqual({ error: 'Membro não encontrado neste projeto' })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('negativo — membro comum não edita ninguém (nem a equipe, nem a si)', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('a1') as never)
    expect(await updateProjetoMemberAction('g1', 'p1', { notes: 'n' })).toMatchObject({ error: expect.stringContaining('Sem permissão') })
    expect(await updateProjetoMemberAction('a1', 'p1', { notes: 'n' })).toMatchObject({ error: expect.stringContaining('Sem permissão') })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('negativo — pessoa de outro projeto: não é membro de p1 e o gerente não gerencia p2', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    expect(await updateProjetoMemberAction('o1', 'p1', { notes: 'n' })).toEqual({ error: 'Membro não encontrado neste projeto' })
    expect(await updateProjetoMemberAction('o1', 'p2', { notes: 'n' })).toMatchObject({ error: expect.stringContaining('Sem permissão') })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it('negativo — outra instituição: projeto e pessoa de t2 ficam fora do alcance do gerente de t1', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    expect(await updateProjetoMemberAction('x1', 'p3', { notes: 'n' })).toMatchObject({ error: expect.stringContaining('Sem permissão') })
    expect(await updateProjetoMemberAction('x1', 'p1', { notes: 'n' })).toEqual({ error: 'Membro não encontrado neste projeto' })
    expect(db.user.update).not.toHaveBeenCalled()
  })
})

describe('uploadMemberSignatureAction — gerente envia a assinatura da equipe', () => {
  const arquivo = () => { const f = new FormData(); f.append('file', new File(['x'], 's.png', { type: 'image/png' })); return f }

  it('gerente envia a assinatura de membro ativo do projeto e fica auditado', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    expect(await uploadMemberSignatureAction(arquivo(), 'a1', 'p1')).toMatchObject({ signatureUrl: expect.stringContaining('signatures/a1/') })
    expect(db.user.update).toHaveBeenCalledOnce()
    expect(alteracoes()[0]).toMatchObject({ action: 'USUARIO_EDITAR_NO_PROJETO', entityId: 'a1', userId: 'g1' })
  })

  it('o próprio usuário continua podendo enviar a sua, sem projeto', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('a1') as never)
    expect(await uploadMemberSignatureAction(arquivo(), 'a1')).toMatchObject({ signatureUrl: expect.any(String) })
  })

  it('negativo — sem projeto, membro comum, admin alvo, outro projeto e outro tenant', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    expect(await uploadMemberSignatureAction(arquivo(), 'a1')).toEqual({ error: 'Não autorizado' })
    expect(await uploadMemberSignatureAction(arquivo(), 'ad1', 'p1')).toEqual({ error: 'Não autorizado' })
    expect(await uploadMemberSignatureAction(arquivo(), 'o1', 'p1')).toEqual({ error: 'Não autorizado' })
    expect(await uploadMemberSignatureAction(arquivo(), 'x1', 'p3')).toMatchObject({ error: expect.stringContaining('Sem permissão') })
    vi.mocked(verifySession).mockResolvedValue(sessao('a1') as never)
    expect(await uploadMemberSignatureAction(arquivo(), 'g1', 'p1')).toMatchObject({ error: expect.stringContaining('Sem permissão') })
    expect(db.user.update).not.toHaveBeenCalled()
  })
})

describe('updateStakeholderAction — contato externo do projeto', () => {
  it('gerente edita o externo vinculado ao projeto dele e a ação é auditada', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    const r = await updateStakeholderAction('s1', { name: 'Externo' }, 'p1')
    expect(r).toMatchObject({ success: true })
    expect(stakeholdersApi.update).toHaveBeenCalledOnce()
    expect(alteracoes()[0]).toMatchObject({ action: 'STAKEHOLDER_EDITAR_NO_PROJETO', entity: 'Stakeholder', entityId: 's1', userId: 'g1' })
  })

  it('negativo — membro comum, contato de outro projeto e projeto de outra instituição', async () => {
    vi.mocked(verifySession).mockResolvedValue(sessao('a1') as never)
    expect(await updateStakeholderAction('s1', { name: 'X' }, 'p1')).toMatchObject({ error: expect.stringContaining('Sem permissão') })
    vi.mocked(verifySession).mockResolvedValue(sessao('g1') as never)
    expect(await updateStakeholderAction('s2', { name: 'X' }, 'p1')).toEqual({ error: 'Stakeholder não encontrado neste projeto.' })
    expect(await updateStakeholderAction('s1', { name: 'X' }, 'p3')).toMatchObject({ error: expect.stringContaining('Sem permissão') })
    expect(stakeholdersApi.update).not.toHaveBeenCalled()
  })
})
