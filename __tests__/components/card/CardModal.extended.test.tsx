import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProjectPermissionsProvider } from '@/components/permissoes/ProjectPermissions'
import { getCardPlanilhaAction } from '@/app/actions/sprintBoard'
import CardModal from '@/components/card/CardModal'

vi.mock('@/app/actions/tags', () => ({
  assignTagToCardAction: vi.fn().mockResolvedValue({ success: true }),
  removeTagFromCardAction: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/app/actions/time', () => ({
  startTimerAction: vi.fn(),
  pauseTimerAction: vi.fn(),
  getCardTimeAction: vi.fn().mockResolvedValue({ seconds: 0 }),
  getActiveTimerAction: vi.fn().mockResolvedValue({ entry: null }),
  getCardsTimerAction: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map(id => [id, { seconds: 0, entry: null }]))),
  getTimeEntriesAction: vi.fn().mockResolvedValue({ entries: [] }),
  addManualTimeAction: vi.fn().mockResolvedValue({ entry: { id: 'm1' } }),
  updateTimeEntryAction: vi.fn().mockResolvedValue({ entry: { id: 'm1' } }),
  deleteTimeEntryAction: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/app/actions/sprintBoard', () => ({
  getCardMovementsAction: vi.fn().mockResolvedValue({ movements: [] }),
  getCardPlanilhaAction: vi.fn().mockResolvedValue({ linha: null }),
}))

vi.mock('@/app/actions/cardResponsible', () => ({
  addResponsibleAction: vi.fn(),
  removeResponsibleAction: vi.fn(),
  getResponsiblesAction: vi.fn().mockResolvedValue({ responsibles: [] }),
}))

const users = [
  { id: 'u1', name: 'Ana Silva', email: 'ana@x.com' },
  { id: 'u2', name: 'Carlos Souza', email: 'carlos@x.com' },
]

const boardTags = [
  { id: 't1', name: 'Bug', color: '#ef4444' },
  { id: 't2', name: 'Feature', color: '#3b82f6' },
]

