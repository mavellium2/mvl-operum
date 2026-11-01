import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), tenant: vi.fn(), update: vi.fn(), transaction: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: mocks.session }))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: mocks.transaction } }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: mocks.audit }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
import { updateMyInstitutionAction } from '@/app/actions/instituicoes'
const tx = { user: { findFirst: mocks.user }, tenant: { findFirst: mocks.tenant, update: mocks.update } }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ userId: 'u1', tenantId: 'tenant-da-sessao', role: 'admin' })
  mocks.user.mockResolvedValue({ id: 'u1' })
  mocks.tenant.mockResolvedValue({ name: 'Antes', subdomain: 'antes' })
  mocks.transaction.mockImplementation(callback => callback(tx))
})
it('limita a escrita ao tenant da sessão e audita na mesma transação', async () => {
  expect(await updateMyInstitutionAction({ name: '  Depois  ', subdomain: ' NOVO ' })).toEqual({ name: 'Depois', subdomain: 'novo' })
  expect(mocks.user).toHaveBeenCalledWith({ where: { id: 'u1', tenantId: 'tenant-da-sessao', role: 'admin', isActive: true, deletedAt: null }, select: { id: true } })
  expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'tenant-da-sessao' }, data: { name: 'Depois', subdomain: 'novo' } })
  expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-da-sessao', entityId: 'tenant-da-sessao', action: 'INSTITUICAO_ATUALIZAR' }), tx)
})
it.each(['', '  ', 'x'.repeat(121), { name: 'Novo', tenantId: 'outro', status: 'ACTIVE' }])('rejeita entrada inválida sem escrever', async value => {
  expect(await updateMyInstitutionAction((typeof value === 'string' ? { name: value, subdomain: 'novo' } : value) as { name: string; subdomain: string })).toHaveProperty('error')
  expect(mocks.transaction).not.toHaveBeenCalled()
})
it('recusa membro mesmo que tente chamar a action diretamente', async () => {
  mocks.session.mockResolvedValue({ userId: 'u1', tenantId: 'tenant-da-sessao', role: 'member' })
  expect(await updateMyInstitutionAction({ name: 'Depois', subdomain: 'novo' })).toHaveProperty('error')
  expect(mocks.update).not.toHaveBeenCalled()
})
it('recusa administrador removido ou de outra instituição', async () => {
  mocks.user.mockResolvedValue(null)
  expect(await updateMyInstitutionAction({ name: 'Depois', subdomain: 'novo' })).toHaveProperty('error')
  expect(mocks.update).not.toHaveBeenCalled()
})
it('recusa instituição excluída ou inativa', async () => {
  mocks.tenant.mockResolvedValue(null)
  expect(await updateMyInstitutionAction({ name: 'Depois', subdomain: 'novo' })).toHaveProperty('error')
  expect(mocks.update).not.toHaveBeenCalled()
})
it('não expõe erros internos nem anuncia sucesso se a auditoria falhar', async () => {
  mocks.audit.mockRejectedValue(new Error('detalhe interno'))
  expect(await updateMyInstitutionAction({ name: 'Depois', subdomain: 'novo' })).toEqual({ error: 'Não foi possível salvar. Tente novamente.' })
  expect(mocks.revalidate).not.toHaveBeenCalled()
})

it.each(['ab', 'com espaço', 'com.acento', 'instituição', 'x'.repeat(64)])('recusa identificador inválido: %s', async subdomain => {
  expect(await updateMyInstitutionAction({ name: 'Nome', subdomain })).toEqual(expect.objectContaining({ error: expect.any(String), field: 'subdomain' }))
  expect(mocks.update).not.toHaveBeenCalled()
})
it('aponta identificador duplicado sem revelar dados da outra instituição', async () => {
  mocks.update.mockRejectedValue({ code: 'P2002' })
  expect(await updateMyInstitutionAction({ name: 'Nome', subdomain: 'ocupado' })).toEqual({ error: 'Este identificador já está em uso. Escolha outro.', field: 'subdomain' })
  expect(mocks.audit).not.toHaveBeenCalled()
})
