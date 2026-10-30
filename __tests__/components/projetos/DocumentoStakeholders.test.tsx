import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── next/navigation mock ────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ projetoId: 'p1' })),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

// ── react-to-print — não testamos impressão aqui ────────────────────────────
vi.mock('react-to-print', () => ({
  useReactToPrint: vi.fn(() => vi.fn()),
}))


// ── Server action de criação de membro — não exercitada nestes testes
vi.mock('@/app/actions/membros', () => ({
  criarMembroEquipeAction: vi.fn(),
}))

import DocumentoStakeholders from '@/components/projetos/DocumentoStakeholders'
import { ToastProvider } from '@/components/ui/Toast'

// ── Helpers ─────────────────────────────────────────────────────────────────

// Membros da equipe — responsável/aprovador devem ser membros
const MEMBROS = [
  { id: 'ana', name: 'Ana', setor: null },
  { id: 'joao', name: 'João', setor: null },
]

const MOCK_DOCUMENTO = {
  header: {
    categoria: 'Cat', nomeProjeto: 'Projeto A', gerenteProjeto: 'João',
    elaboradoPor: '', aprovadoPor: '', versao: '1.0',
    dataCriacao: '01/01/2026', dataAprovacao: '', logoUrl: null, signatureUrl: null,
  },
  stakeholders: [],
}

const MOCK_VERSION_APPROVED = {
  id: 'v1', commitTitle: 'Versão inicial', versao: '1.0',
  elaboradoPor: 'Ana', aprovadoPor: 'João', dataAprovacao: '01/05/2026',
  authorId: 'u1', author: { name: 'Ana' },
  status: 'APPROVED', approvedAt: '2026-05-01T00:00:00Z', approvedById: 'g1',
  createdAt: '2026-05-01T00:00:00Z',
}

const MOCK_VERSION_PENDING = {
  id: 'v2', commitTitle: 'Alteração pendente', versao: '1.1',
  elaboradoPor: 'Carlos', aprovadoPor: 'João', dataAprovacao: '02/05/2026',
  authorId: 'u2', author: { name: 'Carlos' },
  status: 'PENDING', approvedAt: null, approvedById: null,
  createdAt: '2026-05-02T00:00:00Z',
}

function makeVersionsResponse(versions = [MOCK_VERSION_APPROVED], isManager = false) {
  return new Response(JSON.stringify(versions), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'x-is-manager': String(isManager),
    },
  })
}