const baseCard = {
  id: 'c1',
  title: 'Test Card',
  description: 'Description',
  color: '#3b82f6' as const,
  sprintId: 's1',
  tags: [{ tagId: 't1', tag: { id: 't1', name: 'Bug', color: '#ef4444' } }],
  attachments: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSubmit: vi.fn(),
  initialCard: baseCard,
  users,
  boardTags,
  attachments: [],
  onAttachmentUpload: vi.fn(),
  onAttachmentDelete: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CardModal extended', () => {
  it('renders MultiUserSelector when users prop provided for editing', () => {
    render(<CardModal {...defaultProps} />)
    expect(screen.getByText(/responsáveis/i)).toBeInTheDocument()
  })

  it('renders TagSelector with board tags when boardTags provided', () => {
    render(<CardModal {...defaultProps} />)
    expect(screen.getByText('Bug')).toBeInTheDocument()
    expect(screen.getByText('Feature')).toBeInTheDocument()
  })

  it('renders CardAttachments section when attachments prop provided', () => {
    render(<CardModal {...defaultProps} />)
    expect(screen.getByText('Anexos')).toBeInTheDocument()
  })

  it('calls onSubmit with title, description, and color', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CardModal {...defaultProps} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Card', description: 'Description', color: '#3b82f6' }),
    )
  })

  it('does not include responsibleId or sprintId in onSubmit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CardModal {...defaultProps} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))
    const callArg = onSubmit.mock.calls[0][0]
    expect(callArg).not.toHaveProperty('responsibleId')
    expect(callArg).not.toHaveProperty('sprintId')
  })

  it('shows attachments list when attachments provided', () => {
    const att = [{ id: 'a1', fileName: 'doc.pdf', fileType: 'application/pdf', filePath: '/uploads/c1/a.pdf', fileSize: 100, uploadedAt: Date.now() }]
    render(<CardModal {...defaultProps} attachments={att} />)
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
  })

  it('does not show sprint selector', () => {
    render(<CardModal {...defaultProps} />)
    expect(screen.queryByText(/sprint 1/i)).not.toBeInTheDocument()
  })

  it('shows priority buttons for baixa, media, alta', () => {
    render(<CardModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: /baixa/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /média|media/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /alta/i })).toBeInTheDocument()
  })

  it('onSubmit includes priority field', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CardModal {...defaultProps} initialCard={{ ...baseCard, priority: 'alta' }} onSubmit={onSubmit} />)
    await user.click(screen.getByRole('button', { name: /salvar alterações/i }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 'alta' }),
    )
  })

  it('readOnly renders title as static text and hides editing actions', () => {
    render(<CardModal {...defaultProps} readOnly />)
    expect(screen.getByRole('heading', { name: /test card/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /fechar/i }).length).toBeGreaterThan(0)
  })

  it('readOnly shows responsibles as chips and priority as static badge', () => {
    const card = {
      ...baseCard,
      priority: 'alta',
      responsibles: [{ user: { id: 'u1', name: 'Ana Silva', avatarUrl: null } }],
    }
    render(<CardModal {...defaultProps} readOnly initialCard={card} />)
    expect(screen.getByText('Ana Silva')).toBeInTheDocument()
    expect(screen.getByText(/alta/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /baixa/i })).not.toBeInTheDocument()
  })

  it('readOnly hides comment composer', () => {
    render(<CardModal {...defaultProps} readOnly />)
    expect(screen.queryByPlaceholderText(/escreva um comentário/i)).not.toBeInTheDocument()
  })

  describe('autosave da descrição', () => {
    it('fechar pelo X logo após digitar grava a descrição (não perde o texto)', async () => {
      const onPatch = vi.fn().mockResolvedValue(undefined)
      const onClose = vi.fn()
      render(<CardModal {...defaultProps} onClose={onClose} onPatch={onPatch} />)
      await userEvent.click(screen.getByText('Description'))
      const textarea = screen.getByPlaceholderText('Adicione detalhes, critérios de aceite...')
      await userEvent.clear(textarea)
      await userEvent.type(textarea, 'Texto novo')
      await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
      expect(onPatch).toHaveBeenCalledWith({ description: 'Texto novo' })
      expect(onClose).toHaveBeenCalled()
    })

    it('sem onPatch mantém o fluxo antigo (Salvar/Cancelar)', async () => {
      render(<CardModal {...defaultProps} />)
      await userEvent.click(screen.getByText('Description'))
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    })

    it('mostra "Salvo" depois do autosave', async () => {
      const onPatch = vi.fn().mockResolvedValue(undefined)
      render(<CardModal {...defaultProps} onPatch={onPatch} />)
      await userEvent.click(screen.getByText('Description'))
      const textarea = screen.getByPlaceholderText('Adicione detalhes, critérios de aceite...')
      await userEvent.type(textarea, '!')
      await userEvent.tab()
      expect(await screen.findByText('Salvo')).toBeInTheDocument()
      expect(onPatch).toHaveBeenCalledWith({ description: 'Description!' })
    })
  })

  describe('datas do card', () => {
    it('definir o prazo grava pelo onPatch ao sair do campo', async () => {
      const onPatch = vi.fn().mockResolvedValue(undefined)
      render(<CardModal {...defaultProps} onPatch={onPatch} />)
      const prazo = screen.getByLabelText('Prazo (entrega)')
      await userEvent.type(prazo, '2026-09-30T23:59')
      await userEvent.tab()
      expect(onPatch).toHaveBeenCalledWith({ startDate: null, endDate: new Date('2026-09-30T23:59').toISOString() })
    })

    it('remover o prazo envia null', async () => {
      const onPatch = vi.fn().mockResolvedValue(undefined)
      const card = { ...baseCard, endDate: new Date('2026-09-30T23:59') }
      render(<CardModal {...defaultProps} initialCard={card} onPatch={onPatch} />)
      await userEvent.click(screen.getByRole('button', { name: 'Remover prazo (entrega)' }))
      await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
      expect(onPatch).toHaveBeenCalledWith({ startDate: null, endDate: null })
    })

    it('prazo antes do início mostra erro e não salva', async () => {
      const onPatch = vi.fn().mockResolvedValue(undefined)
      const card = { ...baseCard, startDate: new Date('2026-09-30T10:00') }
      render(<CardModal {...defaultProps} initialCard={card} onPatch={onPatch} />)
      await userEvent.type(screen.getByLabelText('Prazo (entrega)'), '2026-09-29T10:00')
      await userEvent.tab()
      expect(screen.getByRole('alert')).toHaveTextContent('O prazo não pode ser antes do início.')
      expect(onPatch).not.toHaveBeenCalledWith(expect.objectContaining({ endDate: expect.any(String) }))
    })

    it('na criação, as datas vão junto do onSubmit', async () => {
      const onSubmit = vi.fn()
      render(<CardModal {...defaultProps} initialCard={undefined} onSubmit={onSubmit} />)
      await userEvent.type(screen.getByPlaceholderText('Título da tarefa...'), 'Novo')
      await userEvent.type(screen.getByLabelText('Prazo (entrega)'), '2026-10-01T09:00')
      await userEvent.click(screen.getByRole('button', { name: /^(Salvar|Criar)/ }))
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Novo',
        endDate: new Date('2026-10-01T09:00').toISOString(),
        startDate: null,
      }))
    })
  })
})

