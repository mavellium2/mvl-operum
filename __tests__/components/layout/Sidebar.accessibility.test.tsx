import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SidebarLayout from '@/components/layout/SidebarLayout'
import { usePathname } from 'next/navigation'
vi.mock('next/navigation', () => ({ usePathname: vi.fn(() => '/projetos') }))
vi.mock('@/components/search/GlobalSearch', () => ({ default: () => <input aria-label="Buscar" /> }))
vi.mock('@/components/layout/TenantSwitcher', () => ({ default: () => <button>Instituição</button> }))
vi.mock('@/lib/clientFetch', () => ({ fetchWithSession: vi.fn().mockResolvedValue(Response.json({})) }))
vi.mock('@/app/actions/auth', () => ({ logoutAction: vi.fn() }))
let mobile = false
const listeners = new Set<() => void>()
beforeEach(() => {
  mobile = false; listeners.clear(); vi.mocked(usePathname).mockReturnValue('/projetos')
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ get matches() { return mobile }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }) })
})
function Example() {
  const [collapsed, setCollapsed] = useState(false)
  return <><button data-sidebar-expand onClick={() => setCollapsed(false)} aria-expanded={!collapsed}>Expandir</button><SidebarLayout title="Projetos" searchPlaceholder="Buscar" searchContext="default" collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)}><a href="/sprint">Sprint</a></SidebarLayout><button>Conteúdo</button></>
}
describe('sidebar', () => {
  it('recolher remove navegação e busca do foco e expandir restaura foco previsível', async () => {
    const user = userEvent.setup()
    const { container } = render(<Example />)
    await user.click(screen.getByRole('button', { name: 'Recolher menu lateral' }))
    const expand = screen.getByRole('button', { name: 'Expandir' })
    expect(expand).toHaveFocus()
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('aside')).toHaveAttribute('inert')
    expect(screen.queryByRole('textbox', { name: 'Buscar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sprint' })).not.toBeInTheDocument()
    await user.tab({ shift: true })
    expect(document.activeElement?.closest('aside')).toBeNull()
    await user.click(expand)
    expect(screen.getByRole('button', { name: 'Recolher menu lateral' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toBeInTheDocument()
  })
  it('menu móvel contém foco, fecha na navegação e restaura acionador', async () => {
    mobile = true
    const user = userEvent.setup()
    const { rerender } = render(<Example />)
    const trigger = screen.getByRole('button', { name: 'Abrir menu lateral' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', { name: 'Menu lateral' })
    expect(dialog).not.toHaveAttribute('inert')
    await user.click(screen.getByRole('button', { name: 'Abrir menu da conta' }))
    expect(screen.getByRole('link', { name: 'Meu perfil' })).toBeVisible()
    const exit = screen.getByRole('button', { name: 'Sair' })
    exit.focus(); await user.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    if (screen.queryByRole('dialog', { name: 'Menu lateral' })) fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    vi.mocked(usePathname).mockReturnValue('/sprint'); rerender(<Example />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    act(() => { mobile = false; listeners.forEach(fn => fn()) })
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toBeInTheDocument()
  })
})
