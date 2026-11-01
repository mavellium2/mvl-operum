import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import FormActions, { FormBody } from '@/components/ui/FormActions'
import GlassButton from '@/components/ui/GlassButton'
import { Input } from '@/components/ui/Field'

it('separa dados e rodapé mantendo validação e submissão nativas', () => {
  const submit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault())
  render(<form className="form-layout" aria-label="Editar" onSubmit={submit}><FormBody><Input name="name" aria-label="Nome" required defaultValue="Projeto" /></FormBody><FormActions><GlassButton type="submit">Salvar</GlassButton></FormActions></form>)
  const form = screen.getByRole('form', { name: 'Editar' }) as HTMLFormElement
  const button = screen.getByRole('button', { name: 'Salvar' })
  expect(button.closest('form')).toBe(form)
  expect(button.closest('.form-body')).toBeNull()
  expect(button.closest('.form-actions')).toBe(form.lastElementChild)
  expect(new FormData(form).get('name')).toBe('Projeto')
  fireEvent.click(button)
  expect(submit).toHaveBeenCalledOnce()
})
