import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ListaArquivos, { type ItemArquivo } from '@/components/arquivos/ListaArquivos'

const base = { tamanho: '2 KB', enviadoPor: null, data: '2026-11-19T12:00:00.000Z', acoes: null }
const itens: ItemArquivo[] = [
  { ...base, id: 'f1', nome: 'fachada.png', subtitulo: 'image/png', categoria: 'imagem', previa: '/api/x/f1', abrir: '/api/x/f1' },
  { ...base, id: 'v1', nome: 'obra.mp4', subtitulo: 'video/mp4', categoria: 'video', previa: '/api/x/v1', abrir: '/api/x/v1' },
]

describe('ListaArquivos — modos de visualização', () => {
  beforeEach(() => window.localStorage.clear())

  it('sem chave de visualização mantém só a tabela', () => {
    render(<ListaArquivos itens={itens} tipos={['imagem', 'video']} />)
    expect(screen.queryByRole('radiogroup', { name: 'Modo de visualização' })).not.toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('blocos mostram a arte, o tamanho é ajustável e a escolha fica guardada', () => {
    const { container, unmount } = render(<ListaArquivos itens={itens} tipos={['imagem', 'video']} visualizacao="teste" />)
    expect(screen.queryByRole('slider', { name: 'Tamanho dos blocos' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Blocos' }))

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir fachada.png' })).toHaveAttribute('href', '/api/x/f1')
    expect(container.querySelector('img[src="/api/x/f1"]')).toBeInTheDocument()
    expect(container.querySelector('video[src="/api/x/v1#t=0.1"]')).toBeInTheDocument()

    const slider = screen.getByRole('slider', { name: 'Tamanho dos blocos' })
    fireEvent.change(slider, { target: { value: '300' } })
    expect(screen.getByRole('list', { name: 'Arquivos em blocos' }).style.gridTemplateColumns).toContain('300px')
    unmount()

    render(<ListaArquivos itens={itens} tipos={['imagem', 'video']} visualizacao="teste" />)
    expect(screen.getByRole('radio', { name: 'Blocos' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('slider', { name: 'Tamanho dos blocos' })).toHaveValue('300')
  })
})

describe('ListaArquivos — ordenação pelos títulos', () => {
  const lista: ItemArquivo[] = [
    { id: 'b', nome: 'b10.png', subtitulo: 'Imagem PNG', categoria: 'imagem', tamanho: '2 MB', tamanhoBytes: 2_000_000, enviadoPor: 'Caio', data: '2026-11-10T12:00:00.000Z' },
    { id: 'a', nome: 'B2.png', subtitulo: 'Imagem PNG', categoria: 'imagem', tamanho: '900 KB', tamanhoBytes: 900_000, enviadoPor: 'Ana', data: '2026-11-18T12:00:00.000Z' },
    { id: 'c', nome: 'a.mp4', subtitulo: 'Vídeo MP4', categoria: 'video', tamanho: '10 MB', tamanhoBytes: 10_000_000, enviadoPor: null, data: '2026-11-01T12:00:00.000Z' },
  ]
  const nomes = () => screen.getAllByRole('row').slice(1).map(r => r.querySelector('td')?.textContent)

  it('clique ordena crescente, de novo decrescente; tamanho pelos bytes e nomes com número natural', () => {
    render(<ListaArquivos itens={lista} tipos={['imagem', 'video']} />)
    expect(nomes()).toEqual(['b10.png', 'B2.png', 'a.mp4'])
    const nome = screen.getByRole('button', { name: /^Ordenar por Nome/ })
    fireEvent.click(nome)
    expect(nomes()).toEqual(['a.mp4', 'B2.png', 'b10.png'])
    expect(nome.closest('th')).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(nome)
    expect(nomes()).toEqual(['b10.png', 'B2.png', 'a.mp4'])
    expect(nome.closest('th')).toHaveAttribute('aria-sort', 'descending')

    fireEvent.click(screen.getByRole('button', { name: /^Ordenar por Tamanho/ }))
    expect(nomes()).toEqual(['B2.png', 'b10.png', 'a.mp4'])
    fireEvent.click(screen.getByRole('button', { name: /^Ordenar por Data/ }))
    expect(nomes()).toEqual(['a.mp4', 'b10.png', 'B2.png'])
    expect(nome.closest('th')).not.toHaveAttribute('aria-sort')
  })
})
