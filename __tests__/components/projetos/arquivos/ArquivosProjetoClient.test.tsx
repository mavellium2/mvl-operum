import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ProjectPermissionsProvider } from '@/components/permissoes/ProjectPermissions'
import type { Permissao } from '@/lib/permissoes'

vi.mock('@/lib/clientFetch', () => ({ fetchWithSession: vi.fn() }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
import { fetchWithSession } from '@/lib/clientFetch'
import ArquivosProjetoClient from '@/components/projetos/arquivos/ArquivosProjetoClient'

const arquivos = [
  { id: 'a1', nome: 'Visita.mp4', tipo: 'video/mp4', tamanho: 5 * 1024 * 1024, enviadoEm: '2026-11-18T10:00:00.000Z', enviadoPor: 'Ana' },
  { id: 'a2', nome: 'Equipe.png', tipo: 'image/png', tamanho: 2048, enviadoEm: '2026-11-17T10:00:00.000Z', enviadoPor: null },
]
const com = (permissoes: Permissao[], ui: ReactNode) => render(<ProjectPermissionsProvider permissions={permissoes}>{ui}</ProjectPermissionsProvider>)

describe('ArquivosProjetoClient — Fotos e Vídeos / Apresentação e Vídeo', () => {
  beforeEach(() => vi.mocked(fetchWithSession).mockReset())

  it('lista na base do menu Arquivos, com Ver e Baixar pela rota que confere a sessão', () => {
    com(['documentos:ver'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    expect(screen.getByRole('heading', { name: 'Fotos e Vídeos' })).toBeInTheDocument()
    expect(screen.getByText('2 arquivos')).toBeInTheDocument()
    const linha = screen.getByText('Visita.mp4').closest('tr') as HTMLElement
    expect(within(linha).getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/api/projects/p1/arquivos/a1')
    expect(within(linha).getByRole('link', { name: 'Baixar' })).toHaveAttribute('href', '/api/projects/p1/arquivos/a1?baixar=1')
    expect(within(linha).getByText('5.0 MB')).toBeInTheDocument()
    // Só ver: sem enviar nem excluir.
    expect(screen.queryByRole('button', { name: /Enviar arquivos/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull()
  })

  it('quem pode excluir confirma e a lista recarrega', async () => {
    vi.mocked(fetchWithSession).mockImplementation(async (url, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json([arquivos[1]]))
    com(['documentos:ver', 'documentos:editar', 'documentos:excluir'], <ArquivosProjetoClient projetoId="p1" categoria="APRESENTACAO" iniciais={arquivos} />)
    expect(screen.getByRole('button', { name: /Enviar arquivos/ })).toBeInTheDocument()
    fireEvent.click(within(screen.getByText('Visita.mp4').closest('tr') as HTMLElement).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir arquivo' }))
    await waitFor(() => expect(screen.queryByText('Visita.mp4')).toBeNull())
    expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/arquivos/a1', { method: 'DELETE' })
  })

  it('arquivo de tipo errado não chega a ser enviado e mostra o motivo', async () => {
    com(['documentos:ver', 'documentos:editar'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={[]} />)
    const input = screen.getByLabelText('Escolher arquivos para Fotos e Vídeos')
    fireEvent.change(input, { target: { files: [new File(['x'], 'slides.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/Envie fotos/)
    expect(fetchWithSession).not.toHaveBeenCalledWith('/api/projects/p1/arquivos/envio', expect.anything())
  })
})
