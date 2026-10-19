import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WbsPropertiesPanel from '@/components/wbs/WbsPropertiesPanel'
import type { WbsNodeClient } from '@/types/wbs'

const S = { backgroundColor: '#fff', borderColor: '#000', textColor: '#000', borderWidth: 1, fontSize: 14, borderRadius: 4 }
const nodes: Record<string, WbsNodeClient> = {
  r: { id: 'r', parentId: null, order: 0, code: '1', title: 'Pintar uma sala', layout: 'LADO_A_LADO', collapsed: false, style: S, properties: {}, childrenIds: [] },
}

describe('painel Estilo fixo (19/10)', () => {
  it('não fecha ao clicar fora nem com Esc; fecha no X', async () => {
    const onClose = vi.fn()
    render(<><button>canvas</button><WbsPropertiesPanel selectedNodeIds={['r']} nodes={nodes} canEdit dispatch={vi.fn()} onClose={onClose} /></>)
    await userEvent.click(screen.getByText('canvas'))
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    await userEvent.click(screen.getByLabelText('Fechar painel de estilo'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sem seleção continua aberto, pedindo para selecionar um elemento', () => {
    render(<WbsPropertiesPanel selectedNodeIds={[]} nodes={nodes} canEdit dispatch={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Selecione um ou mais elementos/)).toBeInTheDocument()
    expect(screen.getByLabelText('Fechar painel de estilo')).toBeInTheDocument()
  })
})
