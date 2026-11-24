import { describe, expect, it } from 'vitest'
import { contarFiltros, FILTROS_ARQUIVOS_VAZIOS, intervaloDoPeriodo, passaNosFiltros, rotuloDoPeriodo, type FiltrosArquivos } from '@/lib/filtrosArquivos'

const MB = 1024 * 1024
// 20/11/2026, 15:00 (hora local).
const REF = new Date(2026, 10, 20, 15, 0).getTime()
const dia = (d: number, h = 12) => new Date(2026, 10, d, h, 0).toISOString()
const item = (parcial: Partial<Parameters<typeof passaNosFiltros>[0]> = {}) => ({ categoria: 'imagem', enviadoPor: 'Ana', data: dia(19), tamanhoBytes: 2 * MB, favorito: false, ...parcial })
const com = (f: Partial<FiltrosArquivos>): FiltrosArquivos => ({ ...FILTROS_ARQUIVOS_VAZIOS, ...f })

describe('filtros da lista de arquivos', () => {
  it('sem filtros, tudo passa (inclusive item sem tamanho ou data)', () => {
    expect(passaNosFiltros(item({ tamanhoBytes: undefined, enviadoPor: null }), FILTROS_ARQUIVOS_VAZIOS, REF)).toBe(true)
    expect(contarFiltros(FILTROS_ARQUIVOS_VAZIOS)).toBe(0)
  })

  it('tipo: várias opções somam (OU)', () => {
    const f = com({ tipos: ['imagem', 'video'] })
    expect(passaNosFiltros(item({ categoria: 'video' }), f, REF)).toBe(true)
    expect(passaNosFiltros(item({ categoria: 'pdf' }), f, REF)).toBe(false)
  })

  it('enviado por: várias pessoas somam; sem remetente não passa', () => {
    const f = com({ enviadores: ['Ana', 'Enzo'] })
    expect(passaNosFiltros(item({ enviadoPor: 'Enzo' }), f, REF)).toBe(true)
    expect(passaNosFiltros(item({ enviadoPor: 'Bia' }), f, REF)).toBe(false)
    expect(passaNosFiltros(item({ enviadoPor: null }), f, REF)).toBe(false)
  })

  it.each([
    ['hoje', dia(20, 8), true], ['hoje', dia(19, 23), false],
    ['7d', dia(14, 0), true], ['7d', dia(13, 23), false],
    ['30d', dia(1, 0), true], ['30d', new Date(2026, 9, 20).toISOString(), false],
    ['ano', new Date(2026, 0, 1, 0, 1).toISOString(), true], ['ano', new Date(2025, 11, 31).toISOString(), false],
  ] as const)('período %s para %s → %s', (periodo, data, esperado) => {
    expect(passaNosFiltros(item({ data }), com({ periodo }), REF)).toBe(esperado)
  })

  it('período personalizado: de/até incluem os dois dias; só um limite também vale', () => {
    const f = com({ periodo: 'personalizado', de: '2026-11-10', ate: '2026-11-12' })
    expect(passaNosFiltros(item({ data: dia(10, 0) }), f, REF)).toBe(true)
    expect(passaNosFiltros(item({ data: dia(12, 23) }), f, REF)).toBe(true)
    expect(passaNosFiltros(item({ data: dia(13, 0) }), f, REF)).toBe(false)
    expect(passaNosFiltros(item({ data: dia(9, 23) }), f, REF)).toBe(false)
    expect(passaNosFiltros(item({ data: dia(15) }), com({ periodo: 'personalizado', de: '2026-11-14' }), REF)).toBe(true)
    expect(passaNosFiltros(item({ data: dia(15) }), com({ periodo: 'personalizado', ate: '2026-11-14' }), REF)).toBe(false)
    // Personalizado sem nenhuma data não filtra (e não conta como filtro ativo).
    expect(intervaloDoPeriodo(com({ periodo: 'personalizado' }), REF)).toBeNull()
    expect(contarFiltros(com({ periodo: 'personalizado' }))).toBe(0)
  })

  it('tamanho: faixas somam; item sem tamanho não passa quando há faixa marcada', () => {
    const f = com({ tamanhos: ['pequeno', 'enorme'] })
    expect(passaNosFiltros(item({ tamanhoBytes: 500 * 1024 }), f, REF)).toBe(true)
    expect(passaNosFiltros(item({ tamanhoBytes: 200 * MB }), f, REF)).toBe(true)
    expect(passaNosFiltros(item({ tamanhoBytes: 5 * MB }), f, REF)).toBe(false)
    expect(passaNosFiltros(item({ tamanhoBytes: undefined }), f, REF)).toBe(false)
    // Limites: 1 MB cai em "1 a 10 MB".
    expect(passaNosFiltros(item({ tamanhoBytes: MB }), com({ tamanhos: ['medio'] }), REF)).toBe(true)
    expect(passaNosFiltros(item({ tamanhoBytes: MB }), com({ tamanhos: ['pequeno'] }), REF)).toBe(false)
  })

  it('estrela e combinação de filtros diferentes (E)', () => {
    expect(passaNosFiltros(item({ favorito: true }), com({ somenteEstrela: true }), REF)).toBe(true)
    expect(passaNosFiltros(item({ favorito: false }), com({ somenteEstrela: true }), REF)).toBe(false)
    const f = com({ tipos: ['imagem'], enviadores: ['Ana'], tamanhos: ['medio'], periodo: '7d' })
    expect(passaNosFiltros(item(), f, REF)).toBe(true)
    expect(passaNosFiltros(item({ enviadoPor: 'Enzo' }), f, REF)).toBe(false)
    expect(contarFiltros(f)).toBe(4)
  })

  it('rótulo do período para a etiqueta', () => {
    expect(rotuloDoPeriodo(com({ periodo: '30d' }))).toBe('Últimos 30 dias')
    expect(rotuloDoPeriodo(com({ periodo: 'personalizado', de: '2026-11-10', ate: '2026-11-12' }))).toBe('10/11/2026 a 12/11/2026')
    expect(rotuloDoPeriodo(com({ periodo: 'personalizado', de: '2026-11-10' }))).toBe('A partir de 10/11/2026')
    expect(rotuloDoPeriodo(com({ periodo: 'personalizado', ate: '2026-11-12' }))).toBe('Até 12/11/2026')
    expect(rotuloDoPeriodo(FILTROS_ARQUIVOS_VAZIOS)).toBe('')
  })
})
