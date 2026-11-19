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
  { id: 'a1', nome: 'Visita.mp4', tipo: 'video/mp4', tamanho: 5 * 1024 * 1024, enviadoEm: '2026-11-18T10:00:00.000Z', enviadoPor: 'Ana', enviadoPorAvatar: 'https://minio.operum.adm.br/avatars/ana.png' },
  { id: 'a2', nome: 'Equipe.png', tipo: 'image/png', tamanho: 2048, enviadoEm: '2026-11-17T10:00:00.000Z', enviadoPor: null },
]
const com = (permissoes: Permissao[], ui: ReactNode) => render(<ProjectPermissionsProvider permissions={permissoes}>{ui}</ProjectPermissionsProvider>)

describe('ArquivosProjetoClient — Fotos e Vídeos / Apresentação e Vídeo', () => {
  beforeEach(() => vi.mocked(fetchWithSession).mockReset())

  it('um clique no nome seleciona sem abrir; ações na linha; barra só com seleção', () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null)
    com(['documentos:ver'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    expect(screen.getByRole('heading', { name: 'Fotos e Vídeos' })).toBeInTheDocument()
    expect(screen.getByText('2 arquivos')).toBeInTheDocument()
    const linha = screen.getByText('Visita.mp4').closest('tr') as HTMLElement
    expect(within(linha).queryByRole('link')).toBeNull()
    fireEvent.click(within(linha).getByText('Visita.mp4'))
    expect(linha).toHaveAttribute('aria-selected', 'true')
    expect(abrir).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    abrir.mockRestore()
    expect(within(linha).getByText('5.0 MB')).toBeInTheDocument()
    // Enviado por: foto antes do nome.
    const ana = within(linha).getByText('Ana')
    expect(ana.parentElement?.querySelector('img')).toHaveAttribute('src', 'https://minio.operum.adm.br/avatars/ana.png')
    // Só ver: baixar e estrela na linha; sem renomear, excluir nem enviar.
    expect(within(linha).getByRole('button', { name: 'Baixar Visita.mp4' })).toBeInTheDocument()
    expect(within(linha).getByRole('button', { name: 'Adicionar estrela a Visita.mp4' })).toBeInTheDocument()
    expect(within(linha).queryByRole('button', { name: /Renomear|Excluir/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Enviar/ })).toBeNull()
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('clique na linha seleciona só ela; Ctrl soma; fechar limpa', () => {
    com(['documentos:ver'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    fireEvent.click(screen.getByText('5.0 MB'))
    expect(screen.getByText('1 item selecionado')).toBeInTheDocument()
    expect(screen.getByText('Visita.mp4').closest('tr')).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByText('2.0 KB'), { ctrlKey: true })
    expect(screen.getByText('2 itens selecionados')).toBeInTheDocument()
    fireEvent.click(screen.getByText('2.0 KB'))
    expect(screen.getByText('1 item selecionado')).toBeInTheDocument()
    expect(screen.getByText('Visita.mp4').closest('tr')).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('duplo clique e Enter abrem foto e vídeo no visualizador do Operum, com setas para navegar', () => {
    const novaAba = vi.spyOn(window, 'open').mockReturnValue(null)
    com(['documentos:ver'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    fireEvent.doubleClick(screen.getByText('Visita.mp4'))
    let dialogo = screen.getByRole('dialog', { name: 'Visualizar Visita.mp4' })
    expect(dialogo.querySelector('video')).toHaveAttribute('src', '/api/projects/p1/arquivos/a1')
    expect(within(dialogo).getByText(/1 de 2/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('link', { name: 'Baixar Visita.mp4' })).toHaveAttribute('href', '/api/projects/p1/arquivos/a1?baixar=1')
    expect(within(dialogo).queryByRole('button', { name: 'Anterior' })).toBeNull()
    expect(within(dialogo).queryByRole('button', { name: 'Aumentar zoom' })).toBeNull()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Próximo' }))
    dialogo = screen.getByRole('dialog', { name: 'Visualizar Equipe.png' })
    expect(within(dialogo).getByRole('img', { name: 'Equipe.png' })).toHaveAttribute('src', '/api/projects/p1/arquivos/a2')
    // Zoom só para imagem: + aumenta, o botão do meio volta ao tamanho da tela.
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Aumentar zoom' }))
    expect(within(dialogo).getByRole('img', { name: 'Equipe.png' }).style.transform).toContain('scale(1.25)')
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Zoom 125%/ }))
    expect(within(dialogo).getByRole('img', { name: 'Equipe.png' }).style.transform).toContain('scale(1)')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('dialog', { name: 'Visualizar Visita.mp4' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fechar visualização' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.keyDown(screen.getByText('Equipe.png').closest('tr') as HTMLElement, { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Visualizar Equipe.png' })).toBeInTheDocument()
    expect(novaAba).not.toHaveBeenCalled()
    novaAba.mockRestore()
  })

  it('Shift seleciona o intervalo e exclui em lote depois de confirmar', async () => {
    vi.mocked(fetchWithSession).mockImplementation(async (url, init) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json([]))
    com(['documentos:ver', 'documentos:editar', 'documentos:excluir'], <ArquivosProjetoClient projetoId="p1" categoria="APRESENTACAO" iniciais={arquivos} />)
    expect(screen.getByRole('button', { name: /^Enviar/ })).toBeInTheDocument()
    fireEvent.click(screen.getByText('5.0 MB'))
    fireEvent.click(screen.getByText('2.0 KB'), { shiftKey: true })
    const barra = screen.getByRole('toolbar', { name: 'Ações dos arquivos selecionados' })
    expect(within(barra).getByRole('button', { name: 'Renomear' })).toBeDisabled()
    fireEvent.click(within(barra).getByRole('button', { name: 'Excluir 2 selecionados' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir arquivos' }))
    await waitFor(() => expect(screen.queryByText('Visita.mp4')).toBeNull())
    expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/arquivos/a1', { method: 'DELETE' })
    expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/arquivos/a2', { method: 'DELETE' })
  })

  it('renomeia pela ação da linha e a lista mostra o novo nome', async () => {
    vi.mocked(fetchWithSession).mockResolvedValue(Response.json({ id: 'a2', nome: 'Equipe 2026.png' }))
    com(['documentos:ver', 'documentos:editar'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    fireEvent.click(screen.getByRole('button', { name: 'Renomear Equipe.png' }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Equipe 2026' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Equipe 2026.png')).toBeInTheDocument()
    expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/arquivos/a2', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ nome: 'Equipe 2026' }) }))
  })

  it('estrela muda na hora e volta se o servidor recusar', async () => {
    vi.mocked(fetchWithSession).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(new Response(null, { status: 500 }))
    com(['documentos:ver'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar estrela a Visita.mp4' }))
    expect(await screen.findByRole('button', { name: 'Remover estrela de Visita.mp4' })).toHaveAttribute('aria-pressed', 'true')
    expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/arquivos/a1/favorito', { method: 'PUT' })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar estrela a Equipe.png' }))
    expect(await screen.findByRole('button', { name: 'Adicionar estrela a Equipe.png' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('arrastar arquivos mostra o aviso do Drive e soltar envia (tipo errado vira erro)', async () => {
    com(['documentos:ver', 'documentos:editar'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    const zona = screen.getByText('Visita.mp4').closest('.zona-soltar') as HTMLElement
    const pdf = new File(['x'], 'slides.pdf', { type: 'application/pdf' })
    const dataTransfer = { types: ['Files'], files: [pdf], dropEffect: '' }
    fireEvent.dragEnter(zona, { dataTransfer })
    expect(screen.getByRole('status')).toHaveTextContent('Solte os arquivos para enviar em')
    expect(screen.getByRole('status')).toHaveTextContent('Fotos e Vídeos')
    fireEvent.drop(zona, { dataTransfer })
    expect(screen.queryByText('Solte os arquivos para enviar em')).toBeNull()
    expect(await screen.findByRole('alert')).toHaveTextContent(/Envie fotos/)
  })

  it('quem só vê não tem área de soltar', () => {
    com(['documentos:ver'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={arquivos} />)
    expect(screen.getByText('Visita.mp4').closest('.zona-soltar')).toBeNull()
  })

  it('arquivo de tipo errado não chega a ser enviado e mostra o motivo', async () => {
    com(['documentos:ver', 'documentos:editar'], <ArquivosProjetoClient projetoId="p1" categoria="FOTOS_VIDEOS" iniciais={[]} />)
    const input = screen.getByLabelText('Escolher arquivos para Fotos e Vídeos')
    fireEvent.change(input, { target: { files: [new File(['x'], 'slides.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/Envie fotos/)
    expect(fetchWithSession).not.toHaveBeenCalledWith('/api/projects/p1/arquivos/envio', expect.anything())
  })
})
