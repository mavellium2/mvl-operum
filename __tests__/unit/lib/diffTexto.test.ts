import { describe, it, expect } from 'vitest'
import { diffTexto } from '@/lib/diffTexto'

describe('diffTexto', () => {
  it('marca palavras removidas e incluídas e remonta os dois textos', () => {
    const antes = 'Equipes grandes (até 10 membros) na sprint.'
    const depois = 'Equipes grandes (de 5 a 10 membros) na sprint. Hoje em planilhas.'
    const partes = diffTexto(antes, depois)
    expect(partes.filter(p => p.tipo !== 'incluido').map(p => p.texto).join('')).toBe(antes)
    expect(partes.filter(p => p.tipo !== 'removido').map(p => p.texto).join('')).toBe(depois)
    expect(partes.find(p => p.tipo === 'removido')?.texto).toContain('(até')
    expect(partes.filter(p => p.tipo === 'incluido').map(p => p.texto).join('')).toContain('Hoje em planilhas.')
  })
  it('mantém quebras de linha e trata textos vazios', () => {
    expect(diffTexto('a\nb', 'a\nb')).toEqual([{ tipo: 'igual', texto: 'a\nb' }])
    expect(diffTexto('', 'novo')).toEqual([{ tipo: 'incluido', texto: 'novo' }])
    expect(diffTexto('velho', '')).toEqual([{ tipo: 'removido', texto: 'velho' }])
  })
})
