import type { AppearanceBlend, AppearancePeriod } from './appearance'

const palettes: Record<AppearancePeriod, Record<string, string>> = {
  morning: { bg: '#f1f6fc', surface: '#ffffffde', input: '#f5f8fc', text: '#202c40', muted: '#52627a', border: '#d7e1ee', glow: '#dbeafe', accent: '#2563eb', glass: '#ffffff5c', float: '#ffffff40', edge: '#ffffff47', light: '#ffffffb8', shadow: '#1c23462b', sidebar: '#e6e9f5e8', status: '#52766e' },
  day: { bg: '#dceefa', surface: '#f7fcffe0', input: '#eaf4fb', text: '#20364b', muted: '#49677f', border: '#bed8eb', glow: '#b1daf5', accent: '#2476bc', glass: '#ffffff5c', float: '#ffffff40', edge: '#ffffff47', light: '#ffffffb8', shadow: '#24557c2e', sidebar: '#e4f3fce0', status: '#52766e' },
  afternoon: { bg: '#f5efe7', surface: '#fffcf5e8', input: '#f5efe5', text: '#393128', muted: '#71604c', border: '#e0d5c5', glow: '#f5d5ad', accent: '#916236', glass: '#ffffff5c', float: '#ffffff40', edge: '#ffffff47', light: '#ffffffb8', shadow: '#1c23462b', sidebar: '#eddfd1ed', status: '#28584a' },
  night: { bg: '#070b20', surface: '#141a37ed', input: '#121932', text: '#e9eaff', muted: '#afb5da', border: '#383e70', glow: '#472b78', accent: '#c1a2f0', glass: '#111939a3', float: '#1e224870', edge: '#a3a0e81f', light: '#d0d2ff42', shadow: '#01031275', sidebar: '#161d3aed', status: '#b3ccc3' },
}

const lightFinance = { statStart: '#fff8dacc', statEnd: '#ffe39c6b', statText: '#76501f', pendingStart: '#ffeedcd1', pendingEnd: '#ffc18e70', pendingText: '#86431e', budgetStart: '#d3e9ffdb', budgetEnd: '#84b6eb9e', budgetText: '#244f79' }
const financialPalettes: Record<AppearancePeriod, Record<string, string>> = {
  morning: lightFinance, day: lightFinance,
  afternoon: { statStart: '#ffe6bab8', statEnd: '#efbb707a', statText: '#754724', pendingStart: '#ffdccbc7', pendingEnd: '#ef9b7b73', pendingText: '#874428', budgetStart: '#acbce8b8', budgetEnd: '#788fcb8c', budgetText: '#283e6e' },
  night: { statStart: '#c6beff0f', statEnd: '#a9baff04', statText: '#e9eaff', pendingStart: '#c6beff0f', pendingEnd: '#a9baff04', pendingText: '#e9eaff', budgetStart: '#29264be0', budgetEnd: '#131d38f0', budgetText: '#f4f2ff' },
}

/** Cor perceptual contínua, sem transparência artificial entre os dois temas. */
export function appearanceBlendStyle(blend: AppearanceBlend | null): Record<string, string> {
  if (!blend) return {}
  const percent = Math.max(0, Math.min(1, blend.progress)) * 100
  const from = { ...palettes[blend.from], ...financialPalettes[blend.from] }, to = { ...palettes[blend.to], ...financialPalettes[blend.to] }
  const mix = (key: string) => `color-mix(in oklab, ${from[key]} ${100 - percent}%, ${to[key]} ${percent}%)`
  const style: Record<string, string> = {}
  for (const key of ['bg', 'surface', 'input', 'text', 'muted', 'border', 'glow', 'accent']) style[`--ap-${key}`] = mix(key)
  for (const [key, source] of [['body', 'glass'], ['float', 'float'], ['edge', 'edge'], ['light', 'light'], ['shadow', 'shadow']]) style[`--glass-${key}`] = mix(source)
  for (const key of Object.keys(lightFinance)) style[`--blend-${key}`] = mix(key)
  style['--blend-sidebar'] = mix('sidebar')
  style['--blend-status'] = mix('status')
  return style
}
