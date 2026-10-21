import { describe, it, expect } from 'vitest'
import { misturar, porcentagemSprint, progressoSprint } from '@/lib/sprintProgresso'

describe('porcentagemSprint', () => {
  it('arredonda e limita entre 0 e 100', () => {
    expect(porcentagemSprint(1, 3)).toBe(33)
    expect(porcentagemSprint(5, 4)).toBe(100)
    expect(porcentagemSprint(-1, 4)).toBe(0)
  })

  it('sem cards é 0%', () => {
    expect(porcentagemSprint(0, 0)).toBe(0)
  })
})

describe('progressoSprint', () => {
  it('sprint encerrada fica verde-clara, mesmo sem todos os cards concluídos', () => {
    const p = progressoSprint('COMPLETED', 2, 4)
    expect(p.concluida).toBe(true)
    expect(p.cardStyle.background).toBe('#f0fdf4')
    expect(p.cardStyle.borderColor).toBeDefined()
  })

  it('todos os cards concluídos também conta como finalizada', () => {
    expect(progressoSprint('ACTIVE', 4, 4).concluida).toBe(true)
  })

  it('sprint ativa sem cards não é finalizada', () => {
    const p = progressoSprint('ACTIVE', 0, 0)
    expect(p.concluida).toBe(false)
    expect(p.cardStyle.background).toBe('#ffffff')
  })

  it('o degradê acompanha a porcentagem e fica mais intenso perto do fim', () => {
    const meio = progressoSprint('ACTIVE', 1, 2)
    const quase = progressoSprint('ACTIVE', 9, 10)
    expect(meio.cardStyle.background).toContain('#ffffff 50%')
    expect(quase.cardStyle.background).toContain('#ffffff 90%')
    const alpha = (s: string) => Number(/rgba\(34, 197, 94, ([\d.]+)\)/.exec(s)![1])
    expect(alpha(quase.cardStyle.background)).toBeGreaterThan(alpha(meio.cardStyle.background))
  })

  it('a barra vai do azul ao verde conforme o progresso', () => {
    expect(progressoSprint('ACTIVE', 0, 4).barStyle.background).toContain('#3b82f6, #3b82f6')
    expect(progressoSprint('ACTIVE', 3, 4).barStyle.width).toBe('75%')
  })
})

describe('misturar', () => {
  it('interpola as cores nos extremos e no meio', () => {
    expect(misturar('#000000', '#ffffff', 0)).toBe('#000000')
    expect(misturar('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(misturar('#000000', '#ffffff', 0.5)).toBe('#808080')
  })
})
