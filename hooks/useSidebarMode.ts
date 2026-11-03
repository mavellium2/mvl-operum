'use client'
import { useSyncExternalStore } from 'react'
export type SidebarMode = 'expanded' | 'compact' | 'hidden'
const key = 'operum.sidebar.mode'
const listeners = new Set<() => void>()
let memory: SidebarMode = 'expanded'
function read(): SidebarMode {
  try { const value = localStorage.getItem(key); if (value === 'expanded' || value === 'compact' || value === 'hidden') return value; if (!value && (localStorage.getItem('wbs-global-sidebar-collapsed') === '1' || localStorage.getItem('wbs-project-sidebar-collapsed') === '1')) return 'compact' } catch { /* Preferência em memória. */ }
  return memory
}
function subscribe(listener: () => void) { listeners.add(listener); window.addEventListener('storage', listener); return () => { listeners.delete(listener); window.removeEventListener('storage', listener) } }
export function useSidebarMode() {
  const mode = useSyncExternalStore(subscribe, read, () => 'expanded' as SidebarMode)
  const setMode = (next: SidebarMode) => { memory = next; try { localStorage.setItem(key, next) } catch { /* Armazenamento bloqueado não impede usar o menu. */ } listeners.forEach(fn => fn()) }
  return { mode, setMode }
}
