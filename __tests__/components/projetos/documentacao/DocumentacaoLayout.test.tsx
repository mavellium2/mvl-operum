import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import DocumentacaoLayout from '@/components/projetos/documentacao/DocumentacaoLayout'

vi.mock('@/components/projetos/DocumentoStakeholders', () => ({
  default: () => <div data-testid="stakeholder-doc">Formulário de Partes Interessadas</div>,
}))

vi.mock('@/components/projetos/documentacao/ProjectCharterWrapper', () => ({
  default: () => <div data-testid="charter-doc">Termo de Abertura</div>,
}))

const mockReplace = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() } as unknown as ReturnType<typeof useRouter>)
  vi.mocked(usePathname).mockReturnValue('/projetos/p1/documentacao')
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as ReturnType<typeof useSearchParams>)
})

describe('DocumentacaoLayout', () => {
  it('renderiza o Formulário de Partes Interessadas por padrão', () => {
    render(<DocumentacaoLayout projetoId="p1" atas={[]} gerente={false} />)
    expect(screen.getByTestId('stakeholder-doc')).toBeInTheDocument()
    expect(screen.queryByTestId('charter-doc')).not.toBeInTheDocument()
  })

  it('renderiza o Termo de Abertura quando ?doc=charter', () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams('doc=charter') as ReturnType<typeof useSearchParams>,
    )
    render(<DocumentacaoLayout projetoId="p1" atas={[]} gerente={false} />)
    expect(screen.getByTestId('charter-doc')).toBeInTheDocument()
    expect(screen.queryByTestId('stakeholder-doc')).not.toBeInTheDocument()
  })

  it('não cria outro menu dentro da documentação', () => {
    render(<DocumentacaoLayout projetoId="p1" atas={[]} gerente={false} />)
    expect(screen.queryByRole('navigation', { name: 'Documentos' })).not.toBeInTheDocument()
  })

  it('container principal tem overflow-hidden para isolar o scroll global', () => {
    render(<DocumentacaoLayout projetoId="p1" atas={[]} gerente={false} />)
    const layout = screen.getByTestId('doc-layout')
    expect(layout.className).toMatch(/overflow-hidden/)
  })

  it('área de conteúdo tem overflow-y-auto para scroll isolado do documento', () => {
    render(<DocumentacaoLayout projetoId="p1" atas={[]} gerente={false} />)
    const content = screen.getByTestId('doc-content')
    expect(content.className).toMatch(/overflow-y-auto/)
  })
})
