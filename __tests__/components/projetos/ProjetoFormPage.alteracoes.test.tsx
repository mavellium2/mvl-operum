import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import ProjetoFormPage from '@/components/projetos/ProjetoFormPage'
import { getProjetoAction, updateProjetoAction } from '@/app/actions/projetos'
import { listarVersoesProjetoAction, impactoExclusaoFaseAction } from '@/app/actions/projetoEdicao'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }), useParams: () => ({ projetoId: 'p1' }), useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/projetos', () => ({ getProjetoAction: vi.fn(), updateProjetoAction: vi.fn(), createProjetoAction: vi.fn(), retryMacroFasesSyncAction: vi.fn() }))
vi.mock('@/app/actions/projetoEdicao', () => ({ listarVersoesProjetoAction: vi.fn(async () => ({ versoes: [] })), impactoExclusaoFaseAction: vi.fn(), excluirFaseAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ listUsersAction: vi.fn(async () => ({ users: [] })) }))
vi.mock('@/app/actions/departments', () => ({ getDepartmentsAction: vi.fn(async () => []) }))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({ useProjectPermissions: vi.fn(() => new Set(['projeto:editar', 'documentos:editar', 'documentos:aprovar', 'planilha:orcado', 'planilha:realizado-todos'])) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useProjectPermissions).mockReturnValue(new Set(['projeto:editar', 'documentos:editar', 'documentos:aprovar', 'planilha:orcado', 'planilha:realizado-todos']))
  vi.mocked(listarVersoesProjetoAction).mockResolvedValue({ versoes: [] })
  vi.mocked(getProjetoAction).mockResolvedValue({ projeto: {
    id: 'p1', name: 'JANUS V2', semestre: '2', termo: '5', turno: 'Noturno', ano: 2026, departamentos: [],
    justificativa: 'Equipes grandes (até 10 membros).', endDate: '2026-11-16T00:00:00Z',
    macroFases: [{ nodeId: 'n1', fase: 'Escopo', dataLimite: '2026-09-25', custo: '83,34' }],
  }, gerenteId: 'g1', gerente: { id: 'g1', name: 'Ana Gerente', avatarUrl: null } } as never)
  vi.mocked(updateProjetoAction).mockResolvedValue({ projeto: { id: 'p1' } } as never)
})

describe('Editar projeto — alterações não salvas', () => {
  it('a barra fica visível; com alteração mostra antes e depois e desfazer volta o campo', async () => {
    render(<ProjetoFormPage />)
    const nome = await screen.findByLabelText('Nome do projeto')
    await waitFor(() => expect(nome).toHaveValue('JANUS V2'))
    // Sem alteração: a barra continua visível, com "Tudo salvo" e o Salvar desativado.
    expect(screen.getByRole('status')).toHaveTextContent('Tudo salvo')
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument()

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
    await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledWith(undefined, 'p1', expect.objectContaining({ name: 'JANUS V3', macroFases: [{ fase: 'Escopo', dataLimite: '2026-09-25', custo: '83,34', nodeId: 'n1' }] }), expect.objectContaining({ alteracoes: expect.any(Array) })))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('Tudo salvo')
  })

  it('mostra o gerente com a foto mesmo sem a lista de usuários (quem não é admin)', async () => {
    render(<ProjetoFormPage />)
    const campo = await screen.findByRole('combobox', { name: 'Gerente' })
    await waitFor(() => expect(campo).toHaveTextContent('Ana Gerente'))
    expect(campo).toHaveTextContent('AG') // iniciais no lugar da foto, antes do nome
  })

  it('histórico: exige confirmação e ativa a versão antiga sem criar outra', async () => {
    const form = { name: 'JANUS V1', slogan: '', startDate: '', endDate: '2026-11-16', location: '', logoUrl: '', initialMemberId: 'g1', justificativa: 'Equipes grandes (até 10 membros).', objetivos: '', metodologia: '', descricaoProduto: '', premissas: '', restricoes: '', limitesAutoridade: '', semestre: '2', termo: '5', turno: 'Noturno', ano: '2026', anoAms: '', departamentos: [] }
    vi.mocked(listarVersoesProjetoAction).mockResolvedValue({ versoes: [
      { numero: 2, conteudo: { form: { ...form, name: 'JANUS V2' }, fases: [{ fase: 'Escopo', dataLimite: '2026-09-25', custo: '83,34' }] }, alteracoes: ['Nome do projeto'], restauradaDe: null, autorNome: 'Ana', createdAt: '2026-10-31T12:00:00Z' },
      { numero: 1, conteudo: { form, fases: [{ fase: 'Escopo', dataLimite: '2026-09-25', custo: '83,34' }] }, alteracoes: [], restauradaDe: null, autorNome: '', createdAt: '2026-10-30T12:00:00Z' },
    ] })
    render(<ProjetoFormPage />)
    await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }))
    const painel = await screen.findByRole('dialog', { name: 'Histórico de versões' })
    const versoes = await within(painel).findAllByTestId('versao')
    expect(versoes[0]).toHaveTextContent('v2')
    expect(versoes[0]).toHaveTextContent('Atual')
    expect(within(versoes[0]).queryByRole('button', { name: /Restaurar/ })).not.toBeInTheDocument()
    fireEvent.click(within(versoes[1]).getByRole('button', { name: /Restaurar esta versão/ }))
    expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2')
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar esta versão' }))
    await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledWith(undefined, 'p1', expect.objectContaining({ name: 'JANUS V1' }), expect.objectContaining({ ativarVersao: 1, alteracoes: ['Nome do projeto'] })))
  })

  it('fase já salva: a lixeira abre a confirmação com o impacto em vez de apagar direto', async () => {
    vi.mocked(impactoExclusaoFaseAction).mockResolvedValue({ impacto: { fase: 'Escopo', codigo: '1.1', itensEap: 3, tarefas: 2, sprints: [{ nome: '1.1 Escopo', tarefas: 2, segundosRegistrados: 3600, comDados: true }], orcado: 83.34, realizado: 0, exigeMotivo: true } })
    render(<ProjetoFormPage />)
    await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
    fireEvent.click(screen.getByRole('tab', { name: /Cronograma Financeiro/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remover fase 1.1' }))
    expect(await screen.findByRole('dialog', { name: 'Excluir a fase 1.1 Escopo?' })).toBeInTheDocument()
    expect(await screen.findByTestId('impacto-exclusao')).toHaveTextContent('3 itens da EAP')
    expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).toBeDisabled() // falta o motivo
    expect(screen.getByLabelText('Fase 1.1')).toHaveValue('Escopo')
  })
})

