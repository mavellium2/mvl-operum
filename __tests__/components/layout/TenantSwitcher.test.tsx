import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import TenantSwitcher from '@/components/layout/TenantSwitcher'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'
vi.mock('next/navigation', () => ({ usePathname: () => '/projetos' }))
vi.mock('@/app/actions/auth', () => ({ getMyTenantsAction: vi.fn(), switchTenantAction: vi.fn() }))
vi.mock('@/components/documentos/editor/GuardaSaida', () => ({ navegarComGuarda: vi.fn(fn => fn()) }))
const institutions = [
  { userId: 'u1', tenantId: 't1', tenantName: 'Ativa', tenantSubdomain: 'ativa', role: 'admin', isCurrent: true },
  { userId: 'u2', tenantId: 't2', tenantName: 'Fábio', tenantSubdomain: 'fabio', role: 'member', isCurrent: false },
]
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getMyTenantsAction).mockResolvedValue(institutions) })
it('pesquisa sem acentos, destaca o vínculo e mostra erro de troca sem fechar o painel', async () => {
  vi.mocked(switchTenantAction).mockResolvedValue({ error: 'Acesso recusado' })
  render(<TenantSwitcher />)
  fireEvent.click(await screen.findByRole('button', { name: 'Trocar de instituição: Ativa' }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'fabio' } })
  expect(within(screen.getByRole('dialog', { name: 'Trocar de instituição' })).queryByRole('button', { name: /Ativa/ })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Fábio/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Acesso recusado')
  expect(screen.getByRole('dialog', { name: 'Trocar de instituição' })).toBeInTheDocument()
})
it('pede a senha da conta correta no próprio seletor antes de trocar', async () => {
  vi.mocked(getMyTenantsAction).mockResolvedValue([institutions[0], { ...institutions[1], requiresPassword: true, passwordScope: 'current' }])
  vi.mocked(switchTenantAction).mockResolvedValue({ error: 'Senha incorreta', needsPassword: true })
  render(<TenantSwitcher />)
  fireEvent.click(await screen.findByRole('button', { name: 'Trocar de instituição: Ativa' }))
  fireEvent.click(screen.getByRole('button', { name: /Fábio/ }))
  expect(switchTenantAction).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Senha da conta que está ativa'), { target: { value: 'senha-teste' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar acesso' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta')
  await waitFor(() => expect(switchTenantAction).toHaveBeenCalledWith('t2', 'senha-teste'))
})
