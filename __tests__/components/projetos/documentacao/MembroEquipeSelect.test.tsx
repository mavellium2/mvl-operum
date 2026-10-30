import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MembroEquipeSelect from '@/components/projetos/documentacao/MembroEquipeSelect'
import { ToastProvider } from '@/components/ui/Toast'

// Preserve the actual lateral form while loading it without Next's runtime.
vi.mock('next/dynamic', async () => {
  const { default: CadastroMembroLateral } = await import('@/components/projetos/cadastro/CadastroMembroLateral')
  return { default: () => CadastroMembroLateral }
})
vi.mock('@/app/actions/cadastroStakeholders', () => ({ carregarCadastroStakeholdersAction: vi.fn() }))
vi.mock('@/app/actions/stakeholders', () => ({
  createStakeholderAction: vi.fn(),
  updateStakeholderAction: vi.fn(),
  bindStakeholderAction: vi.fn(),
  unbindStakeholderAction: vi.fn(),
  reorderStakeholdersAction: vi.fn().mockResolvedValue({ success: true }),
  reorderMembersAction: vi.fn().mockResolvedValue({ success: true }),
  uploadMemberSignatureAction: vi.fn().mockResolvedValue({ error: 'noop' }),
}))
vi.mock('@/app/actions/projects', () => ({ addMemberAction: vi.fn(), removeMemberAction: vi.fn() }))
vi.mock('@/app/actions/projetos', () => ({ updateProjetoMemberAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ adminCreateUserAction: vi.fn() }))
vi.mock('@/components/profile/AvatarUpload', () => ({ default: () => null }))
vi.mock('@/components/ui/AddressFields', () => ({
  default: () => null,
  emptyAddress: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
}))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({ useProjectPermissions: () => new Set(['projeto:equipe']) }))


import { carregarCadastroStakeholdersAction } from '@/app/actions/cadastroStakeholders'
import { adminCreateUserAction } from '@/app/actions/admin'
import { addMemberAction } from '@/app/actions/projects'

const MEMBROS = [
  { id: 'ana', name: 'Ana', setor: null },
  { id: 'joao', name: 'João', setor: null, pendente: true },
]

function renderSelect() {
  const onChange = vi.fn()
  const onCriarMembro = vi.fn()
  function Tela() {
    const [value, setValue] = useState<string | null>(null)
    return <ToastProvider>
      <MembroEquipeSelect membros={MEMBROS} projetoId="p1" value={value} ariaLabel="Elaborado por"
        onChange={membro => { onChange(membro); setValue(membro?.id ?? null) }} onCriarMembro={onCriarMembro} />
    </ToastProvider>
  }
  return { ...render(<Tela />), onChange, onCriarMembro }
}

async function preencherFormulario() {
  await userEvent.type(await screen.findByPlaceholderText('Nome completo ou razão social'), 'Pedro')
  await userEvent.type(screen.getByPlaceholderText('usuario@empresa.com.br'), 'pedro@test.com')
  await userEvent.type(screen.getByPlaceholderText('Mínimo 8 caracteres'), 'senha1234')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(carregarCadastroStakeholdersAction).mockResolvedValue({ dados: {
    stakeholders: [], stakeholdersDisponiveis: [], usuariosDisponiveis: [], userRole: 'admin',
  } } as Awaited<ReturnType<typeof carregarCadastroStakeholdersAction>>)
  vi.mocked(addMemberAction).mockResolvedValue({ success: true } as never)
})

describe('MembroEquipeSelect', () => {
  it('lista membros no novo Select e mostra a pendência como descrição', async () => {
    const { onChange } = renderSelect()
    await userEvent.click(screen.getByRole('combobox', { name: 'Elaborado por' }))
    expect(screen.getByRole('option', { name: 'Ana' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /João\s*Cadastro pendente/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('option', { name: 'Ana' }))
    expect(onChange).toHaveBeenCalledWith(MEMBROS[0])
    expect(screen.getByRole('combobox', { name: 'Elaborado por' })).toHaveTextContent('Ana')
  })

  it('criar pelo rodapé abre o cadastro interno lateral diretamente no formulário', async () => {
    renderSelect()
    await userEvent.click(screen.getByRole('combobox', { name: 'Elaborado por' }))
    await userEvent.click(screen.getByRole('button', { name: 'Criar novo membro' }))
    const painel = await screen.findByRole('dialog', { name: 'Adicionar membro da equipe' })
    expect(within(painel).getByPlaceholderText('usuario@empresa.com.br')).toBeInTheDocument()
    expect(within(painel).getByPlaceholderText('Mínimo 8 caracteres')).toBeInTheDocument()
    expect(within(painel).getByRole('checkbox', { name: /Obrigar atualizar a senha/ })).toBeChecked()
    expect(screen.queryByRole('dialog', { name: 'Adicionar stakeholder externo' })).not.toBeInTheDocument()
    expect(carregarCadastroStakeholdersAction).toHaveBeenCalledWith('p1')
  })

  it('devolve o novo membro a onCriarMembro e onChange e mantém a pessoa selecionada', async () => {
    vi.mocked(adminCreateUserAction).mockResolvedValue({ user: {
      id: 'pedro', name: 'Pedro', email: 'pedro@test.com', avatarUrl: null, role: 'user',
    } } as never)
    const { onChange, onCriarMembro } = renderSelect()
    const atualizado = vi.fn()
    window.addEventListener('operum:project-members-updated', atualizado)
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Criar novo membro da equipe' }))
      await preencherFormulario()
      await userEvent.click(screen.getByRole('button', { name: 'Criar Stakeholder' }))
      const membro = { id: 'pedro', name: 'Pedro', setor: null, pendente: true }
      await waitFor(() => expect(onChange).toHaveBeenCalledWith(membro))
      expect(onCriarMembro).toHaveBeenCalledExactlyOnceWith(membro)
      expect(addMemberAction).toHaveBeenCalledWith('p1', 'pedro')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Elaborado por' })).toHaveTextContent('Pedro')
      await userEvent.click(screen.getByRole('combobox', { name: 'Elaborado por' }))
      expect(screen.getByRole('option', { name: /Pedro\s*Cadastro pendente/ })).toHaveAttribute('aria-selected', 'true')
      expect(atualizado).toHaveBeenCalledWith(expect.objectContaining({ detail: { projetoId: 'p1' } }))
    } finally {
      window.removeEventListener('operum:project-members-updated', atualizado)
    }
  })

  it('falha na criação mantém o painel e não devolve uma pessoa inexistente', async () => {
    vi.mocked(adminCreateUserAction).mockResolvedValue({ error: 'Sem permissão para criar usuário' } as never)
    const { onChange, onCriarMembro } = renderSelect()
    await userEvent.click(screen.getByRole('button', { name: 'Criar novo membro da equipe' }))
    await preencherFormulario()
    await userEvent.click(screen.getByRole('button', { name: 'Criar Stakeholder' }))
    expect(await screen.findByText('Sem permissão para criar usuário')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Adicionar membro da equipe' })).toBeInTheDocument()
    expect(onCriarMembro).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(addMemberAction).not.toHaveBeenCalled()
  })
})
