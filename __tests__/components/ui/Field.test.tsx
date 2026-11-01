import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Input, Textarea, NativeSelect } from '@/components/ui/Field'

it('preserva referências, atributos de validação e valores no formulário nativo', () => {
  const ref = createRef<HTMLInputElement>()
  render(<form aria-label="Cadastro"><Input ref={ref} name="nome" aria-label="Nome" defaultValue="Ana" required maxLength={40} aria-invalid aria-describedby="erro" /><Textarea name="descricao" aria-label="Descrição" defaultValue="Texto" /><NativeSelect name="tipo" aria-label="Tipo" defaultValue="b"><option value="a">A</option><option value="b">B</option></NativeSelect><p id="erro">Corrija o nome</p></form>)
  expect(ref.current).toBe(screen.getByRole('textbox', { name: 'Nome' }))
  expect(ref.current).toHaveAttribute('required')
  expect(ref.current).toHaveAttribute('maxlength', '40')
  expect(ref.current).toHaveAttribute('aria-invalid', 'true')
  expect(ref.current).toHaveAccessibleDescription('Corrija o nome')
  const data = new FormData(screen.getByRole('form', { name: 'Cadastro' }) as HTMLFormElement)
  expect(Object.fromEntries(data)).toEqual({ nome: 'Ana', descricao: 'Texto', tipo: 'b' })
})

it('repassa eventos e estados sem alterar o comportamento do campo especializado', () => {
  const onChange = vi.fn()
  const { rerender } = render(<Input aria-label="Valor" type="number" min={0} value="2" onChange={onChange} className="w-20" />)
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
  expect(onChange).toHaveBeenCalledOnce()
  expect(screen.getByRole('spinbutton')).toHaveClass('operum-field', 'w-20')
  rerender(<Input aria-label="Valor" disabled readOnly value="2" />)
  expect(screen.getByRole('textbox')).toBeDisabled()
  expect(screen.getByRole('textbox')).toHaveAttribute('readonly')
})
