import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import CadastrosNavigation from '@/components/admin/CadastrosNavigation'
const navigation = vi.hoisted(() => ({ path: '/admin/cadastros/departamentos', push: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.path, useRouter: () => ({ push: navigation.push }) }))
it('preserva a mesma lente ao trocar de rota, permitindo a animação compartilhada', () => {
  const { container, rerender } = render(<CadastrosNavigation />)
  const lens = container.querySelector('.pointer-events-none')
  fireEvent.click(screen.getByRole('tab', { name: 'Funções' }))
  expect(navigation.push).toHaveBeenCalledWith('/admin/cadastros/funcoes')
  navigation.path = '/admin/cadastros/funcoes'
  rerender(<CadastrosNavigation />)
  expect(container.querySelector('.pointer-events-none')).toBe(lens)
  expect(screen.getByRole('tab', { name: 'Funções' })).toHaveAttribute('aria-selected', 'true')
  expect(lens).toHaveStyle({ transform: 'translateX(calc(1 * (100% + 0.25rem)))' })
})