describe('CardModal — anexos', () => {
  it('recusa arquivo de tipo não aceito sem chamar o upload', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const onAttachmentUpload = vi.fn()
    render(<CardModal {...defaultProps} onAttachmentUpload={onAttachmentUpload} />)
    await user.upload(screen.getByTestId('card-anexo-input'), new File(['x'], 'setup.exe', { type: 'application/x-msdownload' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Tipo de arquivo não aceito \(\.exe\)/)
    expect(onAttachmentUpload).not.toHaveBeenCalled()
  })

  it('recusa vídeo acima do limite antes de enviar', async () => {
    const user = userEvent.setup()
    const onAttachmentUpload = vi.fn()
    render(<CardModal {...defaultProps} onAttachmentUpload={onAttachmentUpload} />)
    const video = new File(['x'], 'longo.mp4', { type: 'video/mp4' })
    Object.defineProperty(video, 'size', { value: 60 * 1024 * 1024 })
    await user.upload(screen.getByTestId('card-anexo-input'), video)
    expect(screen.getByRole('alert')).toHaveTextContent('"longo.mp4" tem 60,0 MB. O limite é 50 MB.')
    expect(onAttachmentUpload).not.toHaveBeenCalled()
  })

  it('envia vídeo e mostra "Enviando…" até o upload terminar', async () => {
    const user = userEvent.setup()
    let terminar!: () => void
    const onAttachmentUpload = vi.fn(() => new Promise<void>(resolve => { terminar = resolve }))
    render(<CardModal {...defaultProps} onAttachmentUpload={onAttachmentUpload} />)
    const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    await user.upload(screen.getByTestId('card-anexo-input'), video)
    expect(onAttachmentUpload).toHaveBeenCalledWith(video)
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled()
    await act(async () => { terminar() })
    expect(screen.getByRole('button', { name: '+ Adicionar' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('no card novo, o vídeo fica na lista para subir ao salvar', async () => {
    const user = userEvent.setup()
    render(<CardModal {...defaultProps} initialCard={undefined} />)
    await user.upload(screen.getByTestId('card-anexo-input'), new File(['x'], 'clip.mov', { type: '' }))
    expect(screen.getByText('clip.mov')).toBeInTheDocument()
  })
})

describe('CardModal — anexo de link', () => {
  const link = (filePath: string) => ({
    id: 'l1', fileName: 'Aula da EAP', fileType: 'text/uri-list', filePath, fileSize: 0, uploadedAt: Date.now(),
  })

  it('vídeo do YouTube: miniatura, link que abre em outra aba e o host no lugar do tamanho', () => {
    render(<CardModal {...defaultProps} attachments={[link('https://www.youtube.com/watch?v=dQw4w9WgXcQ')]} />)
    const a = screen.getByRole('link', { name: 'Aula da EAP' })
    expect(a).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByTestId('anexo-link-miniatura')).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg')
    expect(screen.getByText('youtube.com')).toBeInTheDocument()
    expect(screen.queryByText('0 B')).not.toBeInTheDocument()
  })

  it('link com esquema perigoso não vira href', () => {
    render(<CardModal {...defaultProps} attachments={[link('javascript:alert(1)')]} />)
    expect(screen.queryByRole('link', { name: 'Aula da EAP' })).not.toBeInTheDocument()
    expect(screen.getByText('Aula da EAP')).toBeInTheDocument()
    expect(screen.queryByTestId('anexo-link-miniatura')).not.toBeInTheDocument()
  })
})

describe('CardModal — abrir anexo de arquivo (SDD 4.2)', () => {
  const arquivo = (id: string, fileName: string, fileType: string) => ({
    id, fileName, fileType, filePath: `https://storage/operum/uploads/c1/${id}`, fileSize: 1024, uploadedAt: Date.now(),
  })

  it('PDF: o nome é um link para a rota de download (abre no primeiro clique, sem window.open)', () => {
    const open = vi.spyOn(window, 'open')
    render(<CardModal {...defaultProps} attachments={[arquivo('a1', 'ata.pdf', 'application/pdf')]} />)
    const link = screen.getByRole('link', { name: 'ata.pdf' })
    expect(link).toHaveAttribute('href', '/api/files/a1/download?cardId=c1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Abrir ata.pdf' })).toHaveAttribute('href', '/api/files/a1/download?cardId=c1')
    expect(open).not.toHaveBeenCalled()
  })

  it('imagem: abre no lightbox, com link para nova aba; Esc fecha só o lightbox', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CardModal {...defaultProps} onClose={onClose} attachments={[arquivo('a2', 'eap-menu-organizar.jpg', 'image/jpeg')]} />)

    await user.click(screen.getByRole('button', { name: 'eap-menu-organizar.jpg' }))
    const lightbox = screen.getByRole('dialog', { name: 'Visualizar eap-menu-organizar.jpg' })
    expect(lightbox.querySelector('img')).toHaveAttribute('src', '/api/files/a2/image')
    expect(screen.getByRole('link', { name: 'Abrir em nova aba' })).toHaveAttribute('href', '/api/files/a2/download?cardId=c1')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /Visualizar/ })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Anexos')).toBeInTheDocument()
  })

  it('botão de fechar do lightbox', async () => {
    const user = userEvent.setup()
    render(<CardModal {...defaultProps} attachments={[arquivo('a2', 'foto.png', 'image/png')]} />)
    await user.click(screen.getByRole('button', { name: 'Ver foto.png' }))
    await user.click(screen.getByRole('button', { name: 'Fechar visualização' }))
    expect(screen.queryByRole('dialog', { name: /Visualizar/ })).not.toBeInTheDocument()
  })
})

