'use client'
import Link from 'next/link'
import type { ReactNode } from 'react'
import Tooltip from '@/components/ui/Tooltip'
import { useSidebarMode } from '@/hooks/useSidebarMode'
import { useMediaQuery } from '@/hooks/useMediaQuery'
export default function SidebarNavLink({ href, label, active = false, children, className = '' }: { href: string; label: string; active?: boolean; children: ReactNode; className?: string }) {
  const { mode } = useSidebarMode()
  const mobile = useMediaQuery('(max-width: 767px)')
  const link = <Link href={href} aria-label={label} aria-current={active ? 'page' : undefined} className={`sidebar-nav-link ${active ? 'bg-blue-50' : ''} ${className}`}>{children}<span data-nav-label>{label}</span></Link>
  return mode === 'compact' && !mobile ? <span className="sidebar-nav-tooltip"><Tooltip label={label} side="bottom">{link}</Tooltip></span> : link
}
