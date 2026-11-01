import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DocumentoAtas from '@/components/projetos/documentacao/DocumentoAtas'
import { ProjectPermissionsProvider } from '@/components/permissoes/ProjectPermissions'
import { ToastProvider } from '@/components/ui/Toast'
import type { AtaListItem } from '@/lib/atasLista'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))
const remover = vi.fn(async () => ({ success: true }))
vi.mock('@/app/actions/atas', () => ({ removerAtaAction: (...a: unknown[]) => remover(...(a as [])) }))
vi.mock('@/lib/clientFetch', () => ({
  fetchWithSession: vi.fn(async () => new Response(JSON.stringify({ versions: [{ resourceId: 'a2', status: 'PENDING', createdAt: '2026-10-01T00:00:00Z' }] }), { status: 200 })),
}))

const ata = (over: Partial<AtaListItem>): AtaListItem => ({ id: 'a1', numero: 1, data: '2026-09-14T00:00:00Z', elaboradoPor: 'Ana', local: null, assunto: 'Abertura', presentes: ['Ana'], acoes: 2, acoesVencidas: 0, anexos: 0, ...over })
const atas = [ata({ id: 'a2', numero: 2, assunto: 'Revisão da sprint', acoesVencidas: 1 }), ata({})]

function renderizar(permissoes: string[] = ['documentos:ver', 'documentos:editar', 'documentos:excluir'], lista = atas) {
  return render(<ToastProvider><ProjectPermissionsProvider permissions={permissoes as never}><DocumentoAtas projetoId="p1" atas={lista} gerente={false} /></ProjectPermissionsProvider></ToastProvider>)
}

describe('Documentação > Atas de Reunião', () => {
  beforeEach(() => { remover.mockClear(); refresh.mockClear() })

  it('cada ata mostra assunto, contagens e o status da versão mais recente; aviso de aprovação pendente', async () => {
    renderizar()
    expect(screen.getByText('Revisão da sprint')).toBeInTheDocument()
    expect(screen.getByText('1 com prazo vencido')).toBeInTheDocument()
    expect(await screen.findByText('1 ata aguardando aprovação.')).toBeInTheDocument()
    expect(screen.getAllByText('Sem versão enviada')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Abrir ata 02/ })).toHaveAttribute('href', '/projetos/p1/atas/a2')
    expect(screen.getByRole('link', { name: 'Baixar Word da ata 02' })).toHaveAttribute('href', '/api/atas/a2/export')
  })

  it('"Revisar" e o histórico de uma ata abrem o painel de propostas (só da ata, quando é de uma)', async () => {
    const ouvir = vi.fn()
    window.addEventListener('operum:revisar-propostas', ouvir)
    renderizar()
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Histórico da ata 01' }))
    window.removeEventListener('operum:revisar-propostas', ouvir)
    expect(ouvir.mock.calls.map(c => (c[0] as CustomEvent).detail)).toEqual([{ projetoId: 'p1', resourceId: undefined }, { projetoId: 'p1', resourceId: 'a1' }])
  })

  it('busca e filtro rápido', async () => {
    renderizar()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar atas' }), { target: { value: 'revisao' } })
    expect(screen.getAllByTestId('ata-item')).toHaveLength(1)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar atas' }), { target: { value: 'nada disso' } })
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca e filtros' }))
    fireEvent.click(screen.getByRole('button', { name: 'Com ações vencidas (1)' }))
    expect(screen.getAllByTestId('ata-item')).toHaveLength(1)
    expect(screen.getByText('Revisão da sprint')).toBeInTheDocument()
  })

  it('excluir pede confirmação no modal e só aparece com documentos:excluir', async () => {
    renderizar()
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações da ata 01' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Excluir ata/ }))
    expect(screen.getByText('Excluir a ata 01?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir ata' }))
    await waitFor(() => expect(remover).toHaveBeenCalledWith('a1', 'p1'))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('sem permissão de edição/exclusão: "Nova ata" desabilitada e sem excluir no menu', () => {
    renderizar(['documentos:ver'])
    expect(screen.queryByRole('link', { name: /Nova ata/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações da ata 01' }))
    expect(screen.queryByRole('menuitem', { name: /Excluir/ })).not.toBeInTheDocument()
  })

  it('sem atas: estado vazio com o botão de criar', () => {
    renderizar(undefined, [])
    expect(screen.getByText('Nenhuma ata registrada ainda')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
})
