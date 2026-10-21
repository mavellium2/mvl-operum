import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EapDocumentSheet from '@/components/projetos/documentacao/EapDocumentSheet'
import { eapNodesFromWbs } from '@/lib/eapFromWbs'
import type { WbsNodeClient } from '@/types/wbs'

const st = (bg: string) => ({ backgroundColor: bg, borderColor: '#111111', textColor: '#ffffff', borderWidth: 2, fontSize: 13, borderRadius: 6 })
const n = (id: string, parentId: string | null, code: string, title: string, childrenIds: string[], extra: Partial<WbsNodeClient> = {}): WbsNodeClient =>
  ({ id, parentId, order: 0, code, title, layout: 'LADO_A_LADO', collapsed: false, style: st('#3b82f6'), properties: {}, childrenIds, ...extra }) as WbsNodeClient

const metadata = { projectName: 'P', projectManager: 'G', preparedBy: '', approvedBy: '', version: '1.0', approvalDate: '' } as never

function arvore() {
  const nodes: Record<string, WbsNodeClient> = {
    r: n('r', null, '1', 'Projeto', ['f1', 'f2']),
    f1: n('f1', 'r', '1.1', 'Planejamento', ['a'], { style: st('#16a34a'), collapsed: true }),
    a: n('a', 'f1', '1.1.1', 'Orçamento', []),
    f2: n('f2', 'r', '1.2', 'Execução', []),
  }
  return { rootId: 'r', nodes }
}

describe('documento EAP igual à aba EAP', () => {
  it('desenha a EAP gráfica com o layout e as cores da aba, mostrando também os nós recolhidos', () => {
    const a = arvore()
    render(<EapDocumentSheet metadata={metadata} nodes={eapNodesFromWbs(a.nodes, a.rootId)} instituicao="Fatec" arvore={a} />)
    expect(screen.getByTestId('eap-grafica-da-aba')).toBeInTheDocument()
    const itens = screen.getAllByRole('treeitem').map(i => i.getAttribute('aria-label'))
    expect(itens).toEqual(expect.arrayContaining(['1 Projeto', '1.1 Planejamento', '1.1.1 Orçamento', '1.2 Execução']))
    const fase = screen.getByRole('treeitem', { name: '1.1 Planejamento' }).querySelector('rect')!
    expect(fase.getAttribute('fill')).toBe('#16a34a')
    expect(fase.getAttribute('stroke-width')).toBe('2')
  })

  it('sem a árvore da aba (versão antiga) mantém o layout em colunas', () => {
    const a = arvore()
    render(<EapDocumentSheet metadata={metadata} nodes={eapNodesFromWbs(a.nodes, a.rootId)} instituicao="Fatec" />)
    expect(screen.queryByTestId('eap-grafica-da-aba')).not.toBeInTheDocument()
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(0)
  })
})
