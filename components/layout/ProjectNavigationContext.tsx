'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import ProjectSidebar from './ProjectSidebar'
import type { Permissao } from '@/lib/permissoes'

export interface ProjectNavigation {
  projetoId: string
  projectName: string
  canManageMembers: boolean
  canManageGlobalCatalogs: boolean
  permissions: Permissao[]
}
const Context = createContext<{ project: ProjectNavigation | null; remember: (project: ProjectNavigation | null) => void } | null>(null)
export function ProjectNavigationProvider({ children }: { children: ReactNode }) {
  const [project, remember] = useState<ProjectNavigation | null>(null)
  useEffect(() => {
    const clear = () => remember(null)
    window.addEventListener('operum:tenant-changed', clear)
    return () => window.removeEventListener('operum:tenant-changed', clear)
  }, [])
  const value = useMemo(() => ({ project, remember }), [project])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useProjectNavigation() { return useContext(Context) }
/** Guarda apenas a navegação recebida do servidor nesta sessão de navegação. */
export function RegisteredProjectSidebar(props: ProjectNavigation) {
  const navigation = useProjectNavigation()
  const remember = navigation?.remember
  useEffect(() => { remember?.(props) }, [remember, props.projetoId, props.projectName, props.canManageMembers, props.canManageGlobalCatalogs, props.permissions]) // eslint-disable-line react-hooks/exhaustive-deps
  return <ProjectSidebar {...props} />
}
export function keepsProjectNavigation(pathname: string) {
  return pathname === '/sobre' || pathname === '/notificacoes' || pathname === '/configuracoes' || pathname.startsWith('/configuracoes/') || pathname === '/admin/cadastros/departamentos' || pathname === '/admin/cadastros/funcoes'
}
