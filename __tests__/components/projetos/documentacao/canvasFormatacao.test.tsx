import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorFolhaProvider } from '@/components/documentos/editor/folha'
import { FolhaCanvas, CANVAS_INICIAL } from '@/components/projetos/documentacao/CanvasDocumento'

const sistema = { nomeProjeto: 'Pintar uma Casa', instituicao: 'Fatec', logoUrl: null, gerente: { nome: 'Ana', assinaturaUrl: null }, termo: { justificativa: '', objetivos: '', descricaoProduto: '' }, entregas: { raiz: null, itens: [] } }

describe('Canvas: campos do cabeçalho aceitam formatação (ajustes de 21/11, item 1.1)', () => {
  it('Projeto, Solicitante e GP são campos formatáveis (editor rico), como os 13 blocos', () => {
    render(
      <EditorFolhaProvider value={{ editavel: true, focar: () => {}, registrarLimpar: () => {} }}>
        <FolhaCanvas conteudo={CANVAS_INICIAL(sistema, [])} sistema={sistema} versaoPadrao="v1" alterar={vi.fn()} />
      </EditorFolhaProvider>,
    )
    for (const nome of ['PROJETO', 'SOLICITANTE', 'GP']) {
      const campo = screen.getByRole('textbox', { name: nome })
      expect(campo.tagName).not.toBe('TEXTAREA')
      expect(campo).toHaveAttribute('contenteditable')
    }
  })

  it('só leitura (PDF e Word): negrito e alinhamento do cabeçalho viram estilos', () => {
    const { container } = render(<FolhaCanvas conteudo={{ ...CANVAS_INICIAL(sistema, []), projeto: '<p a="right"><b>Casa</b></p>' }} sistema={sistema} versaoPadrao="v1" />)
    expect(container.querySelector('.canvas-template-campo strong')).toHaveTextContent('Casa')
    expect(container.querySelector('[data-docx-moldura] [style*="text-align: right"]')).not.toBeNull()
  })
})
