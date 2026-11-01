import { describe, expect, it } from 'vitest'
import { appearanceFrame } from '@/lib/appearance'
import { appearanceBlendStyle } from '@/lib/appearancePalette'

const at = (h: number, m: number, s = 0) => new Date(2026, 10, 1, h, m, s)
describe('mistura automática de dez minutos', () => {
  it.each([[6, 'night', 'morning'], [12, 'morning', 'day'], [17, 'day', 'afternoon'], [19, 'afternoon', 'night']] as const)('mistura antes e depois da virada das %sh', (hour, from, to) => {
    expect(appearanceFrame('automatic', at(hour - 1, 54, 59)).blend).toBeNull()
    expect(appearanceFrame('automatic', at(hour - 1, 55)).blend).toEqual({ from, to, progress: 0 })
    expect(appearanceFrame('automatic', at(hour, 0)).blend).toEqual({ from, to, progress: .5 })
    expect(appearanceFrame('automatic', at(hour, 4, 59)).blend?.progress).toBeCloseTo(599 / 600)
    expect(appearanceFrame('automatic', at(hour, 5))).toEqual({ period: to, blend: null })
  })
  it('abrir a tela no meio da virada usa o progresso real, sem reiniciar a animação', () => {
    expect(appearanceFrame('automatic', at(16, 57, 30)).blend?.progress).toBe(.25)
    expect(appearanceFrame('automatic', at(17, 2, 30)).blend?.progress).toBe(.75)
  })
  it.each(['light', 'day', 'afternoon', 'dark', 'system'] as const)('a escolha fixa %s não mistura pelo relógio', mode => {
    expect(appearanceFrame(mode, at(17, 0)).blend).toBeNull()
  })
  it('interpola céu/vidro com cores perceptuais sem criar clareamento branco', () => {
    const style = appearanceBlendStyle({ from: 'afternoon', to: 'night', progress: .5 })
    expect(style['--ap-text']).toBe('color-mix(in oklab, #393128 50%, #e9eaff 50%)')
    expect(style['--glass-body']).toContain('50%')
    expect(appearanceBlendStyle(null)).toEqual({})
  })
})
