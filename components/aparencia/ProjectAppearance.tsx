'use client'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { appearanceBlendStyle, palettes } from '@/lib/appearancePalette'
import type { AppearancePeriod } from '@/lib/appearance'
import { useAppearance } from '@/hooks/useAppearance'
import './appearance.css'

const SKY_PERIODS: AppearancePeriod[] = ['morning', 'day', 'afternoon', 'night']

export default function ProjectAppearance({ enabled, focusProjectName = false, isolated = false, children }: { enabled: boolean; focusProjectName?: boolean; isolated?: boolean; children: React.ReactNode }) {
  const { period, blend } = useAppearance()
  const blendStyle = useMemo(() => appearanceBlendStyle(blend), [blend])
  const isolatedStyle = useMemo(() => {
    const palette = palettes[period ?? 'morning']
    return {
      ...Object.fromEntries(['bg', 'surface', 'input', 'text', 'muted', 'border', 'glow', 'accent'].map(key => [`--ap-${key}`, palette[key]])),
      ...Object.fromEntries([['body', 'glass'], ['float', 'float'], ['edge', 'edge'], ['light', 'light'], ['shadow', 'shadow']].map(([target, source]) => [`--glass-${target}`, palette[source]])),
      ...blendStyle,
    }
  }, [period, blendStyle])
  const root = useRef<HTMLDivElement>(null)
  const focused = useRef(false)
  useEffect(() => {
    if (!focusProjectName || !period || focused.current) return
    const field = root.current?.querySelector<HTMLTextAreaElement>('[data-project-name]')
    if (field) { field.focus({ preventScroll: true }); focused.current = true }
  }, [focusProjectName, period])
  useLayoutEffect(() => {
    if (!enabled || !period) return
    document.body.dataset.operumPeriod = period
    if (blend) document.body.dataset.operumBlending = 'true'
    else delete document.body.dataset.operumBlending
    for (const [key, value] of Object.entries(blendStyle)) document.body.style.setProperty(key, value)
    return () => {
      delete document.body.dataset.operumPeriod
      delete document.body.dataset.operumBlending
      for (const key of Object.keys(blendStyle)) document.body.style.removeProperty(key)
    }
  }, [enabled, period, blend, blendStyle])
  return <div ref={root} className={enabled ? isolated ? 'project-appearance-isolated' : 'project-appearance' : undefined} data-period={enabled ? period ?? undefined : undefined} data-blending={enabled && blend ? 'true' : undefined}
    style={enabled ? isolated ? isolatedStyle : blendStyle : undefined}>
    {enabled && !isolated && SKY_PERIODS.map(sky => <div key={sky} aria-hidden="true"
      className="fundo-vidro project-sky" data-sky={sky} data-visible={period === sky}
      style={blend ? { opacity: sky === blend.to ? blend.progress : sky === blend.from ? 1 : 0, zIndex: sky === blend.to ? -1 : sky === blend.from ? -2 : -3 } : undefined} />)}
    {children}
  </div>
}
