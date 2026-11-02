import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import AdminTenantsClient from '@/components/admin/AdminTenantsClient'
import { updateTenantNameAction, updateTenantStatusAction, checkInstitutionIdentifierAction } from '@/app/actions/admin'
vi.mock('@/app/actions/admin', () => ({ createTenantAction: vi.fn(), checkInstitutionIdentifierAction: vi.fn(), updateTenantStatusAction: vi.fn(), updateTenantNameAction: vi.fn(), joinAsTenantAdminAction: vi.fn() }))
const tenants = [
  { id: '1', name: 'Instituição São Paulo', subdomain: 'sao-paulo', status: 'ACTIVE' as const, createdAt: new Date(), _count: { users: 2 } },
  { id: '2', name: 'Garça', subdomain: 'garca', status: 'SUSPENDED' as const, createdAt: new Date(), _count: { users: 1 } },
]
describe('instituições da plataforma', () => {
  it('pesquisa sem acentos por nome, identificador e situação e permite limpar', () => {
    render(<AdminTenantsClient initialTenants={tenants} myTenantIds={['1', '2']} />)
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'sao paulo' } })
    expect(screen.getByText('Instituição São Paulo')).toBeInTheDocument()
    expect(screen.queryByText('Garça')).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'suspenso' } })
    expect(screen.getByText('Garça')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'inexistente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }))
    expect(screen.getByText('Instituição São Paulo')).toBeInTheDocument()
  })
  it('preserva a edição e mostra falha do servidor ao salvar nome', async () => {
    vi.mocked(updateTenantNameAction).mockResolvedValueOnce({ error: 'Não foi possível salvar.' })
    render(<AdminTenantsClient initialTenants={[tenants[0]]} myTenantIds={['1']} />)
    fireEvent.click(screen.getByTitle('Editar nome'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da instituição' }), { target: { value: 'Novo nome' } })
    fireEvent.click(screen.getByTitle('Salvar'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar.'))
    expect(screen.getByRole('textbox', { name: 'Nome da instituição' })).toHaveValue('Novo nome')
  })
})

it('exige confirmação antes de excluir e mantém a instituição se o servidor falhar', async () => {
  vi.mocked(updateTenantStatusAction).mockResolvedValueOnce({ error: 'Operação recusada.' })
  render(<AdminTenantsClient initialTenants={[tenants[0]]} myTenantIds={['1']} />)
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }))
  expect(updateTenantStatusAction).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toHaveTextContent('excluída da listagem')
  fireEvent.click(screen.getByRole('button', { name: 'Excluir instituição' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Operação recusada.'))
  expect(updateTenantStatusAction).toHaveBeenCalledWith('1', 'REMOVED')
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})

it('envia nome e identificador juntos ao editar uma instituição', async () => {
  vi.mocked(updateTenantNameAction).mockResolvedValueOnce({})
  render(<AdminTenantsClient initialTenants={[tenants[0]]} myTenantIds={['1']} />)
  fireEvent.click(screen.getByTitle('Editar nome'))
  fireEvent.change(screen.getByRole('textbox', { name: 'Identificador' }), { target: { value: 'novo-acesso' } })
  fireEvent.click(screen.getByTitle('Salvar'))
  await waitFor(() => expect(updateTenantNameAction).toHaveBeenCalledWith('1', 'Instituição São Paulo', 'novo-acesso'))
  expect(await screen.findByText('Identificador: novo-acesso')).toBeInTheDocument()
})

it('gera sugestão livre e preserva o identificador escolhido manualmente', async () => {
  vi.mocked(checkInstitutionIdentifierAction).mockImplementation(async identifier => identifier === 'teste-brasileiro' ? { available: false, suggestion: 'teste-brasileiro-2' } : { available: true, suggestion: identifier })
  render(<AdminTenantsClient initialTenants={[]} myTenantIds={[]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Nova instituição' }))
  fireEvent.change(screen.getByLabelText('Nome da instituição'), { target: { value: 'Teste Brasileiro' } })
  expect(screen.getByLabelText('Identificador de acesso')).toHaveValue('teste-brasileiro')
  await waitFor(() => expect(screen.getByLabelText('Identificador de acesso')).toHaveValue('teste-brasileiro-2'))
  fireEvent.change(screen.getByLabelText('Identificador de acesso'), { target: { value: 'minha-escolha' } })
  fireEvent.change(screen.getByLabelText('Nome da instituição'), { target: { value: 'Outro nome' } })
  expect(screen.getByLabelText('Identificador de acesso')).toHaveValue('minha-escolha')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Criar instituição' })).toBeEnabled())
})

it('mantém suspensas no fim com visual próprio e retira excluídas da listagem', () => {
  const { container } = render(<AdminTenantsClient initialTenants={[tenants[1], tenants[0], { ...tenants[0], id: 'removed', name: 'Excluída antiga', status: 'REMOVED' }]} myTenantIds={[]} />)
  expect(Array.from(container.querySelectorAll('.institution-item h3')).map(node => node.textContent)).toEqual(['Instituição São Paulo', 'Garça'])
  expect(container.querySelector('[data-suspended="true"]')).toHaveTextContent('Garça')
  expect(screen.queryByText('Excluída antiga')).not.toBeInTheDocument()
})
