import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserTenantsList from '@/components/UserTenantsList'
import { updateMyInstitutionAction } from '@/app/actions/instituicoes'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'

vi.mock('@/app/actions/instituicoes', () => ({ updateMyInstitutionAction: vi.fn() }))
vi.mock('@/app/actions/auth', () => ({ getMyTenantsAction: vi.fn(), switchTenantAction: vi.fn() }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(getMyTenantsAction).mockResolvedValue([
    { userId: 'u1', tenantId: 't1', tenantName: 'Fábio', tenantSubdomain: 'fabio', role: 'admin', isCurrent: false, requiresPassword: true, passwordScope: 'current' },
  ])
  vi.mocked(switchTenantAction).mockResolvedValue({ error: 'Senha incorreta' })
})
describe('confirmação de instituição', () => {
  it('envia a senha preenchida pelo navegador mesmo sem evento de alteração', async () => {
    render(<UserTenantsList />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acessar' }))
    const input = screen.getByLabelText('Senha da conta que está ativa') as HTMLInputElement
    // Simula preenchimento externo sem onChange; o estado React continua vazio.
    input.value = 'senha-preenchida'
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(switchTenantAction).toHaveBeenCalledWith('t1', 'senha-preenchida'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta')
  })
  it('permite conferir a senha e mostra identificador sem inventar domínio', async () => {
    render(<UserTenantsList />)
    fireEvent.click(await screen.findByRole('button', { name: 'Acessar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(screen.getByLabelText('Senha da conta que está ativa')).toHaveAttribute('type', 'text')
    expect(screen.getByText('Identificador: fabio')).toBeInTheDocument()
    expect(screen.queryByText('fabio.operum.com')).not.toBeInTheDocument()
  })
})


it('edita somente a instituição ativa quando autorizado e mantém o formulário em caso de erro', async () => {
  vi.mocked(getMyTenantsAction).mockResolvedValue([{ userId: 'u1', tenantId: 't1', tenantName: 'Instituição', tenantSubdomain: 'instituicao', role: 'admin', isCurrent: true }])
  vi.mocked(updateMyInstitutionAction).mockResolvedValueOnce({ error: 'Não foi possível salvar.' }).mockResolvedValueOnce({ name: 'Novo nome' })
  render(<UserTenantsList canEditCurrent />)
  fireEvent.click(await screen.findByRole('button', { name: 'Editar instituição' }))
  fireEvent.change(screen.getByLabelText('Nome da instituição'), { target: { value: 'Novo nome' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar.')
  expect(screen.getByLabelText('Nome da instituição')).toHaveValue('Novo nome')
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByText('Instituição atualizada.')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Novo nome' })).toBeInTheDocument()
  expect(updateMyInstitutionAction).toHaveBeenLastCalledWith({ name: 'Novo nome', subdomain: 'instituicao' })
})

it('não oferece edição sem autorização', async () => {
  vi.mocked(getMyTenantsAction).mockResolvedValue([{ userId: 'u1', tenantId: 't1', tenantName: 'Instituição', tenantSubdomain: 'instituicao', role: 'member', isCurrent: true }])
  render(<UserTenantsList />)
  await screen.findByRole('heading', { name: 'Instituição' })
  expect(screen.queryByRole('button', { name: 'Editar instituição' })).not.toBeInTheDocument()
})

it('permite corrigir identificador duplicado e mantém a edição aberta', async () => {
  vi.mocked(getMyTenantsAction).mockResolvedValue([{ userId: 'u1', tenantId: 't1', tenantName: 'Instituição', tenantSubdomain: 'antes', role: 'admin', isCurrent: true }])
  vi.mocked(updateMyInstitutionAction).mockResolvedValueOnce({ error: 'Este identificador já está em uso. Escolha outro.', field: 'subdomain' }).mockResolvedValueOnce({ name: 'Instituição', subdomain: 'livre' })
  render(<UserTenantsList canEditCurrent />)
  fireEvent.click(await screen.findByRole('button', { name: 'Editar instituição' }))
  fireEvent.change(screen.getByLabelText('Identificador'), { target: { value: 'ocupado' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('já está em uso')
  expect(screen.getByLabelText('Identificador')).toHaveAttribute('aria-invalid', 'true')
  await waitFor(() => expect(screen.getByLabelText('Identificador')).toHaveFocus())
  fireEvent.change(screen.getByLabelText('Identificador'), { target: { value: 'livre' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByText('Identificador: livre')).toBeInTheDocument()
})

it('pesquisa instituições por nome e identificador sem diferenciar acentos', async () => {
  vi.mocked(getMyTenantsAction).mockResolvedValue([
    { userId: 'u1', tenantId: 't1', tenantName: 'São Paulo', tenantSubdomain: 'paulista', role: 'admin', isCurrent: true },
    { userId: 'u2', tenantId: 't2', tenantName: 'Garça', tenantSubdomain: 'fatec-garca', role: 'member', isCurrent: false },
  ])
  render(<UserTenantsList />)
  const search = await screen.findByRole('searchbox', { name: 'Pesquisar instituições' })
  fireEvent.change(search, { target: { value: 'SAO' } })
  expect(screen.getByRole('heading', { name: 'São Paulo' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Garça' })).not.toBeInTheDocument()
  fireEvent.change(search, { target: { value: 'fatec-garca' } })
  expect(screen.getByRole('heading', { name: 'Garça' })).toBeVisible()
  fireEvent.change(search, { target: { value: 'inexistente' } })
  expect(screen.getByText('Nenhuma instituição corresponde à pesquisa')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }))
  expect(search).toHaveValue('')
  expect(screen.getByRole('heading', { name: 'São Paulo' })).toBeVisible()
})
