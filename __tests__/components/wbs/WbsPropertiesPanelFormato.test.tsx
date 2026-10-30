import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WbsPropertiesPanel from '@/components/wbs/WbsPropertiesPanel'
import type { WbsNodeClient } from '@/types/wbs'
import { escolherOpcao } from '../../helpers/select'

const S = { backgroundColor: '#fff', borderColor: '#000', textColor: '#000', borderWidth: 1, fontSize: 14, borderRadius: 4 }
const no = (id: string, parentId: string | null, layout: WbsNodeClient['layout'], childrenIds: string[] = []): WbsNodeClient =>
  ({ id, parentId, order: 0, code: '', title: id, layout, collapsed: false, style: S, properties: {}, childrenIds })
const nodes = {
  r: no('r', null, 'LADO_A_LADO', ['f1', 'f2']),
  f1: no('f1', 'r', 'ESQUERDA', ['a']),
  f2: no('f2', 'r', 'LADO_A_LADO'),
  a: no('a', 'f1', 'LADO_A_LADO'),
}

function abrir(selectedNodeIds: string[]) {
  const dispatch = vi.fn()
  render(<WbsPropertiesPanel selectedNodeIds={selectedNodeIds} nodes={nodes} canEdit dispatch={dispatch} onClose={vi.fn()} />)
  return dispatch
}

describe('formato no painel de propriedades da EAP', () => {
  it('raiz: formato da EAP inteira, com as fases voltando a seguir a EAP', async () => {
    const dispatch = abrir(['r'])
    const campo = screen.getByRole('combobox', { name: 'Formato da EAP' })
    expect(campo).toHaveTextContent('Padrão')
    escolherOpcao(campo, 'Horizontal')
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_EAP_FORMAT', payload: { layout: 'HORIZONTAL' } })
  })

  it('fases: formato da fase, com "—" quando diferem; aplica a todas as selecionadas', async () => {
    const dispatch = abrir(['f1', 'f2'])
    const campo = screen.getByRole('combobox', { name: 'Formato da fase' })
    expect(campo).toHaveTextContent('—')
    escolherOpcao(campo, 'Direita')
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LAYOUT', payload: { nodeId: 'f1', layout: 'DIREITA' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LAYOUT', payload: { nodeId: 'f2', layout: 'DIREITA' } })
  })

  it('itens abaixo das fases não têm formato próprio', () => {
    abrir(['a'])
    expect(screen.queryByText(/Formato da/)).toBeNull()
  })
  it('fica aberto ao clicar fora e ao limpar a seleção; só o X fecha', async () => {
    const close = vi.fn()
    const props = { nodes, canEdit: true, dispatch: vi.fn(), onClose: close }
    const { rerender } = render(<WbsPropertiesPanel {...props} selectedNodeIds={['f1']} />)
    await userEvent.click(document.body)
    expect(close).not.toHaveBeenCalled()
    rerender(<WbsPropertiesPanel {...props} selectedNodeIds={[]} />)
    expect(screen.getByText(/Selecione um ou mais elementos/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar estilo' }))
    expect(close).toHaveBeenCalledTimes(1)
  })

})
