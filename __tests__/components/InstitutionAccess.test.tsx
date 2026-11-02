import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import InstitutionAccess from '@/components/instituicoes/InstitutionAccess'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'
vi.mock('@/app/actions/auth', () => ({ getMyTenantsAction: vi.fn(), switchTenantAction: vi.fn() }))
beforeEach(() => vi.resetAllMocks())
it('acessa um vínculo confirmado usando a troca de conta existente', async () => {
  vi.mocked(getMyTenantsAction).mockResolvedValue([{ tenantId: 't1', userId: 'u1', tenantName: 'Fatec', tenantSubdomain: 'fatec', role: 'admin', isCurrent: false }])
  render(<InstitutionAccess tenantId="t1" name="Fatec" />)
  fireEvent.click(screen.getByRole('button', { name: 'Acessar' }))
  await waitFor(() => expect(switchTenantAction).toHaveBeenCalledWith('t1', undefined))
})
it('pede a senha correta antes de trocar e preserva erro de autenticação', async () => {
  vi.mocked(getMyTenantsAction).mockResolvedValue([{ tenantId: 't1', userId: 'u1', tenantName: 'Fatec', tenantSubdomain: 'fatec', role: 'admin', isCurrent: false, requiresPassword: true, passwordScope: 'current' }])
  vi.mocked(switchTenantAction).mockResolvedValue({ error: 'Senha incorreta', needsPassword: true })
  render(<InstitutionAccess tenantId="t1" name="Fatec" />)
  fireEvent.click(screen.getByRole('button', { name: 'Acessar' }))
  const field = await screen.findByLabelText('Senha da conta que está ativa')
  expect(switchTenantAction).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'senha-teste' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar acesso' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar acesso' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Senha incorreta')
  expect(switchTenantAction).toHaveBeenCalledWith('t1', 'senha-teste')
})
