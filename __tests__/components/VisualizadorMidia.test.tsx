import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import VisualizadorMidia, { type MidiaVisualizavel } from '@/components/ui/VisualizadorMidia'

const itens: MidiaVisualizavel[] = [
  { id: 'a', nome: 'a.png', tipo: 'imagem', url: '/a' },
  { id: 'b', nome: 'b.png', tipo: 'imagem', url: '/b' },
  { id: 'c', nome: 'c.mp4', tipo: 'video', url: '/c' },
]

describe('VisualizadorMidia — setas', () => {
  it('Anterior fica à esquerda e Próximo à direita, em contêineres próprios', () => {
    render(<VisualizadorMidia itens={itens} indice={1} onIndice={() => {}} onClose={() => {}} />)
    const anterior = screen.getByRole('button', { name: 'Anterior' }).closest('.vm-seta-posicao') as HTMLElement
    const proximo = screen.getByRole('button', { name: 'Próximo' }).closest('.vm-seta-posicao') as HTMLElement
    expect(anterior.className).toMatch(/\bleft-3\b/)
    expect(anterior.className).not.toMatch(/\bright-/)
    expect(proximo.className).toMatch(/\bright-3\b/)
    expect(proximo.className).not.toMatch(/\bleft-/)
  })

  it('sem anterior no primeiro e sem próximo no último; setas do teclado navegam', () => {
    const onIndice = vi.fn()
    const { rerender } = render(<VisualizadorMidia itens={itens} indice={0} onIndice={onIndice} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Anterior' })).toBeNull()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onIndice).toHaveBeenLastCalledWith(1)
    rerender(<VisualizadorMidia itens={itens} indice={2} onIndice={onIndice} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Próximo' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onIndice).toHaveBeenLastCalledWith(1)
  })
})
