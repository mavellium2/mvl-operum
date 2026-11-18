import { describe, it, expect } from 'vitest'
import { comVersaoNoConteudo, exibirVersao, numeroDaVersao, proximaVersaoDocumento, rotuloVersaoDocumento } from '@/lib/versaoDocumento'

describe('versões dos documentos (v1.0.1 … v1.0.99, v1.1.0)', () => {
  it('rótulo pelo número da sequência e o caminho de volta', () => {
    expect([1, 2, 99, 100, 101, 9999, 10000].map(rotuloVersaoDocumento)).toEqual(['v1.0.1', 'v1.0.2', 'v1.0.99', 'v1.1.0', 'v1.1.1', 'v1.99.99', 'v2.0.0'])
    for (const n of [1, 99, 100, 10000]) expect(numeroDaVersao(rotuloVersaoDocumento(n))).toBe(n)
    expect(numeroDaVersao('1.0')).toBeNull()
    expect(numeroDaVersao('v1.0.0')).toBeNull()
  })

  it('próxima versão: depois da maior, contando as antigas de rótulo livre', () => {
    expect(proximaVersaoDocumento([])).toBe('v1.0.1')
    expect(proximaVersaoDocumento(['v1.0.1', 'v1.0.2'])).toBe('v1.0.3')
    expect(proximaVersaoDocumento(['v1.0.99'])).toBe('v1.1.0')
    expect(proximaVersaoDocumento(['1.0', '1.1'])).toBe('v1.0.3')
    expect(proximaVersaoDocumento(['1.0', 'v1.0.5'])).toBe('v1.0.6')
  })

  it('grava o rótulo no campo "Versão" do conteúdo de cada documento', () => {
    expect(comVersaoNoConteudo('STAKEHOLDER', { header: { versao: '2' }, stakeholders: [] }, 'v1.0.4')).toEqual({ header: { versao: 'v1.0.4' }, stakeholders: [] })
    expect(comVersaoNoConteudo('EAP', { version: '1.0' }, 'v1.0.2')).toEqual({ version: 'v1.0.2' })
    expect(comVersaoNoConteudo('RISCOS', { denominacao: 'X' }, 'v1.0.1')).toEqual({ denominacao: 'X', cabecalho: { versao: 'v1.0.1' } })
    expect(comVersaoNoConteudo('CAPA', { curso: 'ADS' }, 'v1.0.1')).toEqual({ curso: 'ADS' })
  })
})

describe('exibirVersao', () => {
  it('rótulos novos ficam como estão; antigos ganham o "v"', () => {
    expect(['v1.0.2', '1.1', '', null].map(exibirVersao)).toEqual(['v1.0.2', 'v1.1', '—', '—'])
  })
})
