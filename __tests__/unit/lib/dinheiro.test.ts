import { describe, it, expect } from 'vitest'
import { erroCustosMacroFases, erroMoeda, formatMoeda, formatReais, moedaParaCampo, parseMoeda } from '@/lib/dinheiro'

describe('formatMoeda', () => {
  it('centavos entram pela direita', () => {
    expect(formatMoeda('1')).toBe('0,01')
    expect(formatMoeda('12')).toBe('0,12')
    expect(formatMoeda('123')).toBe('1,23')
    expect(formatMoeda('123456')).toBe('1.234,56')
  })

  it('ignora o que não é dígito e zeros à esquerda', () => {
    expect(formatMoeda('R$ 0,005')).toBe('0,05')
    expect(formatMoeda('abc')).toBe('')
    expect(formatMoeda('')).toBe('')
  })

  it('com símbolo', () => {
    expect(formatMoeda('30000', true)).toBe('R$ 300,00')
  })

  it('limita a 13 dígitos', () => {
    expect(formatMoeda('99999999999999999')).toBe('99.999.999.999,99')
  })
})

describe('parseMoeda', () => {
  it('lê formatos brasileiro, com ponto decimal e número', () => {
    expect(parseMoeda('R$ 1.234,56')).toBe(1234.56)
    expect(parseMoeda('1234,5')).toBe(1234.5)
    expect(parseMoeda('75.5')).toBe(75.5)
    expect(parseMoeda(42)).toBe(42)
  })

  it('vazio é null e texto inválido é NaN', () => {
    expect(parseMoeda('')).toBeNull()
    expect(parseMoeda(null)).toBeNull()
    expect(parseMoeda('abc')).toBeNaN()
    expect(parseMoeda('1,2,3')).toBeNaN()
  })
})

describe('exibição', () => {
  it('valor salvo vira texto com máscara', () => {
    expect(moedaParaCampo('75.5')).toBe('75,50')
    expect(moedaParaCampo('1.000,00')).toBe('1.000,00')
    expect(moedaParaCampo(1234.5, true)).toBe('R$ 1.234,50')
    expect(moedaParaCampo(null)).toBe('')
  })

  it('formatReais usa vírgula decimal', () => {
    expect(formatReais(500)).toBe('R$ 500,00')
  })
})

describe('erroMoeda', () => {
  it('aceita vazio quando opcional e exige quando obrigatório', () => {
    expect(erroMoeda('')).toBeNull()
    expect(erroMoeda('', { obrigatorio: true, rotulo: 'Custo' })).toBe('Custo é obrigatório.')
  })

  it('recusa texto, negativo e acima do limite', () => {
    expect(erroMoeda('abc')).toMatch(/Valor inválido/)
    expect(erroMoeda(-1, { rotulo: 'Valor/hora' })).toBe('Valor/hora não pode ser negativo.')
    expect(erroMoeda(1e12)).toMatch(/acima do limite/)
    expect(erroMoeda('1.234,56')).toBeNull()
  })

  it('aponta a fase com custo inválido', () => {
    expect(erroCustosMacroFases([{ custo: '10,00' }, { custo: 'dez' }])).toMatch(/^Fase 2 — Custo/)
    expect(erroCustosMacroFases([{ custo: '' }, { custo: '1000.00' }])).toBeNull()
  })
})
