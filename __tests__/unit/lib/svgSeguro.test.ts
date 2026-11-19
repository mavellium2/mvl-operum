import { describe, it, expect } from 'vitest'
import { motivoSvgInseguro } from '@/lib/svgSeguro'
import { erroDoArquivo, tipoDoArquivo } from '@/lib/arquivosProjeto'

describe('SVG em Fotos e Vídeos', () => {
  it('aceita SVG simples, de formas e texto', () => {
    expect(motivoSvgInseguro('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/><text x="1" y="8">Oi</text></svg>')).toBeNull()
    expect(erroDoArquivo('FOTOS_VIDEOS', 'image/svg+xml', 1200)).toBeNull()
    expect(tipoDoArquivo('logo.svg', '')).toBe('image/svg+xml')
  })
  it.each([
    ['<svg><script>alert(1)</script></svg>', 'script'],
    ['<svg onload="alert(1)"></svg>', 'evento'],
    ['<svg><a href="https://x">x</a></svg>', 'link'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'foreignObject'],
    ['<svg><style>@import url(https://x/a.css)</style></svg>', 'externo'],
    ['<svg><a xlink:hre&#102;="javascript:alert(1)">x</a></svg>', 'link'],
  ])('recusa conteúdo ativo: %s', (svg, trecho) => {
    expect(motivoSvgInseguro(svg)).toMatch(new RegExp(trecho, 'i'))
  })
  it('recusa o que não é SVG e SVG grande demais', () => {
    expect(motivoSvgInseguro('<html></html>')).toMatch(/não é um SVG válido/)
    expect(erroDoArquivo('FOTOS_VIDEOS', 'image/svg+xml', 6 * 1024 * 1024)).toMatch(/5 MB/)
  })
})
