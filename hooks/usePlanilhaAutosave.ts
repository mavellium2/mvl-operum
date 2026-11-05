'use client'

import { useEffect, useRef } from 'react'

/** Agrupa edições e adia o envio enquanto um título ou seletor está em uso. */
export function usePlanilhaAutosave({ changeKey, enabled, save, isSaving, delay = 1200 }: {
  changeKey: string; enabled: boolean; save: () => Promise<unknown>; isSaving: () => boolean; delay?: number
}) {
  const latest = useRef({ save, isSaving })
  useEffect(() => { latest.current = { save, isSaving } })
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const active = document.activeElement
        if (latest.current.isSaving() || active?.classList.contains('planilha-name-input') || active?.closest('[data-glass-select-panel]')) { schedule(); return }
        void latest.current.save()
      }, delay)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [changeKey, enabled, delay])
}
