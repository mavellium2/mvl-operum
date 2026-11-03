import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectNavigationProvider, useProjectNavigation, keepsProjectNavigation } from '@/components/layout/ProjectNavigationContext'
vi.mock('@/components/layout/ProjectSidebar', () => ({ default: () => null }))
function Probe() {
  const context = useProjectNavigation()!
  return <><button onClick={() => context.remember({ projetoId: 'p1', projectName: 'Projeto teste', canManageMembers: false, canManageGlobalCatalogs: false, permissions: ['documentos:ver'] })}>Entrar</button><span>{context.project?.projectName ?? 'Global'}</span></>
}
describe('contexto de navegação do projeto', () => {
  it('mantém telas auxiliares e encerra o contexto ao voltar aos projetos ou administração da plataforma', () => {
    for (const path of ['/admin/cadastros/departamentos', '/admin/cadastros/funcoes', '/configuracoes/perfil', '/configuracoes/aparencia', '/configuracoes', '/sobre', '/notificacoes']) expect(keepsProjectNavigation(path)).toBe(true)
    for (const path of ['/projetos', '/admin/tenants', '/admin/users', '/login', '/dashboard']) expect(keepsProjectNavigation(path)).toBe(false)
  })
  it('inicia global, lembra o projeto e limpa ao trocar de instituição', () => {
    render(<ProjectNavigationProvider><Probe /></ProjectNavigationProvider>)
    expect(screen.getByText('Global')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Entrar'))
    expect(screen.getByText('Projeto teste')).toBeInTheDocument()
    fireEvent(window, new Event('operum:tenant-changed'))
    expect(screen.getByText('Global')).toBeInTheDocument()
  })
})
