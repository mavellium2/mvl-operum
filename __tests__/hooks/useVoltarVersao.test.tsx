import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useVoltarVersao, type VersaoParaVoltar } from '@/hooks/useVoltarVersao'

const versoes: VersaoParaVoltar[] = [
  { id: 'b', versao: 'v1.0.2', commitTitle: 'Ajuste', status: 'PENDING', payload: { texto: 'B' } },
  { id: 'a', versao: 'v1.0.1', commitTitle: 'Inicial', status: 'APPROVED', payload: { texto: 'A' } },
]

function Editor({ aplicar, podeEditar = true, pendentes = false }: { aplicar: (p: unknown) => void; podeEditar?: boolean; pendentes?: boolean }) {
  const v = useVoltarVersao({ versoes, vigente: versoes[1], aplicar, podeEditar, alteracoesPendentes: pendentes })
  return (
    <div>
      <p data-testid="rotulo">{v.seletor.rotulo}</p>
      <p data-testid="proxima">{v.proxima}</p>
      <ul>{v.seletor.opcoes.map(o => <li key={o.id}><button type="button" onClick={() => v.seletor.onSelecionar(o.id)}>{o.rotulo}</button></li>)}</ul>
      {v.dialogo}
    </div>
  )
}

describe('useVoltarVersao — voltar para uma versão como em Editar projeto', () => {
  it('escolher uma versão pede confirmação e leva o conteúdo dela ao rascunho editável', () => {
    const aplicar = vi.fn()
    render(<Editor aplicar={aplicar} pendentes />)
    expect(screen.getByTestId('rotulo')).toHaveTextContent('Rascunho sobre a v1.0.1')
    expect(screen.getByTestId('proxima')).toHaveTextContent('1.2')
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para a v1.0.1 · vigente' }))
    expect(aplicar).not.toHaveBeenCalled()
    expect(screen.getByText(/vira a 1\.2/)).toBeInTheDocument()
    expect(screen.getByText(/serão substituídas/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para esta versão' }))
    expect(aplicar).toHaveBeenCalledWith({ texto: 'A' }, versoes[1])
    expect(screen.getByTestId('rotulo')).toHaveTextContent('Rascunho a partir da v1.0.1')
  })

  it('sem permissão de edição, a lista só mostra as versões', () => {
    const aplicar = vi.fn()
    render(<Editor aplicar={aplicar} podeEditar={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'v1.0.2 · pendente' }))
    expect(screen.queryByText(/Nenhuma versão é apagada/)).toBeNull()
    expect(aplicar).not.toHaveBeenCalled()
  })
})
