import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react'
import EditorDocumento from '@/components/documentos/editor/EditorDocumento'
import { CampoAutomatico, CampoTexto, Folha, romano, secao } from '@/components/documentos/editor/folha'
import { useDesfazer } from '@/hooks/useDesfazer'
import { printPageStyle, rodapeDocumento } from '@/lib/printPageStyle'

function Documento({ onSalvar = vi.fn() }: { onSalvar?: () => void }) {
  const [a, setA] = useState('Primeiro')
  const [b, setB] = useState('')
  const [c, setC] = useState('Terceiro')
  return (
    <EditorDocumento documento="Teste" editavel status="salvo" onSalvar={onSalvar}>
      <Folha>
        <CampoAutomatico>Nome do projeto: Operum</CampoAutomatico>
        <CampoTexto id="a" rotulo="Campo A" ajuda="Ajuda do A" valor={a} onChange={setA} />
        <CampoTexto id="b" rotulo="Campo B" pergunta="o que falta?" valor={b} onChange={setB} />
        <CampoTexto id="c" rotulo="Campo C" valor={c} onChange={setC} />
      </Folha>
    </EditorDocumento>
  )
}

describe('EditorDocumento — tela de edição de documento', () => {
  it('barra com os grupos do desenho', () => {
    render(<Documento />)
    for (const grupo of ['Documento', 'Edição', 'Navegar', 'Download', 'Outros']) {
      expect(screen.getByRole('group', { name: grupo })).toBeInTheDocument()
    }
    expect(screen.getByRole('status', { name: 'Rascunho salvo' })).toBeInTheDocument()
  })

  it('campo de texto vazio mostra a pergunta; Tab e Shift+Tab andam entre os campos da folha', () => {
    render(<Documento />)
    expect(screen.getByPlaceholderText('Clique para escrever: o que falta?')).toBeInTheDocument()
    const a = screen.getByRole('textbox', { name: 'Campo A' })
    a.focus()
    fireEvent.keyDown(a, { key: 'Tab' })
    expect(screen.getByRole('textbox', { name: 'Campo B' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
    expect(a).toHaveFocus()
  })

  it('"Próximo campo vazio" conta e leva aos campos sem texto', async () => {
    render(<Documento />)
    const botao = await screen.findByRole('button', { name: 'Próximo campo vazio' })
    await waitFor(() => expect(botao).toHaveTextContent('1'))
    screen.getByRole('textbox', { name: 'Campo C' }).focus()
    fireEvent.click(botao)
    expect(screen.getByRole('textbox', { name: 'Campo B' })).toHaveFocus()
  })

  it('"Limpar campo" apaga o campo em foco e a ajuda mostra o campo', () => {
    render(<Documento />)
    const a = screen.getByRole('textbox', { name: 'Campo A' })
    fireEvent.focus(a)
    a.focus()
    expect(screen.getByRole('complementary', { name: 'Ajuda do campo Campo A' })).toHaveTextContent('Ajuda do A')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar campo' }))
    expect(a).toHaveValue('')
  })

  it('Ctrl+S salva a versão', () => {
    const onSalvar = vi.fn()
    render(<Documento onSalvar={onSalvar} />)
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    expect(onSalvar).toHaveBeenCalledTimes(1)
  })

  it('campo automático não é editável e explica de onde vem', () => {
    render(<Documento />)
    expect(screen.getByText('Nome do projeto: Operum')).toBeInTheDocument()
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('Automático: vem do cadastro do projeto')
  })

  it('fora do editor (PDF) os campos saem só como texto', () => {
    const { container } = render(<Folha><CampoTexto id="x" rotulo="X" valor="Texto final" onChange={() => {}} /><CampoAutomatico>Auto</CampoAutomatico></Folha>)
    expect(container.querySelector('textarea')).toBeNull()
    expect(screen.getByText('Texto final')).toBeInTheDocument()
    expect(screen.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument()
  })
})

describe('useDesfazer', () => {
  it('desfaz e refaz agrupando a digitação seguida', () => {
    const { result, rerender } = renderHook(({ v }) => {
      const [valor, setValor] = useState(v)
      return { valor, setValor, h: useDesfazer(valor, setValor, { agruparMs: -1 }) }
    }, { initialProps: { v: 'a' } })
    act(() => result.current.setValor('ab'))
    act(() => result.current.setValor('abc'))
    rerender({ v: 'a' })
    expect(result.current.h.podeDesfazer).toBe(true)
    act(() => result.current.h.desfazer())
    expect(result.current.valor).toBe('ab')
    act(() => result.current.h.desfazer())
    expect(result.current.valor).toBe('a')
    expect(result.current.h.podeDesfazer).toBe(false)
    act(() => result.current.h.refazer())
    expect(result.current.valor).toBe('ab')
  })

  it('recomeça quando a chave muda (documento carregado)', () => {
    const { result, rerender } = renderHook(({ chave }) => {
      const [valor, setValor] = useState('x')
      return { setValor, h: useDesfazer(valor, setValor, { agruparMs: 0, chave }) }
    }, { initialProps: { chave: 1 } })
    act(() => result.current.setValor('y'))
    expect(result.current.h.podeDesfazer).toBe(true)
    rerender({ chave: 2 })
    expect(result.current.h.podeDesfazer).toBe(false)
  })
})

describe('folha e PDF', () => {
  it('numeração romana das seções', () => {
    expect([1, 4, 5, 8, 9].map(romano)).toEqual(['I', 'IV', 'V', 'VIII', 'IX'])
    expect(secao(2, 'Objetivos')).toBe('II. Objetivos')
  })

  it('rodapé "Operum · documento · versão" à esquerda de todas as páginas e margens do @page', () => {
    expect(rodapeDocumento('Termo de Abertura do Projeto', '1.2')).toBe('Operum · Termo de Abertura do Projeto · versão 1.2')
    const css = printPageStyle({ marginMm: { top: 12, x: 15 }, rodape: 'Operum · Ata "01"' })
    expect(css).toContain('@bottom-left')
    expect(css).toContain('content: "Operum · Ata \\"01\\""')
    expect(css).toContain('margin: 12mm 15mm 8mm')
    expect(css).toContain('[data-folha] { width: auto !important; padding: 0 !important; }')
    expect(printPageStyle()).not.toContain('@bottom-left')
  })
})
