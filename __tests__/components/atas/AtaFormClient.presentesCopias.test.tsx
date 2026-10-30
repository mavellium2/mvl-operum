import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi, describe } from 'vitest'
import AtaFormClient, { semRepetir } from '@/components/atas/AtaFormClient'
import { ToastProvider } from '@/components/ui/Toast'
import { atualizarAtaAction, enviarAnexoAtaAction } from '@/app/actions/atas'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/app/actions/atas', () => ({
  atualizarAtaAction: vi.fn(async () => ({ success: true })),
  criarAtaAction: vi.fn(),
  enviarAnexoAtaAction: vi.fn(async () => ({ anexo: { nome: 'pauta.pdf', url: 'https://storage/atas/pauta.pdf' } })),
}))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({ useProjectPermissions: () => new Set(['documentos:editar']) }))
vi.mock('@/components/projetos/documentacao/HistoricoDocumento', () => ({ default: () => null }))
vi.mock('react-to-print', () => ({ useReactToPrint: () => vi.fn() }))
// Seletor simplificado: um <select> com os membros oferecidos.
vi.mock('@/components/projetos/documentacao/MembroEquipeSelect', () => ({
  default: ({ membros, value, onChange, placeholder, ariaLabel }: { membros: { id: string; name: string }[]; value?: string | null; onChange: (m: unknown) => void; placeholder?: string; ariaLabel?: string }) => (
    <select aria-label={ariaLabel ?? placeholder} value={value ?? ''} onChange={e => onChange(membros.find(m => m.id === e.target.value) ?? null)}>
      <option value="">—</option>
      {membros.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  ),
  useMembrosEquipe: (m: unknown[]) => ({ todos: m, registrarCriado: vi.fn() }),
}))

const members = [
  { id: 'u1', name: 'Ana', setor: 'Dev', signatureUrl: null },
  { id: 'u2', name: 'Bia', setor: 'Gerente', signatureUrl: null },
]
const initial = { data: '2026-10-05T00:00:00.000Z', elaboradoPor: 'Ana', copiasPara: [], presentes: [{ nome: 'Ana', setorEmpresa: 'Dev', userId: 'u1' }], anexos: [], acoes: [] }

function renderForm(extra: Partial<Parameters<typeof AtaFormClient>[0]> = {}) {
  return render(<ToastProvider><AtaFormClient projetoId="p1" ataId="a1" mode="edit" members={members} initial={initial} {...extra} /></ToastProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('presentes da ata', () => {
  it('presentes ficam na tabela da folha e saem pelo "×" com o nome', () => {
    renderForm()
    expect(screen.getAllByRole('combobox', { name: 'Presente' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remover Ana' }))
    expect(screen.queryByRole('combobox', { name: 'Presente' })).not.toBeInTheDocument()
  })

  it('quem já está na lista não é oferecido de novo', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar presente' }))
    const seletores = screen.getAllByRole('combobox', { name: 'Presente' })
    expect(within(seletores[1]).queryByRole('option', { name: 'Ana' })).not.toBeInTheDocument()
    expect(within(seletores[1]).getByRole('option', { name: 'Bia' })).toBeInTheDocument()
  })

  it('"Incluir toda a equipe" completa a lista sem repetir e preserva ao salvar', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Incluir toda a equipe' }))
    // Com toda a equipe na lista, o atalho some.
    expect(screen.queryByRole('button', { name: 'Incluir toda a equipe' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' }))
    await waitFor(() => expect(atualizarAtaAction).toHaveBeenCalledWith('a1', 'p1', expect.objectContaining({
      presentes: [
        { nome: 'Ana', setorEmpresa: 'Dev', userId: 'u1' },
        { nome: 'Bia', setorEmpresa: 'Gerente', userId: 'u2' },
      ],
    })))
  })
})

describe('cópias e anexos da ata', () => {
  it('oferece os e-mails dos stakeholders e salva sem repetir', async () => {
    renderForm({ emailsSugeridos: [{ email: 'bia@x.com', nome: 'Bia' }, { email: 'cliente@y.com', nome: 'Cliente' }], initial: { ...initial, copiasPara: ['bia@x.com'] } })
    const campo = screen.getByRole('textbox', { name: 'Adicionar destinatário da cópia' })
    fireEvent.focus(campo)
    fireEvent.change(campo, { target: { value: 'cliente' } })
    fireEvent.mouseDown(await screen.findByRole('button', { name: 'cliente@y.com' }))
    expect(screen.getByTestId('ata-copias-resumo')).toHaveTextContent('2 destinatários: Bia <bia@x.com>, Cliente <cliente@y.com>')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' }))
    await waitFor(() => expect(atualizarAtaAction).toHaveBeenCalledWith('a1', 'p1', expect.objectContaining({ copiasPara: ['bia@x.com', 'cliente@y.com'] })))
  })

  it('remove repetidos sem diferenciar maiúsculas', () => {
    expect(semRepetir(['A@x.com', ' a@x.com ', '', 'b@x.com'])).toEqual(['A@x.com', 'b@x.com'])
  })

  it('botão de upload envia o arquivo e inclui o anexo', async () => {
    renderForm()
    expect(screen.getByRole('button', { name: '+ Enviar arquivo' })).toBeInTheDocument()
    const arquivo = new File(['%PDF'], 'pauta.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Arquivo do anexo'), { target: { files: [arquivo] } })
    await waitFor(() => expect(screen.getByDisplayValue('pauta.pdf')).toBeInTheDocument())
    expect(enviarAnexoAtaAction).toHaveBeenCalledWith('p1', expect.any(FormData))
    expect(screen.getByDisplayValue('https://storage/atas/pauta.pdf')).toBeInTheDocument()
  })
})