function renderComponent() {
  return render(
    <ToastProvider>
      <DocumentoStakeholders membros={MEMBROS} />
    </ToastProvider>,
  )
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = input.toString()
    if (url.includes('/documento/versions')) {
      return makeVersionsResponse()
    }
    if (url.includes('/documento')) {
      return new Response(JSON.stringify(MOCK_DOCUMENTO), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('{}', { status: 200 })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Testes ───────────────────────────────────────────────────────────────────

describe('DocumentoStakeholders — localStorage', () => {
  it('não chama localStorage.getItem durante a inicialização', async () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem')
    renderComponent()
    await waitFor(() => expect(screen.getAllByTestId('stakeholders-folha').length).toBeGreaterThan(0))
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('não chama localStorage.setItem ao editar campos', async () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderComponent()
    await waitFor(() => expect(screen.getByLabelText('Elaborado por')).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByLabelText('Elaborado por'), 'joao')
    expect(setSpy).not.toHaveBeenCalled()
  })
})

describe('DocumentoStakeholders — carga inicial da versão APPROVED', () => {
  it('popula os campos editáveis com o payload da versão APPROVED mais recente', async () => {
    renderComponent()
    await waitFor(() =>
      expect(screen.getByLabelText('Elaborado por')).toHaveValue('ana'),
    )
    // Aprovador é sempre o gerente: campo automático (sem controle editável).
    const quadros = screen.getAllByTestId('quadro-identificacao')
    expect(quadros[0]).toHaveTextContent('Aprovado por: João')
    expect(screen.queryByLabelText('Aprovado por')).not.toBeInTheDocument()
  })
})

describe('DocumentoStakeholders — responsáveis restritos a membros da equipe', () => {
  it('bloqueia salvar quando o responsável/aprovador não é membro da equipe', async () => {
    const versaoSemMembro = {
      id: 'v1', commitTitle: 'Versão inicial', versao: '1.0',
      elaboradoPor: 'Fulano de Tal', aprovadoPor: 'Ciclano', dataAprovacao: '01/05/2026',
      authorId: 'u1', author: { name: 'Ana' },
      status: 'APPROVED', approvedAt: '2026-05-01T00:00:00Z', approvedById: 'g1',
      createdAt: '2026-05-01T00:00:00Z',
    }
    fetchSpy.mockImplementation(async (input) => {
      const url = input.toString()
      if (url.includes('/documento/versions')) {
        return makeVersionsResponse([versaoSemMembro], true)
      }
      if (url.includes('/documento')) {
        return new Response(JSON.stringify(MOCK_DOCUMENTO), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    renderComponent()

    // Sincroniza com a inicialização a partir da versão APPROVED (que referencia não-membros)
    const histBtn = await screen.findByRole('button', { name: 'Histórico de versões' })
    fireEvent.click(histBtn)
    await screen.findByText('Versão inicial')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))

    // O nome da versão aprovada não resolve para um membro → select sem seleção
    expect(screen.getByLabelText('Elaborado por')).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' }))

    // Modal NÃO abre e exibe notificação de falha
    expect(screen.queryByText('Salvar alteração')).not.toBeInTheDocument()
    expect((await screen.findAllByText(/não é um membro do projeto/)).length).toBeGreaterThan(0)
  })
})

describe('DocumentoStakeholders — fluxo de salvar (commit)', () => {
  it('clicar em "Salvar Versão" abre o modal de título — NÃO dispara fetch direto', async () => {
    renderComponent()
    // Sincroniza com o fim do loadVersions (campos inicializados a partir da
    // versão APPROVED) para que o clique atinja o botão do render mais recente.
    await waitFor(() => expect(screen.getByLabelText('Elaborado por')).toHaveValue('ana'))
    expect(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' })).toBeEnabled()

    const callsBefore = fetchSpy.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' }))

    // Modal de commit deve aparecer
    expect(await screen.findByText('Salvar alteração')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ex: Atualização dos aprovadores')).toBeInTheDocument()

    // Nenhum POST disparado antes de confirmar
    const postCalls = fetchSpy.mock.calls.slice(callsBefore).filter(
      ([, opts]) => (opts as RequestInit)?.method === 'POST',
    )
    expect(postCalls).toHaveLength(0)
  })

  it('confirmar commit com título dispara POST /versions com commitTitle', async () => {
    fetchSpy.mockImplementation(async (input, opts) => {
      const url = input.toString()
      if (url.includes('/documento/versions') && (opts as RequestInit)?.method === 'POST') {
        return new Response(
          JSON.stringify({ ...MOCK_VERSION_APPROVED, commitTitle: 'Meu commit' }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (url.includes('/documento/versions')) return makeVersionsResponse()
      if (url.includes('/documento')) {
        return new Response(JSON.stringify(MOCK_DOCUMENTO), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    renderComponent()
    // Sincroniza com o fim do loadVersions antes de clicar em "Salvar Versão"
    // (evita o clique sobre um botão de um render intermediário).
    await waitFor(() => expect(screen.getByLabelText('Elaborado por')).toHaveValue('ana'))
    expect(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' }))
    await screen.findByText('Salvar alteração')

    const titleInput = screen.getByPlaceholderText('Ex: Atualização dos aprovadores')
    fireEvent.change(titleInput, { target: { value: 'Meu commit' } })
    const confirmBtn = await screen.findByRole('button', { name: /confirmar/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        ([, opts]) => (opts as RequestInit)?.method === 'POST',
      )
      expect(postCall).toBeDefined()
      const body = JSON.parse((postCall![1] as RequestInit).body as string)
      expect(body.commitTitle).toBe('Meu commit')
    })
  })

  it('cancelar o modal não dispara nenhum POST', async () => {
    renderComponent()
    await waitFor(() => expect(screen.getByLabelText('Elaborado por')).toHaveValue('ana'))
    expect(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar versão (Ctrl+S)' }))
    await screen.findByText('Salvar alteração')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    const postCalls = fetchSpy.mock.calls.filter(
      ([, opts]) => (opts as RequestInit)?.method === 'POST',
    )
    expect(postCalls).toHaveLength(0)
  })
})

describe('DocumentoStakeholders — drawer de histórico', () => {
  it('clicar no ícone de histórico abre o drawer', async () => {
    renderComponent()
    const histBtn = await screen.findByRole('button', { name: 'Histórico de versões' })

    fireEvent.click(histBtn)

    expect(await screen.findByRole('dialog', { name: 'Histórico de versões' })).toBeInTheDocument()
    expect(screen.getByLabelText('Buscar no histórico')).toBeInTheDocument()
  })

  it('digitar no campo de busca dispara GET com ?search=', async () => {
    renderComponent()
    const histBtn = await screen.findByRole('button', { name: 'Histórico de versões' })
    fireEvent.click(histBtn)
    const searchInput = await screen.findByLabelText('Buscar no histórico')

    fireEvent.change(searchInput, { target: { value: 'inicial' } })

    await waitFor(() => {
      const searchCall = fetchSpy.mock.calls.find(([url]) =>
        url.toString().includes('search=inicial'),
      )
      expect(searchCall).toBeDefined()
    }, { timeout: 1500 })
  })
})

describe('DocumentoStakeholders — RBAC: botões de aprovação', () => {
  it('oculta botões Aprovar/Rejeitar quando usuário NÃO é gerente', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = input.toString()
      if (url.includes('/documento/versions')) {
        return makeVersionsResponse([MOCK_VERSION_PENDING], false)
      }
      if (url.includes('/documento')) {
        return new Response(JSON.stringify(MOCK_DOCUMENTO), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    renderComponent()
    const histBtn = await screen.findByRole('button', { name: 'Histórico de versões' })
    fireEvent.click(histBtn)

    await screen.findByText('Alteração pendente')
    expect(screen.queryByRole('button', { name: /Aprovar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rejeitar/i })).not.toBeInTheDocument()
  })

  it('exibe botões Aprovar/Rejeitar quando usuário É gerente e versão está PENDING', async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = input.toString()
      if (url.includes('/documento/versions')) {
        return makeVersionsResponse([MOCK_VERSION_PENDING], true)
      }
      if (url.includes('/documento')) {
        return new Response(JSON.stringify(MOCK_DOCUMENTO), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    })

    renderComponent()
    const histBtn = await screen.findByRole('button', { name: 'Histórico de versões' })
    fireEvent.click(histBtn)

    await screen.findByText('Alteração pendente')
    expect(screen.getByRole('button', { name: /Aprovar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rejeitar/i })).toBeInTheDocument()
  })
})
