'use client'

import { useEffect, useState } from 'react'
import { APPEARANCE_KEY, appearancePeriod, parseAppearance, type AppearanceMode, type AppearancePeriod } from '@/lib/appearance'

export function useAppearance() {
  const [mode, setMode] = useState<AppearanceMode>('automatic')
  const [period, setPeriod] = useState<AppearancePeriod | null>(null)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const refresh = () => {
      let saved: AppearanceMode = 'automatic'
      try { saved = parseAppearance(localStorage.getItem(APPEARANCE_KEY)) } catch { /* Usa horário local se o armazenamento estiver indisponível. */ }
      setMode(saved)
      setPeriod(appearancePeriod(saved, new Date().getHours(), media.matches))
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
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
  return { mode, period, save }
}
