import { describe, expect, it } from 'vitest'
import { formatarMinutos, minutosApontados, minutosDigitados, minutosRealizados } from '@/lib/tempoRealizado'

describe('tempo realizado (ADR-089)', () => {
  it('soma os minutos digitados com os apontamentos do card', () => {
    const p = { tempoRealMinutos: 100, tempoRealApontadoSegundos: 11 }
    expect(minutosDigitados(p)).toBe(100)
    expect(minutosApontados(p)).toBeCloseTo(11 / 60)
    expect(minutosRealizados(p)).toBeCloseTo(100 + 11 / 60)
  })

  it('sem digitado nem apontamentos, o realizado é zero', () => {
    expect(minutosRealizados({})).toBe(0)
  })

  it('exibe inteiros sem casas e quebrados com duas casas', () => {
    expect(formatarMinutos(200)).toBe('200')
    expect(formatarMinutos(0.18333333333333335)).toBe('0,18')
    expect(formatarMinutos(0.1)).toBe('0,10')
    expect(formatarMinutos(1640.1833333333332)).toBe('1.640,18')
    expect(formatarMinutos(59.999)).toBe('60')
  })
})
