'use client'

import { useEffect, useState } from 'react'
import { APPEARANCE_KEY, appearanceFrame, parseAppearance, type AppearanceMode, type AppearanceFrame } from '@/lib/appearance'

export function useAppearance() {
  const [mode, setMode] = useState<AppearanceMode>('automatic')
  const [frame, setFrame] = useState<AppearanceFrame | null>(null)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const refresh = () => {
      let saved: AppearanceMode = 'automatic'
      try { saved = parseAppearance(localStorage.getItem(APPEARANCE_KEY)) } catch { /* Usa horário local se o armazenamento estiver indisponível. */ }
      setMode(saved)
      const next = appearanceFrame(saved, new Date(), media.matches)
      setFrame(previous => previous?.period === next.period && previous?.blend?.from === next.blend?.from && previous?.blend?.to === next.blend?.to && previous?.blend?.progress === next.blend?.progress ? previous : next)
    }
    refresh()
    const timer = window.setInterval(refresh, 1_000)
    window.addEventListener('storage', refresh)
    window.addEventListener('operum-appearance', refresh)
    document.addEventListener('visibilitychange', refresh)
    media.addEventListener('change', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('operum-appearance', refresh)
      document.removeEventListener('visibilitychange', refresh)
      media.removeEventListener('change', refresh)
    }
  }, [])
  const save = (next: AppearanceMode) => {
    try { localStorage.setItem(APPEARANCE_KEY, next) } catch { return false }
    window.dispatchEvent(new Event('operum-appearance'))
    return true
  }
  return { mode, period: frame?.period ?? null, blend: frame?.blend ?? null, save }
}
