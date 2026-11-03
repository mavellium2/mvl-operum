'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { fetchWithSession } from '@/lib/clientFetch'
interface SidebarUser { name: string; avatarUrl?: string | null; role?: string; platformOperator?: boolean }
const Context = createContext<{ user: SidebarUser | null; loading: boolean } | null>(null)
export function SidebarSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [session, setSession] = useState<{ user: SidebarUser | null; loading: boolean }>({ user: null, loading: true })
  useEffect(() => {
    let active = true
    const refresh = () => { fetchWithSession('/api/me').then(r => { if (r.ok === false) throw new Error(); return r.json() }).then(data => { if (active) setSession({ user: data.user ?? null, loading: false }) }).catch(() => { if (active) setSession(previous => ({ ...previous, loading: false })) }) }
    refresh(); window.addEventListener('operum:instituicao-atualizada', refresh)
    return () => { active = false; window.removeEventListener('operum:instituicao-atualizada', refresh) }
  }, [pathname])
  return <Context.Provider value={session}>{children}</Context.Provider>
}
export function useSidebarSession() {
  const context = useContext(Context)
  const [fallback, setFallback] = useState<{ user: SidebarUser | null; loading: boolean }>({ user: null, loading: true })
  useEffect(() => { if (context) return; let active = true; fetchWithSession('/api/me').then(r => r.json()).then(data => { if (active) setFallback({ user: data?.user ?? null, loading: false }) }).catch(() => { if (active) setFallback({ user: null, loading: false }) }); return () => { active = false } }, [context])
  return context ?? fallback
}
