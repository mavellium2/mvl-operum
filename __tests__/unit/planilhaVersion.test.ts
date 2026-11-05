import { describe, expect, it } from 'vitest'
import { rotuloVersaoPlanilha } from '@/lib/planilhaVersion'
describe('numeração das versões da planilha', () => {
  it('incrementa com transporte a cada 100', () => {
    for (const [numero, label] of [[1, 'v1.0.1'], [2, 'v1.0.2'], [99, 'v1.0.99'], [100, 'v1.1.0'], [199, 'v1.1.99'], [200, 'v1.2.0'], [9999, 'v1.99.99'], [10000, 'v2.0.0']] as const) expect(rotuloVersaoPlanilha(numero)).toBe(label)
  })
  it('rejeita números que não representam uma versão persistida', () => {
    for (const numero of [0, -1, 1.5, NaN, Infinity]) expect(() => rotuloVersaoPlanilha(numero)).toThrow()
  })
})
