import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MoedaInput from '@/components/ui/MoedaInput'

describe('MoedaInput', () => {
  it('mostra o valor salvo com máscara', () => {
    render(<MoedaInput aria-label="Valor" value="75.5" />)
    expect(screen.getByLabelText('Valor')).toHaveValue('75,50')
  })

  it('formata o que é digitado e devolve texto e número', () => {
    const onValueChange = vi.fn()
    render(<MoedaInput aria-label="Valor" defaultValue="" onValueChange={onValueChange} />)
    const campo = screen.getByLabelText('Valor')
    fireEvent.change(campo, { target: { value: '123456' } })
    expect(campo).toHaveValue('1.234,56')
    expect(onValueChange).toHaveBeenLastCalledWith('1.234,56', 1234.56)
  })

  it('exige valor quando obrigatório, ao sair do campo', () => {
    render(<MoedaInput aria-label="Valor" rotulo="Custo" required defaultValue="" />)
    fireEvent.blur(screen.getByLabelText('Valor'))
    expect(screen.getByText('Custo é obrigatório.')).toBeInTheDocument()
  })
})
