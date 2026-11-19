import { describe, it, expect } from 'vitest'
import { comVersaoNoConteudo, exibirVersao, numeroDaVersao, proximaVersaoDocumento, rotuloVersaoDocumento } from '@/lib/versaoDocumento'

describe('versões dos documentos (1.0, 1.1 … 1.99, 2.0)', () => {
  it('rótulo pelo número da sequência e o caminho de volta', () => {
    expect([1, 2, 3, 100, 101, 102, 200, 201].map(rotuloVersaoDocumento)).toEqual(['1.0', '1.1', '1.2', '1.99', '2.0', '2.1', '2.99', '3.0'])
    for (const n of [1, 2, 100, 101, 250]) expect(numeroDaVersao(rotuloVersaoDocumento(n))).toBe(n)
    expect(() => rotuloVersaoDocumento(0)).toThrow()
  })

  it('rótulos da 1.59.0 (v1.0.x) ocupam a mesma posição; rótulos livres não têm posição', () => {
    expect(numeroDaVersao('v1.0.1')).toBe(1)
    expect(numeroDaVersao('v1.0.2')).toBe(2)
    expect(numeroDaVersao('v1.1.0')).toBe(100)
    expect(numeroDaVersao('1')).toBeNull()
    expect(numeroDaVersao('2026-11-10T12:00:00.000Z')).toBeNull()
    expect(numeroDaVersao('0.5')).toBeNull()
  })

  it('próxima versão: depois da maior posição, contando os rótulos livres', () => {
    expect(proximaVersaoDocumento([])).toBe('1.0')
    expect(proximaVersaoDocumento(['1.0', '1.1'])).toBe('1.2')
    expect(proximaVersaoDocumento(['1.99'])).toBe('2.0')
    expect(proximaVersaoDocumento(['v1.0.1', 'v1.0.2'])).toBe('1.2')
    expect(proximaVersaoDocumento(['v1.0.2', '1.5'])).toBe('1.6')
    expect(proximaVersaoDocumento(['1', 'rascunho'])).toBe('1.2')
  })

  it('grava o rótulo no campo "Versão" do conteúdo de cada documento', () => {
    expect(comVersaoNoConteudo('STAKEHOLDER', { header: { versao: '2' }, stakeholders: [] }, '1.3')).toEqual({ header: { versao: '1.3' }, stakeholders: [] })
    expect(comVersaoNoConteudo('EAP', { version: '1.0' }, '1.1')).toEqual({ version: '1.1' })
    expect(comVersaoNoConteudo('RISCOS', { denominacao: 'X' }, '1.0')).toEqual({ denominacao: 'X', cabecalho: { versao: '1.0' } })
    expect(comVersaoNoConteudo('CAPA', { curso: 'ADS' }, '1.0')).toEqual({ curso: 'ADS' })
  })

  it('exibição mostra o rótulo como salvo', () => {
    expect(['1.2', 'v1.0.2', '', null].map(exibirVersao)).toEqual(['1.2', 'v1.0.2', '—', '—'])
  })
})
