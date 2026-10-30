import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProjetoFormPage from '@/components/projetos/ProjetoFormPage'
import { getProjetoAction, updateProjetoAction } from '@/app/actions/projetos'
import { escolherOpcao } from '../../helpers/select'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }), useParams: () => ({ projetoId: 'p1' }), useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/projetos', () => ({ getProjetoAction: vi.fn(), updateProjetoAction: vi.fn(), createProjetoAction: vi.fn(), retryMacroFasesSyncAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ listUsersAction: vi.fn(async () => ({ users: [] })) }))
vi.mock('@/app/actions/departments', () => ({ getDepartmentsAction: vi.fn(async () => []) }))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({ useProjectPermissions: () => new Set(['projeto:editar']) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/profile/AvatarUpload', () => ({ default: () => null }))
vi.mock('@/components/ui/ExpandableTextarea', () => ({ default: () => null }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getProjetoAction).mockResolvedValue({ projeto: { id: 'p1', name: 'Turma AMS', semestre: 'ano', anoAms: '2', ano: 2026, departamentos: [], macroFases: [] } } as never)
  vi.mocked(updateProjetoAction).mockResolvedValue({ projeto: { id: 'p1' } } as never)
})

describe('Ano do AMS no editar projeto', () => {
  it('recupera e salva o ano da turma sem alterar o ano calendário', async () => {
    render(<ProjetoFormPage />)
    const campo = await screen.findByLabelText('Ano do AMS')
    expect(campo).toHaveTextContent('2º')
    escolherOpcao(campo, '1º')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }))
    await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledWith(undefined, 'p1', expect.objectContaining({ semestre: 'ano', anoAms: '1', ano: '2026', termo: '', turno: '' })))
  })
  it('só aparece no período Ano e limpa a classificação ao trocar para semestre', async () => {
    render(<ProjetoFormPage />)
    expect(await screen.findByLabelText('Ano do AMS')).toHaveTextContent('2º')
    escolherOpcao(screen.getByLabelText('Período'), '1º Semestre')
    expect(screen.queryByLabelText('Ano do AMS')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Termo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }))
    await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledWith(undefined, 'p1', expect.objectContaining({ semestre: '1', anoAms: null })))
    escolherOpcao(screen.getByLabelText('Período'), 'Ano')
    expect(screen.getByLabelText('Ano do AMS')).toHaveTextContent('Selecione')
  })
})
