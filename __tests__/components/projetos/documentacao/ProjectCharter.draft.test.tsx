import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithSession } from '@/lib/clientFetch'
import ProjectCharter from '@/components/projetos/documentacao/ProjectCharter'
const { toast, members } = vi.hoisted(() => ({ toast: vi.fn(), members: [] }))
vi.mock('next/navigation', () => ({ useParams: () => ({ projetoId: 'p1' }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('react-to-print', () => ({ useReactToPrint: () => vi.fn() }))
vi.mock('@/lib/clientFetch', () => ({ fetchWithSession: vi.fn() }))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({ useProjectPermissions: () => new Set(['documentos:ver', 'documentos:editar']) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('@/components/projetos/documentacao/MembroEquipeSelect', () => ({ default: () => null, useMembrosEquipe: () => ({ todos: members, registrarCriado: vi.fn() }) }))
const published = { project: { id: 'p1', name: 'Projeto', logoUrl: null, startDate: null, justificativa: 'Vigente', objetivos: '', metodologia: '', descricaoProduto: '', premissas: '', restricoes: '', limitesAutoridade: '' }, macroFases: [], gerente: null, gerenteProjeto: '', membros: [] }
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear() })
describe('rascunho privado do Termo', () => {
  it('não grava conteúdo inicial/vigente antes de terminar a recuperação do rascunho', async () => {
    let resolveDraft!: (response: Response) => void
    const draft = new Promise<Response>(resolve => { resolveDraft = resolve })
    vi.mocked(fetchWithSession).mockImplementation(async (url, init) => {
      if (init?.method === 'PATCH') return Response.json({ saved: true })
      if (String(url).includes('/revisions')) return draft
      if (String(url).includes('/versions')) return Response.json([])
      return Response.json(published)
    })
    render(<ProjectCharter />)
    // Enquanto o rascunho é recuperado, a folha mostra o vigente só para leitura.
    expect((await screen.findAllByText('Vigente')).length).toBeGreaterThan(0)
    expect(screen.queryByDisplayValue('Vigente')).not.toBeInTheDocument()
    await waitFor(() => expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/revisions?type=CHARTER&draft=1'))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1300)) })
    expect(vi.mocked(fetchWithSession).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
    await act(async () => { resolveDraft(Response.json({ payload: { justificativa: 'Rascunho privado' } })) })
    const field = await screen.findByDisplayValue('Rascunho privado')
    expect(vi.mocked(fetchWithSession).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
    fireEvent.change(field, { target: { value: 'Rascunho privado editado' } })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1300)) })
    const writes = vi.mocked(fetchWithSession).mock.calls.filter(([, init]) => init?.method === 'PATCH')
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.every(([, init]) => JSON.parse(String(init?.body)).justificativa === 'Rascunho privado editado')).toBe(true)
  })
  it('erro de recuperação mantém edição bloqueada e oferece nova tentativa', async () => {
    vi.mocked(fetchWithSession).mockImplementation(async url => String(url).includes('/revisions')
      ? Response.json({ error: 'Indisponível' }, { status: 503 })
      : String(url).includes('/versions') ? Response.json([]) : Response.json(published))
    render(<ProjectCharter />)
    expect(await screen.findByText(/Não foi possível recuperar seu rascunho/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled()
    // Sem o rascunho, a folha fica só para leitura: o texto aparece, mas não há campo editável.
    expect(screen.getAllByText('Vigente').length).toBeGreaterThan(0)
    expect(screen.queryByDisplayValue('Vigente')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' })).toBeDisabled()
  })
})

it('flush rejeitado preserva texto e não cria versão', async () => {
  vi.mocked(fetchWithSession).mockImplementation(async (url, init) => {
    if (init?.method === 'PATCH') return Response.json({ error: '500' }, { status: 500 })
    if (String(url).includes('/revisions')) return Response.json(null)
    if (String(url).includes('/versions')) return Response.json([])
    return Response.json(published)
  })
  render(<ProjectCharter />)
  const field = await screen.findByDisplayValue('Vigente')
  await waitFor(() => expect(field).toBeEnabled())
  fireEvent.change(field, { target: { value: 'Não perder' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' }))
  fireEvent.change(await screen.findByPlaceholderText('Ex: Inclusão da metodologia ágil'), { target: { value: 'Alteração' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('rascunho não foi salvo'), 'error'))
  expect(field).toHaveValue('Não perder')
  expect(vi.mocked(fetchWithSession).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  expect(screen.getByRole('button', { name: 'Tentar salvar novamente' })).toBeInTheDocument()
})
it('aguarda PATCH lento antes de criar uma única versão com os campos atuais', async () => {
  let release!: (response: Response) => void
  vi.mocked(fetchWithSession).mockImplementation(async (url, init) => {
    if (init?.method === 'PATCH') return new Promise(resolve => { release = resolve })
    if (init?.method === 'POST') return Response.json({ status: 'PENDING' })
    if (String(url).includes('/revisions')) return Response.json(null)
    if (String(url).includes('/versions')) return Response.json([])
    return Response.json(published)
  })
  render(<ProjectCharter />)
  const field = await screen.findByDisplayValue('Vigente')
  await waitFor(() => expect(field).toBeEnabled())
  fireEvent.change(field, { target: { value: 'Último texto' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' }))
  fireEvent.change(await screen.findByPlaceholderText('Ex: Inclusão da metodologia ágil'), { target: { value: 'Alteração' } })
  const confirm = screen.getByRole('button', { name: 'Confirmar' })
  fireEvent.click(confirm); fireEvent.click(confirm)
  await waitFor(() => expect(vi.mocked(fetchWithSession).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1))
  expect(vi.mocked(fetchWithSession).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
  await act(async () => { release(Response.json({ saved: true })) })
  await waitFor(() => expect(vi.mocked(fetchWithSession).mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1))
  const post = vi.mocked(fetchWithSession).mock.calls.find(([, init]) => init?.method === 'POST')!
  expect(JSON.parse(String(post[1]?.body)).payload.justificativa).toBe('Último texto')
})

it('restaura explicitamente a cópia local do autor sem substituir silenciosamente o servidor', async () => {
  const payload = { justificativa: 'Cópia local recuperada', objetivos: '', metodologia: '', descricaoProduto: '', premissas: '', restricoes: '', limitesAutoridade: '', principaisEnvolvidos: '', macroFases: [] }
  sessionStorage.setItem('operum:charter-draft:owner:p1', JSON.stringify({ value: JSON.stringify(payload), updatedAt: Date.now() }))
  vi.mocked(fetchWithSession).mockImplementation(async (url, init) => {
    if (String(url) === '/api/me') return Response.json({ user: { id: 'owner' } })
    if (init?.method === 'PATCH') return Response.json({ error: '503' }, { status: 503 })
    if (String(url).includes('/revisions')) return Response.json(null)
    if (String(url).includes('/versions')) return Response.json([])
    return Response.json(published)
  })
  render(<ProjectCharter />)
  const restore = await screen.findByRole('button', { name: 'Restaurar cópia local' })
  expect(screen.getByDisplayValue('Vigente')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Cópia local recuperada')).not.toBeInTheDocument()
  fireEvent.click(restore)
  expect(await screen.findByDisplayValue('Cópia local recuperada')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Restaurar cópia local' })).not.toBeInTheDocument()
})

it('edita direto na folha e a cópia usada no PDF mostra o mesmo texto', async () => {
  vi.mocked(fetchWithSession).mockImplementation(async url => String(url).includes('/revisions') ? Response.json(null) : String(url).includes('/versions') ? Response.json([]) : Response.json(published))
  const { container } = render(<ProjectCharter />)
  const field = await screen.findByDisplayValue('Vigente')
  await waitFor(() => expect(field).toBeEnabled())
  expect(field).toHaveAccessibleName('Justificativa')
  fireEvent.change(field, { target: { value: 'Texto da sessão' } })
  const copiaDoPdf = container.querySelector('[hidden]')!
  expect(copiaDoPdf).toHaveTextContent('Texto da sessão')
  expect(copiaDoPdf.querySelector('textarea')).toBeNull()
  // Ctrl+Z na folha desfaz a edição.
  field.focus()
  fireEvent.keyDown(field, { key: 'z', ctrlKey: true })
  await waitFor(() => expect(screen.getByDisplayValue('Vigente')).toBeInTheDocument())
})
it('abre um snapshot histórico sem substituir conteúdo ou cabeçalho pelos atuais', async () => {
  const version = { id: 'v1', status: 'APPROVED', versao: '1', commitTitle: 'Inicial', elaboradoPor: 'Autor', aprovadoPor: 'Gerente', createdAt: '2026-10-01', payload: { justificativa: 'Texto histórico', documentContext: { nomeProjeto: 'Nome histórico', gerenteProjeto: 'Gerente', membros: [] } }, changes: [] }
  vi.mocked(fetchWithSession).mockImplementation(async url => String(url).includes('/revisions') ? Response.json(null) : String(url).includes('/versions') ? Response.json([version]) : Response.json(published))
  render(<ProjectCharter />)
  await screen.findByDisplayValue('Vigente')
  fireEvent.click(screen.getByRole('button', { name: 'Histórico de versões' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Abrir documento desta versão' }))
  expect(screen.getAllByText('Texto histórico').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Nome do projeto: Nome histórico').length).toBeGreaterThan(0)
  expect(screen.queryByDisplayValue('Vigente')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Voltar ao rascunho' }))
  expect(screen.getByDisplayValue('Vigente')).toBeInTheDocument()
})

it('a folha atual usa a assinatura do perfil do gerente sem exigir abrir o histórico', async () => {
  vi.mocked(fetchWithSession).mockImplementation(async url => String(url).includes('/revisions') ? Response.json(null) : String(url).includes('/versions') ? Response.json([]) : Response.json({ ...published, gerenteProjeto: 'Gerente', gerente: { name: 'Gerente', signatureUrl: '/assinatura-gerente.png' } }))
  const { container } = render(<ProjectCharter />)
  await screen.findByDisplayValue('Vigente')
  const assinaturas = container.querySelectorAll('[data-assinatura-em-linha] img')
  expect(assinaturas.length).toBeGreaterThan(0)
  for (const image of assinaturas) expect(image).toHaveAttribute('src', '/assinatura-gerente.png')
})
