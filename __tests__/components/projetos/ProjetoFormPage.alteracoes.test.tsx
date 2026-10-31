import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ProjetoFormPage from '@/components/projetos/ProjetoFormPage'
import { getProjetoAction, updateProjetoAction } from '@/app/actions/projetos'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }), useParams: () => ({ projetoId: 'p1' }), useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/projetos', () => ({ getProjetoAction: vi.fn(), updateProjetoAction: vi.fn(), createProjetoAction: vi.fn(), retryMacroFasesSyncAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ listUsersAction: vi.fn(async () => ({ users: [] })) }))
vi.mock('@/app/actions/departments', () => ({ getDepartmentsAction: vi.fn(async () => []) }))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({ useProjectPermissions: () => new Set(['projeto:editar', 'documentos:editar', 'documentos:aprovar', 'planilha:orcado', 'planilha:realizado-todos']) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getProjetoAction).mockResolvedValue({ projeto: {
    id: 'p1', name: 'JANUS V2', semestre: '2', termo: '5', turno: 'Noturno', ano: 2026, departamentos: [],
    justificativa: 'Equipes grandes (até 10 membros).', endDate: '2026-11-16T00:00:00Z',
    macroFases: [{ fase: 'Escopo', dataLimite: '2026-09-25', custo: '83,34' }],
  } } as never)
  vi.mocked(updateProjetoAction).mockResolvedValue({ projeto: { id: 'p1' } } as never)
})

describe('Editar projeto — alterações não salvas', () => {
  it('a barra fica visível; com alteração mostra antes e depois e desfazer volta o campo', async () => {
    render(<ProjetoFormPage />)
    const nome = await screen.findByLabelText('Nome do projeto')
    await waitFor(() => expect(nome).toHaveValue('JANUS V2'))
    // Sem alteração: a barra continua visível, com "Tudo salvo" e o Salvar desativado.
    expect(screen.getByRole('status')).toHaveTextContent('Tudo salvo')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled()

    // Diretrizes e Cronograma ficam em abas com resumo.
    expect(screen.getByRole('tab', { name: /Cronograma Financeiro.*1 fase/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Justificativa do Projeto'), { target: { value: 'Equipes grandes (de 5 a 10 membros).' } })
    fireEvent.change(screen.getByLabelText('Data prevista de fim'), { target: { value: '30/11/2026' } })
    fireEvent.click(screen.getByRole('button', { name: /2 alterações não salvas/ }))

    const painel = screen.getByRole('dialog', { name: 'Alterações não salvas' })
    const itens = within(painel).getAllByTestId('alteracao')
    expect(itens.map(i => i.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Fim previsto'), expect.stringContaining('Justificativa do Projeto')]))
    expect(within(painel).getByText('16/11/2026').tagName).toBe('DEL')
    expect(within(painel).getByText('30/11/2026').tagName).toBe('INS')
    expect(painel.querySelector('del')?.textContent).toBeTruthy()

    fireEvent.click(within(painel).getByRole('button', { name: 'Desfazer Fim previsto' }))
    expect(screen.getByLabelText('Data prevista de fim')).toHaveValue('16/11/2026')
    expect(screen.getByRole('button', { name: /1 alteração não salva/ })).toBeInTheDocument()
  })

  it('salvar envia o formulário e volta a "Tudo salvo"; descartar volta tudo', async () => {
    render(<ProjetoFormPage />)
    await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'JANUS V3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2')

    fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'JANUS V3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledWith(undefined, 'p1', expect.objectContaining({ name: 'JANUS V3', macroFases: [{ fase: 'Escopo', dataLimite: '2026-09-25', custo: '83,34' }] })))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled())
    expect(screen.getByRole('status')).toHaveTextContent('Tudo salvo')
  })
})
