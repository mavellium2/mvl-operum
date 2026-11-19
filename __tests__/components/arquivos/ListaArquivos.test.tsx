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