it('pede confirmação antes de salvar uma edição sobre versão antiga, preservando o histórico', async () => {
  vi.mocked(listarVersoesProjetoAction).mockResolvedValue({ versoes: [
    { numero: 4, ativa: false }, { numero: 1, ativa: true },
  ] } as never)
  render(<ProjetoFormPage />)
  await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
  await screen.findByLabelText('Versão ativa: 1')
  fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Nova edição' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  const modal = await screen.findByRole('dialog', { name: 'Salvar como nova versão?' })
  expect(modal).toHaveTextContent('As versões anteriores continuam disponíveis')
  expect(updateProjetoAction).not.toHaveBeenCalled()
  fireEvent.click(within(modal).getByRole('button', { name: 'Salvar como v5' }))
  await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledWith(undefined, 'p1', expect.objectContaining({ name: 'Nova edição' }), expect.objectContaining({ restauradaDe: 1 })))
})

  it('histórico recebe foco, fecha por Escape e devolve foco ao botão', async () => {
    render(<ProjetoFormPage />)
    await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
    const trigger = screen.getByRole('button', { name: 'Histórico' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'Fechar histórico' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Histórico de versões' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('mostra duplicidade nas fases e remove o aviso quando corrigida, sem enviar', async () => {
    render(<ProjetoFormPage />)
    await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
    fireEvent.click(screen.getByRole('tab', { name: /Cronograma Financeiro/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar Fase' }))
    fireEvent.change(screen.getByLabelText('Fase 1.2'), { target: { value: ' ESCOPO ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(screen.getByLabelText('Fase 1.1')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Nome repetido')
    expect(updateProjetoAction).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Fase 1.2'), { target: { value: 'Entrega' } })
    expect(screen.getByLabelText('Fase 1.1')).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('bloqueia data impossível, preserva a digitação e foca a correção', async () => {
    render(<ProjetoFormPage />)
    await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
    fireEvent.click(screen.getByRole('tab', { name: /Cronograma Financeiro/ }))
    const date = await screen.findByLabelText('Data limite da fase 1.1')
    fireEvent.change(date, { target: { value: '31/02/2027' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(date).toHaveValue('31/02/2027')
    expect(date).toHaveFocus()
    expect(date).toHaveAttribute('aria-invalid', 'true')
    expect(updateProjetoAction).not.toHaveBeenCalled()
    fireEvent.change(date, { target: { value: '28/02/2027' } })
    expect(date).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('identifica nome obrigatório e prazo final anterior ao início sem gravar', async () => {
    render(<ProjetoFormPage />)
    await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
    const name = screen.getByLabelText('Nome do projeto')
    fireEvent.change(name, { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(name).toHaveFocus()
    expect(name).toHaveAttribute('aria-invalid', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o campo' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(name).toHaveFocus()
    fireEvent.change(name, { target: { value: 'JANUS V2' } })
    fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '20/11/2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(screen.getByLabelText('Data prevista de fim')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('igual ou posterior')
    expect(updateProjetoAction).not.toHaveBeenCalled()
  })

it('um salvamento pendente bloqueia novo envio e preserva mudanças feitas durante a resposta', async () => {
  let resolver!: (value: Awaited<ReturnType<typeof updateProjetoAction>>) => void
  vi.mocked(updateProjetoAction).mockImplementationOnce(() => new Promise(resolve => { resolver = resolve }))
  render(<ProjetoFormPage />)
  await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
  fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Nome enviado' } })
  const salvar = screen.getByRole('button', { name: 'Salvar alterações' })
  fireEvent.click(salvar)
  fireEvent.click(salvar)
  expect(updateProjetoAction).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Nome digitado durante o envio' } })
  resolver({ projeto: { id: 'p1' } } as never)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled())
  expect(screen.getByLabelText('Nome do projeto')).toHaveValue('Nome digitado durante o envio')
  expect(screen.getByRole('button', { name: /1 alteração não salva/ })).toBeInTheDocument()
})

it('falha de conexão preserva o rascunho e permite nova tentativa', async () => {
  vi.mocked(updateProjetoAction).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ projeto: { id: 'p1' } } as never)
  render(<ProjetoFormPage />)
  await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
  fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Rascunho preservado' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Suas edições foram preservadas')
  expect(screen.getByLabelText('Nome do projeto')).toHaveValue('Rascunho preservado')
  const tentar = await screen.findByRole('button', { name: 'Salvar alterações' })
  await waitFor(() => expect(tentar).toBeEnabled())
  fireEvent.click(tentar)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tudo salvo'))
  expect(updateProjetoAction).toHaveBeenCalledTimes(2)
})

it('sem acesso a custos e documentos, mantém esses campos protegidos e não os envia', async () => {
  vi.mocked(useProjectPermissions).mockReturnValue(new Set(['projeto:editar']))
  render(<ProjetoFormPage canAssignRoles={false} />)
  await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
  expect(screen.getByLabelText('Justificativa do Projeto')).toHaveAttribute('readonly')
  fireEvent.click(screen.getByRole('tab', { name: /Cronograma Financeiro/ }))
  expect(await screen.findByRole('button', { name: 'Adicionar Fase' })).toBeDisabled()
  expect(screen.getByLabelText('Fase 1.1')).toBeDisabled()
  expect(screen.getByLabelText('Custo da fase 1')).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Nome permitido' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(updateProjetoAction).toHaveBeenCalled())
  const payload = vi.mocked(updateProjetoAction).mock.calls[0][2]
  expect(payload).toHaveProperty('name', 'Nome permitido')
  expect(payload).not.toHaveProperty('macroFases')
  expect(payload).not.toHaveProperty('justificativa')
  expect(payload).not.toHaveProperty('initialMemberId')
})

it('avisa o excesso de texto junto ao campo, bloqueia envio e remove o erro ao corrigir', async () => {
  render(<ProjetoFormPage />)
  await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
  const campo = screen.getByLabelText('Justificativa do Projeto')
  fireEvent.change(campo, { target: { value: 'a'.repeat(24641) } })
  expect(campo).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText(/Remova 4.641/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  expect(campo).toHaveFocus()
  expect(updateProjetoAction).not.toHaveBeenCalled()
  fireEvent.change(campo, { target: { value: 'a'.repeat(20000) } })
  expect(campo).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledTimes(1))
})

it('mantém a chave da tentativa ao reenviar a mesma edição após perder a resposta', async () => {
  vi.mocked(updateProjetoAction).mockRejectedValueOnce(new Error('resposta perdida')).mockResolvedValueOnce({ projeto: { id: 'p1' } } as never)
  render(<ProjetoFormPage />)
  await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
  fireEvent.change(screen.getByLabelText('Nome do projeto'), { target: { value: 'Pedido repetido' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await screen.findByRole('alert')
  const retry = await screen.findByRole('button', { name: 'Salvar alterações' })
  fireEvent.click(retry)
  await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledTimes(2))
  const first = vi.mocked(updateProjetoAction).mock.calls[0][3]?.operacaoId
  expect(first).toMatch(/^[0-9a-f-]{36}$/)
  expect(vi.mocked(updateProjetoAction).mock.calls[1][3]?.operacaoId).toBe(first)
})

it('fase recém-salva recebe o id da EAP e pode ser renomeada sem recriar a fase', async () => {
  vi.mocked(updateProjetoAction).mockResolvedValueOnce({ projeto: { id: 'p1' }, fasesSincronizadas: [{ fase: 'Nova fase', nodeId: 'n2' }] } as never)
  render(<ProjetoFormPage />)
  await waitFor(() => expect(screen.getByLabelText('Nome do projeto')).toHaveValue('JANUS V2'))
  fireEvent.click(screen.getByRole('tab', { name: /Cronograma Financeiro/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Adicionar Fase' }))
  fireEvent.change(screen.getByLabelText('Fase 1.2'), { target: { value: 'Nova fase' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Tudo salvo'))
  fireEvent.change(screen.getByLabelText('Fase 1.2'), { target: { value: 'Fase renomeada' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(updateProjetoAction).toHaveBeenCalledTimes(2))
  expect(vi.mocked(updateProjetoAction).mock.calls[1][2]).toEqual(expect.objectContaining({ macroFases: expect.arrayContaining([expect.objectContaining({ fase: 'Fase renomeada', nodeId: 'n2' })]) }))
})
