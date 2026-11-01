export type AppearanceMode = 'automatic' | 'light' | 'afternoon' | 'dark' | 'system'
export type AppearancePeriod = 'morning' | 'afternoon' | 'night'
export const APPEARANCE_KEY = 'operum.appearance.v1'
export function parseAppearance(value: string | null): AppearanceMode {
  return value === 'afternoon' || value === 'light' || value === 'dark' || value === 'system' ? value : 'automatic'
}
export function appearancePeriod(mode: AppearanceMode, hour: number, systemDark = false): AppearancePeriod {
  if (mode === 'afternoon') return 'afternoon'
  if (mode === 'dark' || (mode === 'system' && systemDark)) return 'night'
  if (mode === 'light' || mode === 'system') return 'morning'
  return hour >= 18 || hour < 6 ? 'night' : hour < 12 ? 'morning' : 'afternoon'
}