describe('CardModal — campo de renomear anexo legível (SDD 4.8)', () => {
  it('tem cor de texto e fundo próprios (não herda a cor do body) e foco visível', async () => {
    const user = userEvent.setup()
    const onAttachmentRename = vi.fn()
    render(
      <CardModal
        {...defaultProps}
        onAttachmentRename={onAttachmentRename}
        attachments={[{ id: 'a1', fileName: 'ata.pdf', fileType: 'application/pdf', filePath: '/x', fileSize: 10, uploadedAt: Date.now() }]}
      />,
    )
    await user.click(screen.getByTitle('Renomear'))
    const campo = screen.getByRole('textbox', { name: 'Novo nome do anexo' })
    expect(campo).toHaveValue('ata.pdf')
    expect(campo.className).toMatch(/\btext-slate-900\b/)
    expect(campo.className).toMatch(/\bbg-white\b/)
    expect(campo.className).toMatch(/\bfocus:ring-2\b/)
  })
})


describe('permissões do card no projeto', () => {
  it('leitor abre o conteúdo, mas não edita nem salva', async () => {
    await act(async () => {
      render(<ProjectPermissionsProvider permissions={['projeto:ver', 'quadro:ver']}><CardModal {...defaultProps} /></ProjectPermissionsProvider>)
    })
    expect(screen.getByRole('heading', { name: 'Test Card' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Título da tarefa...')).not.toBeInTheDocument()
    expect(defaultProps.onSubmit).not.toHaveBeenCalled()
  })
  it('edição concedida reabilita o formulário', async () => {
    await act(async () => {
      render(<ProjectPermissionsProvider permissions={['projeto:ver', 'quadro:ver', 'quadro:cards']}><CardModal {...defaultProps} /></ProjectPermissionsProvider>)
    })
    expect(screen.getByPlaceholderText('Título da tarefa...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
  })
})


it('mostra os dados vinculados da planilha e respeita a permissão financeira', async () => {
  vi.mocked(getCardPlanilhaAction).mockResolvedValueOnce({ linha: { codigo: '1.1.1', elaboradoPor: 'Ana', minOrcado: 15, minReal: 10, totalOrcado: 303.38, totalReal: 252.75, dataPrevista: '2026-10-15', dataRealizacao: '2026-10-15' } } as never)
  const view = render(<CardModal {...defaultProps} />)
  expect(await screen.findByRole('region', { name: 'Planilha de Custos' })).toHaveTextContent('1.1.1')
  expect(screen.getByRole('region', { name: 'Planilha de Custos' })).toHaveTextContent('15/10/2026')
  expect(screen.getByRole('region', { name: 'Planilha de Custos' })).toHaveTextContent('303,38')
  view.unmount()
  vi.mocked(getCardPlanilhaAction).mockClear()
  render(<ProjectPermissionsProvider permissions={['quadro:ver']}><CardModal {...defaultProps} /></ProjectPermissionsProvider>)
  expect(getCardPlanilhaAction).not.toHaveBeenCalled()
  expect(screen.queryByRole('region', { name: 'Planilha de Custos' })).not.toBeInTheDocument()
})
