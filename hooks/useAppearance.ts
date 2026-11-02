'use client'

import { palettes, appearanceBlendStyle } from '@/lib/appearancePalette'
import { useSyncExternalStore } from 'react'
import { APPEARANCE_KEY, appearanceFrame, parseAppearance, type AppearanceMode, type AppearanceFrame } from '@/lib/appearance'

type Snapshot = { mode: AppearanceMode; frame: AppearanceFrame | null }
const serverSnapshot: Snapshot = { mode: 'automatic', frame: null }
let snapshot = serverSnapshot
const listeners = new Set<() => void>()
let stop: (() => void) | undefined
function refresh() {
  let mode: AppearanceMode = 'automatic'
  try { mode = parseAppearance(localStorage.getItem(APPEARANCE_KEY)) } catch { /* Horário local como padrão. */ }
  const frame = appearanceFrame(mode, new Date(), window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (snapshot.mode === mode && JSON.stringify(snapshot.frame) === JSON.stringify(frame)) return
  const root = document.documentElement
  const blendStyle = appearanceBlendStyle(frame.blend)
  root.style.setProperty('--operum-initial-bg', blendStyle['--ap-bg'] ?? palettes[frame.period].bg)
  root.style.setProperty('--operum-initial-text', blendStyle['--ap-text'] ?? palettes[frame.period].text)
  root.dataset.appearanceInitial = frame.period
  snapshot = { mode, frame }
  listeners.forEach(listener => listener())
}
function getSnapshot() {
  if (!snapshot.frame && typeof window !== 'undefined') refresh()
  return snapshot
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!stop) {
    refresh()
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const timer = window.setInterval(refresh, 1000)
    window.addEventListener('storage', refresh)
    window.addEventListener('operum-appearance', refresh)
    document.addEventListener('visibilitychange', refresh)
    media.addEventListener('change', refresh)
    stop = () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('operum-appearance', refresh)
      document.removeEventListener('visibilitychange', refresh)
      media.removeEventListener('change', refresh)
    }
  }
  return () => { listeners.delete(listener); if (!listeners.size) { stop?.(); stop = undefined } }
}
export function useAppearance() {
  const { mode, frame } = useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot)
  const save = (next: AppearanceMode) => {
    try { localStorage.setItem(APPEARANCE_KEY, next) } catch { return false }
    refresh()
    window.dispatchEvent(new Event('operum-appearance'))
    return true
  }
  return { mode, period: frame?.period ?? null, blend: frame?.blend ?? null, save }
}
