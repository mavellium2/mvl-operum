'use client'
import Link from 'next/link'
import type { MouseEvent, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import Tooltip from '@/components/ui/Tooltip'
import { useSidebarMode } from '@/hooks/useSidebarMode'
import { useMediaQuery } from '@/hooks/useMediaQuery'
/**
 * Item do menu lateral. Com `expanded` (item com submenu), mostra a seta de
 * aberto/fechado e anuncia o estado; `onClick` permite recolher sem navegar.
 */
export default function SidebarNavLink({ href, label, active = false, children, className = '', expanded, onClick }: { href: string; label: string; active?: boolean; children: ReactNode; className?: string; expanded?: boolean; onClick?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const { mode } = useSidebarMode()
  const mobile = useMediaQuery('(max-width: 767px)')
  const link = <Link href={href} aria-label={label} aria-current={active ? 'page' : undefined} aria-expanded={expanded} onClick={onClick} className={`sidebar-nav-link ${active ? 'bg-blue-50' : ''} ${className}`}>{children}<span data-nav-label>{label}</span>{expanded !== undefined && <ChevronDown className="sidebar-nav-chevron" data-expanded={expanded} aria-hidden="true" />}</Link>
  return mode === 'compact' && !mobile ? <span className="sidebar-nav-tooltip"><Tooltip label={label} side="bottom">{link}</Tooltip></span> : link
}
