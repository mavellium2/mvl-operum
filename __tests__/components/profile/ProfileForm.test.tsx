import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProfileForm from '@/components/profile/ProfileForm'

vi.mock('@/app/actions/profile', () => ({
  updateProfileAction: vi.fn(),
  changePasswordAction: vi.fn(),
  uploadAvatarAction: vi.fn(),
}))

const defaultProps = {
  name: 'Ana Silva',
  email: 'ana@x.com',
  phone: '11999998888',
}

describe('ProfileForm', () => {
  it('renders all profile fields with default values', () => {
    render(<ProfileForm {...defaultProps} />)
    expect(screen.getByLabelText(/nome/i)).toHaveValue('Ana Silva')
    expect(screen.getByLabelText(/email/i)).toHaveValue('ana@x.com')
    expect(screen.getByLabelText(/telefone/i)).toHaveValue('(11) 99999-8888')
  })

  it('renders submit button', () => {
    render(<ProfileForm {...defaultProps} />)
    expect(screen.getByRole('button', { name: /salvar/i })).toBeInTheDocument()
  })

  it('não exibe cargo, departamento nem valor/hora', () => {
    render(<ProfileForm {...defaultProps} />)
    expect(screen.queryByLabelText(/cargo/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/departamento/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/valor\/hora/i)).not.toBeInTheDocument()
  })

  it('formata o telefone e acusa número inválido ao sair do campo', () => {
    render(<ProfileForm name="Ana" email="ana@x.com" />)
    const telefone = screen.getByLabelText(/telefone/i)
    fireEvent.change(telefone, { target: { value: '1133' } })
    expect(telefone).toHaveValue('(11) 33')
    fireEvent.blur(telefone)
    expect(screen.getByText(/Telefone inválido/)).toBeInTheDocument()
    fireEvent.change(telefone, { target: { value: '1133334444' } })
    expect(telefone).toHaveValue('(11) 3333-4444')
    expect(screen.queryByText(/Telefone inválido/)).not.toBeInTheDocument()
  })

  it('acusa e-mail inválido ao sair do campo', () => {
    render(<ProfileForm name="Ana" email="ana@x.com" />)
    const email = screen.getByLabelText(/email/i)
    fireEvent.change(email, { target: { value: 'ana @x' } })
    expect(email).toHaveValue('ana@x')
    fireEvent.blur(email)
    expect(screen.getByText(/E-mail inválido/)).toBeInTheDocument()
  })
})
