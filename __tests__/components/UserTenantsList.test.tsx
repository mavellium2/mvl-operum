import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserTenantsList from '@/components/UserTenantsList'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'

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
