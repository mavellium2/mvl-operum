import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import MultiCreatableSelect from '@/components/ui/MultiCreatableSelect'

const funcaoKey = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/s$/, '')
const digitar = (valor: string) => {
  const campo = screen.getByRole('textbox', { name: 'Cargos' })
  fireEvent.change(campo, { target: { value: valor } })
  fireEvent.keyDown(campo, { key: 'Enter' })
}

describe('MultiCreatableSelect — separar e chave', () => {
  it('sem as opções, adiciona o texto como está e ignora repetido', () => {
    const onChange = vi.fn()
    render(<MultiCreatableSelect values={['Dev']} onChange={onChange} options={[]} ariaLabel="Cargos" />)
    digitar('Dev')
    expect(onChange).not.toHaveBeenCalled()
    digitar('QA')
    expect(onChange).toHaveBeenCalledWith(['Dev', 'QA'])
  })

  it('"separar" divide um texto em várias etiquetas', () => {
    const onChange = vi.fn()
    render(<MultiCreatableSelect values={[]} onChange={onChange} options={[]} ariaLabel="Cargos" separar={t => t.split('|')} />)
    digitar('Front-End | Redatora')
    expect(onChange).toHaveBeenCalledWith(['Front-End', 'Redatora'])
  })

  it('"chave" usa o nome da opção existente e não duplica o que já está marcado (acento, caixa, plural)', () => {
    const onChange = vi.fn()
    render(<MultiCreatableSelect values={['Analista']} onChange={onChange} options={['Desenvolvedora', 'Analista']} ariaLabel="Cargos" chave={funcaoKey} />)
    digitar('desenvolvedoras')
    expect(onChange).toHaveBeenLastCalledWith(['Analista', 'Desenvolvedora'])
    onChange.mockClear()
    digitar('ANALISTAS')
    expect(onChange).not.toHaveBeenCalled()
  })
})
