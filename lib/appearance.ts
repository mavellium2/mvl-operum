export type AppearanceMode = 'automatic' | 'light' | 'day' | 'afternoon' | 'dark' | 'system'
export type AppearancePeriod = 'morning' | 'day' | 'afternoon' | 'night'
export const APPEARANCE_KEY = 'operum.appearance.v1'
export function parseAppearance(value: string | null): AppearanceMode {
  return value === 'day' || value === 'afternoon' || value === 'light' || value === 'dark' || value === 'system' ? value : 'automatic'
}
export function appearancePeriod(mode: AppearanceMode, hour: number, systemDark = false): AppearancePeriod {
  if (mode === 'day') return 'day'
  if (mode === 'afternoon') return 'afternoon'
  if (mode === 'dark' || (mode === 'system' && systemDark)) return 'night'
  if (mode === 'light' || mode === 'system') return 'morning'
  return hour >= 19 || hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'day' : 'afternoon'
}

export interface AppearanceBlend {
  from: AppearancePeriod
  to: AppearancePeriod
  progress: number
}
export interface AppearanceFrame { period: AppearancePeriod; blend: AppearanceBlend | null }

/** Dez minutos centrados em cada virada, sempre pelo relógio local do dispositivo. */
export function appearanceFrame(mode: AppearanceMode, date: Date, systemDark = false): AppearanceFrame {
  const period = appearancePeriod(mode, date.getHours(), systemDark)
  if (mode !== 'automatic') return { period, blend: null }
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60_000
  const boundaries: [number, AppearancePeriod, AppearancePeriod][] = [
    [360, 'night', 'morning'], [720, 'morning', 'day'], [1020, 'day', 'afternoon'], [1140, 'afternoon', 'night'],
  ]
  for (const [at, from, to] of boundaries) {
    if (minutes >= at - 5 && minutes < at + 5) return { period, blend: { from, to, progress: (minutes - at + 5) / 10 } }
  }
  return { period, blend: null }
}
