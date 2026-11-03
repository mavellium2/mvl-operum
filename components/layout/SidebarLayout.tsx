'use client'

import GlassButton from '@/components/ui/GlassButton'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { PanelLeftClose, PanelLeftOpen, Menu, Bell, EyeOff, Search, ArrowLeft, FolderKanban } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useOverlay } from '@/hooks/useOverlay'
import { useSidebarMode } from '@/hooks/useSidebarMode'
import { useSidebarSession } from '@/hooks/useSidebarSession'
import GlobalSearch from '@/components/search/GlobalSearch'
import TenantSwitcher from './TenantSwitcher'
import SidebarAccount from './SidebarAccount'
import { fetchWithSession } from '@/lib/clientFetch'
import { useAppearance } from '@/hooks/useAppearance'
import { palettes, appearanceBlendStyle } from '@/lib/appearancePalette'
import type { CSSProperties } from 'react'
import './sidebar.css'

interface Props {
  panelId?: string; title: string; searchPlaceholder: string
  searchContext: 'global_projects' | 'project_items' | 'sprint_items' | 'project_members' | 'default'
  contextId?: string; currentSprintId?: string; projectName?: string
  collapsed?: boolean; animated?: boolean; onToggleCollapse?: () => void; logoHref?: string; children: ReactNode
}
export default function SidebarLayout({ panelId: suppliedId, title, searchPlaceholder, searchContext, contextId, currentSprintId, projectName, collapsed = false, onToggleCollapse, logoHref = '/', children }: Props) {
  const appearance = useAppearance()
  const palette = palettes[appearance.period ?? 'morning']
  const blend = appearanceBlendStyle(appearance.blend)
  const sidebarStyle = { '--sb-fill': blend['--blend-sidebar'] ?? palette.sidebar, '--sb-solid': blend['--ap-bg'] ?? palette.bg, '--sb-text': blend['--ap-text'] ?? palette.text, '--sb-muted': blend['--ap-muted'] ?? palette.muted, '--sb-accent': blend['--ap-accent'] ?? palette.accent, '--sb-edge': blend['--glass-edge'] ?? palette.edge, '--sb-light': blend['--glass-light'] ?? palette.light } as CSSProperties
  const preference = useSidebarMode()
  const mode = onToggleCollapse ? collapsed ? 'hidden' : 'expanded' : preference.mode
  const mobile = useMediaQuery('(max-width: 767px)')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const { user } = useSidebarSession()
  const [searchOpen, setSearchOpen] = useState(false)
  const overlay = useRef<HTMLDivElement>(null)
  const expand = useRef<HTMLButtonElement>(null)
  const collapse = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLDivElement>(null)
  const uid = useId(), panelId = suppliedId ?? uid
  const compact = !mobile && mode === 'compact'
  const hidden = mobile ? !mobileOpen : mode === 'hidden'
  const zIndex = useOverlay(overlay, () => setMobileOpen(false), mobile && mobileOpen)
  const pathname = usePathname(), previousPath = useRef(pathname)
  useEffect(() => { if (previousPath.current !== pathname) { previousPath.current = pathname; setMobileOpen(false); setSearchOpen(false) } }, [pathname])
  useEffect(() => {
    if (!user) return
    let active = true
    const refresh = () => { fetchWithSession('/api/notificacoes/count').then(r => r.json()).then(data => { if (active && typeof data.count === 'number') setUnread(data.count) }).catch(() => {}) }
    refresh(); const timer = setInterval(refresh, 60000)
    return () => { active = false; clearInterval(timer) }
  }, [user])
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return; event.preventDefault(); if (mobile) setMobileOpen(true); else preference.setMode('expanded'); setSearchOpen(true) }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [mobile, preference])
  useEffect(() => { if (searchOpen && !hidden) search.current?.querySelector<HTMLInputElement>('input')?.focus() }, [searchOpen, hidden])
  const previousHidden = useRef(hidden)
  useEffect(() => {
    if (previousHidden.current !== hidden && !mobile) { if (hidden) (document.querySelector<HTMLButtonElement>('[data-sidebar-expand]') ?? expand.current)?.focus(); else if (searchOpen) search.current?.querySelector<HTMLInputElement>('input')?.focus(); else collapse.current?.focus() }
    previousHidden.current = hidden
  }, [hidden, mobile, searchOpen])
  const toggle = () => { if (mobile) setMobileOpen(false); else if (onToggleCollapse) onToggleCollapse(); else preference.setMode(compact ? 'expanded' : 'compact') }
  return <>
    <GlassButton ref={expand} hidden={!mobile && !hidden} variant="icon" aria-label={mobile ? 'Abrir menu lateral' : 'Expandir menu lateral'} aria-expanded={mobile ? mobileOpen : !hidden} aria-controls={panelId} onClick={() => { if (mobile) setMobileOpen(true); else if (onToggleCollapse) onToggleCollapse(); else preference.setMode('expanded') }} data-sidebar-expand className={`sidebar-open ${!mobile ? 'sidebar-open--desktop' : ''} ${mobile || hidden ? '' : 'sidebar-open--off'}`}><Menu size={20} aria-hidden="true" /></GlassButton>
    <div ref={overlay} tabIndex={-1} role={mobile && mobileOpen ? 'dialog' : undefined} aria-label={mobile && mobileOpen ? 'Menu lateral' : undefined} aria-modal={mobile && mobileOpen ? true : undefined} className={mobile && mobileOpen ? 'sidebar-mobile-overlay' : 'contents'} style={mobile && mobileOpen ? { zIndex } : undefined}>
      {mobile && <div data-open={mobileOpen} className="sidebar-mobile-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <aside style={sidebarStyle} data-operum-sidebar data-project-sidebar={Boolean(projectName) || undefined} data-mode={mobile ? 'expanded' : mode} id={panelId} tabIndex={-1} aria-hidden={hidden || undefined} inert={hidden} className={`operum-sidebar ${mobileOpen ? 'is-mobile-open' : ''}`} onClick={event => { if (mobile && (event.target as HTMLElement).closest('a[href]')) setMobileOpen(false) }}>
        <div className="sidebar-inner" hidden={!mobile && hidden}>
          <div className="sidebar-brand-row"><Link href={logoHref} aria-label="Operum" className="sidebar-brand"><span className="sidebar-brand-symbol"><Image src="/icons/operum.svg" width={32} height={32} alt="" /></span>{!compact && <span>Operum</span>}</Link><div className="sidebar-brand-controls"><GlassButton ref={collapse} variant="icon" title={compact ? 'Expandir menu' : 'Recolher menu'} aria-label={compact ? 'Expandir menu lateral' : 'Recolher menu lateral'} aria-expanded={!compact} aria-controls={panelId} onClick={toggle}>{compact ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}</GlassButton>{!mobile && !onToggleCollapse && <GlassButton variant="icon" className="sidebar-hide" aria-label="Ocultar menu lateral" title="Ocultar menu lateral" onClick={() => preference.setMode('hidden')}><EyeOff size={16} aria-hidden="true" /></GlassButton>}</div></div>
          <div className="sidebar-context"><TenantSwitcher compact={compact} />{projectName && <div className={`sidebar-project-context ${compact ? 'sidebar-project-context--compact' : ''}`}><Link href="/projetos" className="sidebar-project-back" aria-label="Todos os projetos" title="Todos os projetos"><ArrowLeft size={14} aria-hidden="true" />{!compact && <span>Todos os projetos</span>}</Link>{!compact && <div className="sidebar-project-identity"><span className="sidebar-project-symbol"><FolderKanban size={18} aria-hidden="true" /></span><div><span>Projeto atual</span><strong title={projectName}>{projectName}</strong></div></div>}</div>}</div>
          <div className="sidebar-search" ref={search}>{compact ? <GlassButton variant="icon" aria-label="Pesquisar" title="Pesquisar · Ctrl/Cmd K" onClick={() => { preference.setMode('expanded'); setSearchOpen(true) }}><Search size={18} aria-hidden="true" /></GlassButton> : <GlobalSearch placeholder={searchPlaceholder} searchContext={searchContext} contextId={contextId} currentSprintId={currentSprintId} />}</div>
          <nav aria-label={contextId ? 'Navegação do projeto' : 'Navegação principal'} className="sidebar-navigation">{children}</nav>
          <footer className="sidebar-footer"><Link href="/notificacoes" aria-label={unread ? `Notificações: ${unread} não lidas` : 'Notificações'} title="Notificações" className="sidebar-notifications"><Bell size={18} aria-hidden="true" />{!compact && <span>Notificações</span>}{unread > 0 && <span className="sidebar-unread">{unread > 99 ? '99+' : unread}</span>}</Link><SidebarAccount compact={compact} /></footer>
          <span className="sr-only">Página atual: {title}</span>
        </div>
      </aside>
    </div>
  </>
}
