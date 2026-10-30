import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/projetos/p1/documentacao',
  useSearchParams: () => new URLSearchParams('doc=charter'),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({
  useProjectPermissions: () => new Set(['documentos:ver', 'quadro:ver', 'planilha:ver']),
}))
// Só a lista de itens importa aqui (busca, cabeçalho e recolher ficam de fora).
vi.mock('@/components/layout/SidebarLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div data-testid="menu">{children}</div> }))
vi.mock('@/lib/clientFetch', () => ({ fetchWithSession: vi.fn(async () => Response.json({ versions: [] })) }))

import ProjectSidebar from '@/components/layout/ProjectSidebar'

describe('menu lateral do projeto — documentos', () => {
  it('os documentos aparecem logo abaixo de "Documentação", antes dos itens seguintes', () => {
    render(<ProjectSidebar projetoId="p1" canManageMembers />)
    const menu = screen.getByTestId('menu')
    const filhos = [...menu.children]
    const documentacao = filhos.findIndex(el => el.textContent === 'Documentação')
    expect(filhos[documentacao + 1]).toBe(screen.getByRole('navigation', { name: 'Documentos' }))
    const planilha = filhos.findIndex(el => el.textContent === 'Planilha de Custos')
    expect(planilha).toBeGreaterThan(documentacao + 1)
  })
})
