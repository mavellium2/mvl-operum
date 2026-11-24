import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import CriarGerenteDialog from '@/components/projetos/CriarGerenteDialog'
import { adminCreateUserAction } from '@/app/actions/admin'

vi.mock('@/app/actions/admin', () => ({ adminCreateUserAction: vi.fn() }))

beforeEach(() => vi.clearAllMocks())

function preencher(email = 'ana@fatec.edu.br') {
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/Senha inicial/), { target: { value: 'Senha1234' } })
}

describe('CriarGerenteDialog', () => {
  it('pré-preenche o nome, cria o usuário com troca de senha obrigatória e devolve a pessoa', async () => {
    vi.mocked(adminCreateUserAction).mockResolvedValue({ user: { id: 'u9', name: 'Ana Souza', email: 'ana@fatec.edu.br' } } as never)
    const onCriado = vi.fn()
    render(<CriarGerenteDialog nomeInicial="Ana Souza" onClose={vi.fn()} onCriado={onCriado} />)
    expect(screen.getByLabelText(/Nome/)).toHaveValue('Ana Souza')
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Criar e designar' }))
    await waitFor(() => expect(onCriado).toHaveBeenCalledWith(expect.objectContaining({ id: 'u9', name: 'Ana Souza' })))
    expect(adminCreateUserAction).toHaveBeenCalledTimes(1)
    expect(adminCreateUserAction).toHaveBeenCalledWith({ name: 'Ana Souza', email: 'ana@fatec.edu.br', password: 'Senha1234', forcePasswordChange: true })
  })
  it('mostra o erro do servidor (e-mail repetido) e não designa ninguém', async () => {
    vi.mocked(adminCreateUserAction).mockResolvedValue({ error: 'E-mail já cadastrado' } as never)
    const onCriado = vi.fn()
    render(<CriarGerenteDialog nomeInicial="Ana" onClose={vi.fn()} onCriado={onCriado} />)
    preencher()
    fireEvent.click(screen.getByRole('button', { name: 'Criar e designar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail já cadastrado')
    expect(onCriado).not.toHaveBeenCalled()
  })
  it('exige nome, e-mail e senha sem chamar o servidor', () => {
    render(<CriarGerenteDialog onClose={vi.fn()} onCriado={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Criar e designar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('obrigatórios')
    expect(adminCreateUserAction).not.toHaveBeenCalled()
  })
})
