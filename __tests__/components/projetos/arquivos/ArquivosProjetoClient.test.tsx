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

  it('lista com seleção: nome abre o arquivo e as ações ficam na barra acima, não na linha', () => {
    com(['documentos:ver'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    expect(screen.getByRole('heading', { name: 'Fotos e Vídeos' })).toBeInTheDocument()
    expect(screen.getByText('2 arquivos')).toBeInTheDocument()
    const linha = screen.getByText('Visita.mp4').closest('tr') as HTMLElement
    expect(within(linha).getByRole('link', { name: 'Visita.mp4' })).toHaveAttribute('href', '/api/projects/p1/arquivos/a1')
    expect(within(linha).getByText('5.0 MB')).toBeInTheDocument()
    expect(within(linha).queryByRole('button')).toBeNull()
    // Barra: Baixar fica desabilitado até selecionar; só ver = sem renomear, excluir nem enviar.
    const barra = screen.getByRole('toolbar', { name: 'Ações dos arquivos selecionados' })
    expect(within(barra).getByRole('button', { name: 'Baixar' })).toBeDisabled()
    expect(within(barra).queryByRole('button', { name: /Renomear|Excluir/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Enviar arquivos/ })).toBeNull()
  })

  it('selecionar todos marca as linhas e libera Baixar', () => {
    com(['documentos:ver'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }))
    expect(screen.getByRole('checkbox', { name: 'Selecionar Visita.mp4' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Selecionar Equipe.png' })).toBeChecked()
    expect(screen.getByText('2 de 2 selecionados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar 2 selecionados' })).toBeEnabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }))
    expect(screen.getByRole('checkbox', { name: 'Selecionar Visita.mp4' })).not.toBeChecked()
  })

  it('exclui em lote os selecionados depois de confirmar e a lista recarrega', async () => {
    vi.mocked(fetchWithSession).mockImplementation(async (url, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json([]))
    com(['documentos:ver', 'documentos:editar', 'documentos:excluir'], <ArquivosProjetoClient projetoId="p1" categoria="APRESENTACAO" iniciais={arquivos} />)
    expect(screen.getByRole('button', { name: /Enviar arquivos/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir 2 selecionados' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir arquivos' }))
    await waitFor(() => expect(screen.queryByText('Visita.mp4')).toBeNull())
    expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/arquivos/a1', { method: 'DELETE' })
    expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/arquivos/a2', { method: 'DELETE' })
  })

  it('renomear só com um arquivo selecionado; a lista mostra o novo nome', async () => {
    vi.mocked(fetchWithSession).mockResolvedValue(Response.json({ id: 'a2', nome: 'Equipe 2026.png' }))
    com(['documentos:ver', 'documentos:editar'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    const renomear = screen.getByRole('button', { name: 'Renomear' })
    expect(renomear).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar todos' }))
    expect(renomear).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Visita.mp4' }))
    expect(renomear).toBeEnabled()
    fireEvent.click(renomear)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Equipe 2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Equipe 2026.png')).toBeInTheDocument()
    expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/arquivos/a2', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ nome: 'Equipe 2026' }) }))
  })

  it('arquivo de tipo errado não chega a ser enviado e mostra o motivo', async () => {
    com(['documentos:ver', 'documentos:editar'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={[]} />)
    const input = screen.getByLabelText('Escolher arquivos para Fotos e Vídeos')
    fireEvent.change(input, { target: { files: [new File(['x'], 'slides.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/Envie fotos/)
    expect(fetchWithSession).not.toHaveBeenCalledWith('/api/projects/p1/arquivos/envio', expect.anything())
  })
})
