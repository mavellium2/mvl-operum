'use client'

import { useEffect } from 'react'
import { useAppearance } from '@/hooks/useAppearance'
import './appearance.css'

export default function ProjectAppearance({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const { period } = useAppearance()
  useEffect(() => {
    if (!enabled || !period) return
    document.body.dataset.operumPeriod = period
    return () => { delete document.body.dataset.operumPeriod }
  }, [enabled, period])
  return <div className={enabled ? 'project-appearance' : undefined} data-period={enabled ? period ?? undefined : undefined}
    style={enabled && !period ? { visibility: 'hidden', background: '#151923', minHeight: '100vh' } : undefined}>{children}</div>
}
