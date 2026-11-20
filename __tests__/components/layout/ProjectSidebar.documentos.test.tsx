import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const route = vi.hoisted(() => ({ pathname: '/projetos/p1/documentacao' }))
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams('doc=charter'),
  useRouter: () => nav,
}))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({
  useProjectPermissions: () => new Set(['documentos:ver', 'quadro:ver', 'planilha:ver']),
}))
// Só a lista de itens importa aqui (busca, cabeçalho e recolher ficam de fora).
vi.mock('@/components/layout/SidebarLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div data-testid="menu">{children}</div> }))
vi.mock('@/lib/clientFetch', () => ({ fetchWithSession: vi.fn(async () => Response.json({ versions: [] })) }))

import ProjectSidebar from '@/components/layout/ProjectSidebar'

describe('menu lateral do projeto — documentos', () => {
  it.each(['/projetos/p1/atas', '/projetos/p1/atas/nova', '/projetos/p1/atas/ata-1'])('mantém os documentos abertos em %s', pathname => {
    route.pathname = pathname
    render(<ProjectSidebar projetoId="p1" canManageMembers />)
    expect(screen.getByRole('navigation', { name: 'Documentos' })).toBeInTheDocument()
    route.pathname = '/projetos/p1/documentacao'
  })

  it('os documentos aparecem logo abaixo de "Documentação", antes dos itens seguintes', () => {
    render(<ProjectSidebar projetoId="p1" canManageMembers />)
    const menu = screen.getByTestId('menu')
    const filhos = [...menu.children]
    const documentacao = filhos.findIndex(el => el.textContent === 'Documentação')
    expect(filhos[documentacao + 1]).toBe(screen.getByRole('navigation', { name: 'Documentos' }))
    const planilha = filhos.findIndex(el => el.textContent === 'Planilha de Custos')
    expect(planilha).toBeGreaterThan(documentacao + 1)
  })

  it('clicar de novo em "Documentação" recolhe e reabre os documentos, com a seta indicando o estado', () => {
    render(<ProjectSidebar projetoId="p1" canManageMembers />)
    const item = screen.getByRole('link', { name: 'Documentação' })
    expect(item).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(item)
    expect(item).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Documentos' })).not.toBeInTheDocument()
    fireEvent.click(item)
    expect(item).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: 'Documentos' })).toBeInTheDocument()
  })

  it('fora da Documentação, o item aparece fechado e os documentos não são mostrados', () => {
    route.pathname = '/projetos/p1/dashboard'
    render(<ProjectSidebar projetoId="p1" canManageMembers />)
    expect(screen.getByRole('link', { name: 'Documentação' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('navigation', { name: 'Documentos' })).not.toBeInTheDocument()
    route.pathname = '/projetos/p1/documentacao'
  })

  it('Fotos e Vídeos e Apresentação Final e Vídeos ficam dentro da Documentação, não soltos no menu', () => {
    render(<ProjectSidebar projetoId="p1" canManageMembers />)
    const documentos = screen.getByRole('navigation', { name: 'Documentos' })
    expect(within(documentos).getByRole('button', { name: 'Fotos e Vídeos' })).toBeInTheDocument()
    expect(within(documentos).getByRole('button', { name: 'Apresentação Final e Vídeos' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Fotos e Vídeos' })).not.toBeInTheDocument()
    fireEvent.click(within(documentos).getByRole('button', { name: 'Fotos e Vídeos' }))
    expect(nav.push).toHaveBeenCalledWith('/projetos/p1/fotos-videos')
  })

  it('na tela de Fotos e Vídeos, a Documentação fica aberta com a seção marcada', () => {
    route.pathname = '/projetos/p1/fotos-videos'
    render(<ProjectSidebar projetoId="p1" canManageMembers />)
    expect(screen.getByRole('link', { name: 'Documentação' })).toHaveAttribute('aria-current', 'page')
    const documentos = screen.getByRole('navigation', { name: 'Documentos' })
    expect(within(documentos).getByRole('button', { name: 'Fotos e Vídeos' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(documentos).getByRole('button', { name: 'Canvas' }))
    expect(nav.push).toHaveBeenCalledWith('/projetos/p1/documentacao?doc=canvas')
    route.pathname = '/projetos/p1/documentacao'
  })
})
