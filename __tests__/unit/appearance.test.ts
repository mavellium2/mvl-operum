import { describe, expect, it } from 'vitest'
import { appearancePeriod, parseAppearance } from '@/lib/appearance'

describe('aparência por horário local', () => {
  it.each([[0, 'night'], [5, 'night'], [6, 'morning'], [11, 'morning'], [12, 'afternoon'], [17, 'afternoon'], [18, 'night'], [23, 'night']] as const)('às %sh usa %s', (hour, expected) => {
    expect(appearancePeriod('automatic', hour)).toBe(expected)
  })
  it('respeita escolhas fixas e o sistema', () => {
    expect(appearancePeriod('afternoon', 6)).toBe('afternoon')
    expect(appearancePeriod('afternoon', 23)).toBe('afternoon')
    expect(appearancePeriod('light', 23)).toBe('morning')
    expect(appearancePeriod('dark', 9)).toBe('night')
    expect(appearancePeriod('system', 9, true)).toBe('night')
    expect(appearancePeriod('system', 23, false)).toBe('morning')
  })
  it('recupera preferências ausentes ou inválidas', () => {
    expect(parseAppearance(null)).toBe('automatic')
    expect(parseAppearance('broken')).toBe('automatic')
    expect(parseAppearance('afternoon')).toBe('afternoon')
    expect(parseAppearance('dark')).toBe('dark')
  })
})
