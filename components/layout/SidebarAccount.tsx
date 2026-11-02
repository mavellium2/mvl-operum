'use client'
import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronUp, LogOut, UserRound, Settings, Info } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import GlassPopover from '@/components/ui/GlassPopover'
import UserAvatar from '@/components/user/UserAvatar'
import { useSidebarSession } from '@/hooks/useSidebarSession'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { navegarComGuarda } from '@/components/documentos/editor/GuardaSaida'
import { logoutAction } from '@/app/actions/auth'
export default function SidebarAccount({ compact = false }: { compact?: boolean }) {
  const { user } = useSidebarSession()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const mobile = useMediaQuery('(max-width: 767px)')
  const trigger = useRef<HTMLButtonElement>(null)
  return <>
    <GlassButton variant="custom" ref={trigger} aria-label="Abrir menu da conta" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)} className={`sidebar-account ${compact ? 'sidebar-account--compact' : ''}`} title={user?.name ?? 'Sua conta'}>
      <UserAvatar name={user?.name} avatarUrl={user?.avatarUrl} size="sm" />{!compact && <><span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold">{user?.name ?? 'Sua conta'}</span><span className="block text-[11px] opacity-65">Perfil e preferências</span></span><ChevronUp size={14} aria-hidden="true" /></>}
    </GlassButton>
    <GlassPopover inline={mobile} anchor={trigger} open={open} onClose={() => setOpen(false)} label="Sua conta">
      <p className="mb-3 text-sm font-semibold">{user?.name ?? 'Sua conta'}</p>
      <Link href="/configuracoes/perfil" className="sidebar-popover-link" onClick={() => setOpen(false)}><UserRound size={16} aria-hidden="true" />Meu perfil</Link>
      <Link href="/configuracoes" className="sidebar-popover-link" onClick={() => setOpen(false)}><Settings size={16} aria-hidden="true" />Configurações</Link>
      <Link href="/sobre" className="sidebar-popover-link" onClick={() => setOpen(false)}><Info size={16} aria-hidden="true" />Sobre o Operum{process.env.NEXT_PUBLIC_APP_VERSION && <span className="ml-auto text-xs opacity-60">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>}</Link>
      <div className="my-2 border-t border-current opacity-10" />
      <GlassButton variant="danger" disabled={pending} className="sidebar-account-logout w-full justify-start" onClick={() => { setOpen(false); navegarComGuarda(() => startTransition(() => logoutAction())) }}><LogOut size={15} aria-hidden="true" />{pending ? 'Saindo…' : 'Sair'}</GlassButton>
    </GlassPopover>
  </>
}
