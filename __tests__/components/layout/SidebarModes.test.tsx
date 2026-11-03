import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import SidebarLayout from '@/components/layout/SidebarLayout'
import Link from 'next/link'
vi.mock('next/navigation', () => ({ usePathname: () => '/projetos' }))
vi.mock('@/components/search/GlobalSearch', () => ({ default: () => <input aria-label="Busca global" /> }))
vi.mock('@/components/layout/TenantSwitcher', () => ({ default: () => <button>Instituição</button> }))
vi.mock('@/components/layout/SidebarAccount', () => ({ default: () => <button>Conta</button> }))
vi.mock('@/hooks/useSidebarSession', () => ({ useSidebarSession: () => ({ user: null, loading: false }) }))
beforeEach(() => { localStorage.setItem('operum.sidebar.mode', 'expanded') })
function Menu() { return <SidebarLayout title="Projetos" searchPlaceholder="Buscar" searchContext="default"><Link href="/projetos">Projetos</Link></SidebarLayout> }
it('compacta, oculta e reabre o menu preservando a preferência entre montagens', async () => {
  const first = render(<Menu />)
  fireEvent.click(screen.getByRole('button', { name: 'Recolher menu lateral' }))
  expect(first.container.querySelector('aside')).toHaveAttribute('data-mode', 'compact')
  expect(screen.getByRole('link', { name: 'Projetos' })).toBeInTheDocument()
  first.unmount()
  const next = render(<Menu />)
  expect(next.container.querySelector('aside')).toHaveAttribute('data-mode', 'compact')
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar menu lateral' }))
  expect(next.container.querySelector('aside')).toHaveAttribute('inert')
  fireEvent.click(screen.getByRole('button', { name: 'Expandir menu lateral' }))
  expect(next.container.querySelector('aside')).toHaveAttribute('data-mode', 'expanded')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher menu lateral' })).toHaveFocus())
})
it('Ctrl K reabre o menu oculto e leva o foco à busca', async () => {
  localStorage.setItem('operum.sidebar.mode', 'hidden')
  render(<Menu />)
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Busca global' })).toHaveFocus())
})
