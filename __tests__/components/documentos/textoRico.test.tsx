import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CampoTexto, EditorFolhaProvider } from '@/components/documentos/editor/folha'

const editavel = (ui: React.ReactNode) => <EditorFolhaProvider value={{ editavel: true, focar: () => {}, registrarLimpar: () => {} }}>{ui}</EditorFolhaProvider>

describe('campo de texto com formatação (negrito, itálico, sublinhado e alinhamento)', () => {
  it('só leitura (folha, PDF e Word): marcas e alinhamento viram estilos; tags de fora viram texto', () => {
    const { container } = render(<CampoTexto formatavel id="j" rotulo="Justificativa" valor={'<p a="center"><b>Título</b></p><p>Texto <i>it</i> <u>sub</u> <script>x</script></p>'} onChange={() => {}} />)
    const pars = container.querySelectorAll('[data-texto-campo] > div')
    expect(pars).toHaveLength(2)
    expect((pars[0] as HTMLElement).style.textAlign).toBe('center')
    expect(pars[0].querySelector('strong')).toHaveTextContent('Título')
    expect(pars[1].querySelector('em')).toHaveTextContent('it')
    expect(pars[1].querySelector('u')).toHaveTextContent('sub')
    expect(container.querySelector('script')).toBeNull()
    expect(pars[1]).toHaveTextContent('<script>x</script>')
  })

  it('edição: o que o navegador monta (negrito, alinhamento, parágrafos) vira o formato salvo', () => {
    const onChange = vi.fn()
    render(editavel(<CampoTexto formatavel id="j" rotulo="Justificativa" valor="Linha um" onChange={onChange} />))
    const campo = screen.getByRole('textbox', { name: 'Justificativa' })
    expect(campo).toHaveTextContent('Linha um')
    // Como o Chrome deixa o conteúdo depois de Ctrl+B, "Centralizar" e Enter.
    campo.innerHTML = '<div><b>Linha</b> um</div><div style="text-align: center">Linha dois</div><div><br></div>'
    fireEvent.input(campo)
    expect(onChange).toHaveBeenLastCalledWith('<p><b>Linha</b> um</p><p a="center">Linha dois</p><p></p>')
  })

  it('sem formatação, continua texto simples (documentos antigos e campos que leem linha a linha)', () => {
    const onChange = vi.fn()
    render(editavel(<CampoTexto formatavel id="j" rotulo="Justificativa" valor="" onChange={onChange} />))
    const campo = screen.getByRole('textbox', { name: 'Justificativa' })
    campo.innerHTML = '<div>um</div><div>dois</div>'
    fireEvent.input(campo)
    expect(onChange).toHaveBeenLastCalledWith('um\ndois')
  })
})
