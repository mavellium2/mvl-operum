import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react'
import { updateNodePropertiesAction, renameNodeAction, moveNodeAction, insertChildAction, insertSiblingAction, deleteNodeAction } from '@/app/actions/wbs'
import { excluirFaseAction } from '@/app/actions/projetoEdicao'
import { patchCardAction } from '@/app/actions/sprintBoard'
import PlanilhaCustosView, { parseMoeda } from '@/components/custos/PlanilhaCustosView'
import { ToastProvider } from '@/components/ui/Toast'
import type { PlanilhaDeCustos, Elaborador } from '@/lib/planilhaCustos'

vi.mock('@/app/actions/planilhaHistorico', () => ({ salvarHistoricoPlanilhaAction: vi.fn().mockResolvedValue({ numero: 2 }), listarHistoricoPlanilhaAction: vi.fn().mockResolvedValue([]) }))
vi.mock('@/app/actions/sincronizacao', () => ({ repetirSincronizacaoAction: vi.fn().mockResolvedValue({ status: {} }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/app/actions/wbs', () => ({
  updateNodePropertiesAction: vi.fn().mockResolvedValue({ ok: true }),
  insertChildAction: vi.fn(),
  insertSiblingAction: vi.fn(),
  renameNodeAction: vi.fn(),
  moveNodeAction: vi.fn(),
  deleteNodeAction: vi.fn(),
}))
vi.mock('@/app/actions/projetos', () => ({
  addMemberAction: vi.fn(),
}))
vi.mock('@/app/actions/sprintBoard', () => ({ getActivityCardAction: vi.fn().mockResolvedValue({ cardId: 'c1' }), patchActivityDescriptionAction: vi.fn().mockResolvedValue({}), patchActivityPriorityAction: vi.fn().mockResolvedValue({}), patchCardAction: vi.fn().mockResolvedValue({ card: { id: 'c1' } }) }))
vi.mock('@/app/actions/time', () => ({
  getCardTimeAction: vi.fn(),
  getCardsTimerAction: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map(id => [id, { seconds: 0, entry: null }]))),
  pauseTimerAction: vi.fn(),
  startTimerAction: vi.fn(),
  addManualTimeAction: vi.fn(),
  getTimeEntriesAction: vi.fn().mockResolvedValue({ entries: [] }),
  updateTimeEntryAction: vi.fn(),
  deleteTimeEntryAction: vi.fn(),
}))
vi.mock('@/app/actions/attachments', () => ({
  listCardAttachmentsAction: vi.fn().mockResolvedValue({ attachments: [] }),
  deleteAttachmentAction: vi.fn(),
  renameAttachmentAction: vi.fn(),
}))
vi.mock('@/app/actions/comentarios', () => ({
  getCommentsAction: vi.fn().mockResolvedValue({ comments: [] }),
  createCommentAction: vi.fn(),
  updateCommentAction: vi.fn(),
  deleteCommentAction: vi.fn(),
}))
vi.mock('@/app/actions/tags', () => ({
  assignTagToCardAction: vi.fn(),
  removeTagFromCardAction: vi.fn(),
}))
vi.mock('@/app/actions/projetoEdicao', () => ({
  impactoExclusaoFaseAction: vi.fn().mockResolvedValue({
    impacto: { itensEap: 1, tarefas: 1, sprints: [], orcado: 90, realizado: 0, orcamentoCronograma: 0, exigeMotivo: false },
  }),
  excluirFaseAction: vi.fn().mockResolvedValue({ ok: true }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateNodePropertiesAction).mockResolvedValue({ ok: true, serverVersion: 2 })
  vi.mocked(renameNodeAction).mockResolvedValue({ ok: true, serverVersion: 2 })
  vi.mocked(moveNodeAction).mockResolvedValue({ ok: true, serverVersion: 2 })
  vi.mocked(insertChildAction).mockResolvedValue({ ok: true, nodeId: 'mf-criada', serverVersion: 2 })
  vi.mocked(insertSiblingAction).mockResolvedValue({ ok: true, nodeId: 'atividade-real', serverVersion: 2 })
  vi.mocked(deleteNodeAction).mockResolvedValue({ ok: true, serverVersion: 2 })
})

const elaboradores: Elaborador[] = [
  // 14400 / 30 / 8 / 60 = R$ 1,00 por minuto
  { userId: 'u1', name: 'Maria', remuneracao: 14400, horasDiarias: 8 },
]

const planilha: PlanilhaDeCustos = {
  config: { valorReferencia: 4000, horasPorDia: 8 },
  macrofases: [
    {
      nodeId: 'mf1', codigo: '1.1', titulo: 'Fase 1',
      atividades: [
        {
          nodeId: 'a1', codigo: '1.1.1', titulo: 'Atividade 1',
          descricao: 'Levantar os requisitos\ncom o cliente',
          elaboradoPor: 'Maria', elaboradoPorUserId: 'u1', elaboradoPorUserIds: ['u1'],
          vpm: 1, jornadaDiaria: 8,
          minOrcado: 90, materiaisOrcado: 0, dataPrevista: null,
          rOrcado: 90, totalOrcado: 90,
          minReal: 0, minRealDigitado: 0, minRealApontado: 0, materiaisReal: 0, dataRealizacao: null,
          rReal: 0, totalReal: 0,
          situacao: 'Pendente',
        },
      ],
      minOrcado: 90, materiaisOrcado: 0, totalOrcado: 90,
      minReal: 0, materiaisReal: 0, totalReal: 0,
      dataFim: null,
    },
  ],
  qtdeAtividades: 1,
  totalOrcado: 90,
  totalReal: 0,
  tempoOrcadoTotal: 90,
  tempoRealTotal: 0,
  dataFimProjeto: null,
  quadros: {
    valor: [{ fase: '1.1', orcado: 90, realizado: 0 }],
    tempo: [{ fase: '1.1', minOrcado: 90, minReal: 0 }],
    elaboradores: [{ elaborador: 'Maria', qtdeAtividades: 1, percentual: 100 }],
  },
}

const props = {
  projetoId: 'p1',
  nomeProjeto: 'Projeto Teste',
  inicioProjeto: '01/01/2026',
  fimProjeto: '01/03/2026',
  canEdit: true,
  canEditAllActual: true,
  planilha,
  elaboradores,
  usuariosDisponiveis: [],
  exportUrl: '/api/export?p=p1',
}

function renderizar() {
  return render(
    <ToastProvider>
      <PlanilhaCustosView {...props} />
    </ToastProvider>
  )
}

describe('PlanilhaCustosView — edição Min/Horas/Dias', () => {
  it('digitar em Horas não corta: mantém o texto bruto e converte ao vivo', () => {
    renderizar()
    const horas = screen.getByDisplayValue('1:30') // hhmm(90)
    const min = screen.getByDisplayValue('90')

    fireEvent.focus(horas)
    fireEvent.change(horas, { target: { value: '2' } })
    expect(horas).toHaveValue('2') // texto bruto, NÃO vira "2:00"
    expect(min).toHaveValue('120') // conversão ao vivo em minutos

    fireEvent.change(horas, { target: { value: '2.' } })
    expect(horas).toHaveValue('2.') // o "." não é cortado pela re-derivação

    fireEvent.change(horas, { target: { value: '2.5' } })
    expect(horas).toHaveValue('2.5')
    expect(min).toHaveValue('150')

    fireEvent.blur(horas)
    expect(horas).toHaveValue('2:30') // normaliza para hh:mm após sair do campo
    expect(min).toHaveValue('150')
  })

  it('digitar em Horas aceita h:mm e atualiza Min', () => {
    renderizar()
    const horas = screen.getByDisplayValue('1:30')

    fireEvent.focus(horas)
    fireEvent.change(horas, { target: { value: '5:' } })
    expect(horas).toHaveValue('5:') // parcial inválida não quebra o texto
    fireEvent.change(horas, { target: { value: '5:3' } })
    fireEvent.change(horas, { target: { value: '5:30' } })
    expect(horas).toHaveValue('5:30')
    expect(screen.getByDisplayValue('330')).toBeInTheDocument()
  })

  it('digitar em Dias converte para Min e Horas (usando a jornada da linha)', () => {
    renderizar()
    const dias = screen.getByDisplayValue('0,19') // dois(90/60/8)

    fireEvent.focus(dias)
    fireEvent.change(dias, { target: { value: '1' } })
    expect(dias).toHaveValue('1') // texto bruto, NÃO vira "1,00"
    expect(screen.getByDisplayValue('480')).toBeInTheDocument()
    expect(screen.getByDisplayValue('8:00')).toBeInTheDocument()

    fireEvent.change(dias, { target: { value: '1.5' } })
    expect(dias).toHaveValue('1.5')
    expect(screen.getByDisplayValue('720')).toBeInTheDocument()

    fireEvent.blur(dias)
    expect(dias).toHaveValue('1,50')
    expect(screen.getByDisplayValue('720')).toBeInTheDocument()
  })

  it('digitação permanece em rascunho até clicar em Salvar', async () => {
    vi.useFakeTimers()
    try {
      renderizar()
      const horas = screen.getByDisplayValue('1:30')

      fireEvent.focus(horas)
      fireEvent.change(horas, { target: { value: '2.' } })
      expect(horas).toHaveValue('2.')

      // A passagem do tempo não grava os campos automaticamente.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100)
      })

      expect(updateNodePropertiesAction).not.toHaveBeenCalled()
      expect(horas).toHaveValue('2.')
      expect(screen.getByDisplayValue('120')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sub-total acompanha a edição ainda não salva (rascunho) em Min/Total', () => {
    renderizar()
    const sub = screen.getByText('Sub-total').closest('tr')!

    // estado inicial (vpm=1, jornada 8): min 90 → 1:30h, 0,19d, R$ 90,00
    expect(sub).toHaveTextContent('90')
    expect(sub).toHaveTextContent('1:30')
    expect(sub).toHaveTextContent('0,19')
    expect(sub).toHaveTextContent('R$ 90,00')

    // edita Min na linha (90 → 120): sub-total reflete na hora, sem salvar
    fireEvent.change(screen.getByDisplayValue('90'), { target: { value: '120' } })
    expect(sub).toHaveTextContent('120')
    expect(sub).toHaveTextContent('2:00')
    expect(sub).toHaveTextContent('0,25')
    expect(sub).toHaveTextContent('R$ 120,00')
  })

  it('sub-total mostra "—" quando nenhuma linha da fase tem elaborador/jornada', () => {
    const semElaborador: PlanilhaDeCustos = {
      ...planilha,
      macrofases: [
        {
          ...planilha.macrofases[0],
          atividades: [
            {
              ...planilha.macrofases[0].atividades[0],
              elaboradoPor: '', elaboradoPorUserId: null, elaboradoPorUserIds: [], vpm: null, jornadaDiaria: null,
              rOrcado: null, totalOrcado: null, rReal: null, totalReal: null,
            },
          ],
        },
      ],
      totalOrcado: 0,
      totalReal: 0,
      quadros: { valor: [{ fase: '1.1', orcado: 0, realizado: 0 }], tempo: planilha.quadros.tempo, elaboradores: [] },
    }
    render(
      <ToastProvider>
        <PlanilhaCustosView {...props} planilha={semElaborador} />
      </ToastProvider>
    )

    const sub = screen.getByText('Sub-total').closest('tr')!
    // dias e R$/Total sem valor → "—" (nenhum), mas Min/Horas continuam somando
    expect(sub).toHaveTextContent('90')
    expect(sub).toHaveTextContent('1:30')
    expect(sub).toHaveTextContent('—')
  })
})

describe('PlanilhaCustosView — ajustes de 19/10', () => {
  it('R$ mostra o valor do minuto do elaborador, não Min × valor', () => {
    renderizar()
    const linha = screen.getByText('1.1.1 Atividade 1').closest('tr')!
    expect(linha).toHaveTextContent('R$ 1,00')
    expect(linha.querySelector('[title^="Valor do minuto"]')).not.toBeNull()
  })

  it('Materiais formatado em R$ e Total = (Min × R$) + Materiais, ao vivo', () => {
    renderizar()
    const [materiais] = screen.getAllByLabelText('Materiais orçados')
    const valor = () => (materiais as HTMLInputElement).value.replace(/\s/g, ' ')
    expect(valor()).toBe('R$ 0,00')
    fireEvent.focus(materiais)
    fireEvent.change(materiais, { target: { value: '300,00' } })
    fireEvent.blur(materiais)
    expect(valor()).toBe('R$ 300,00')
    const linha = screen.getByText('1.1.1 Atividade 1').closest('tr')!
    expect(linha).toHaveTextContent('R$ 390,00') // 90 × 1 + 300
  })

  it('Sub-total só com o rótulo, à direita, somando Materiais orçado e realizado', () => {
    renderizar()
    const rotulo = screen.getByText('Sub-total')
    expect(rotulo).toHaveClass('text-right')
    const [materiais] = screen.getAllByLabelText('Materiais orçados')
    // Máscara com centavos à direita: "5000" vira R$ 50,00.
    fireEvent.change(materiais, { target: { value: '5000' } })
    const sub = rotulo.closest('tr')!
    expect(sub).toHaveTextContent('R$ 50,00')
    expect(sub).toHaveTextContent('R$ 140,00')
  })

  it('linha de Total do projeto soma os sub-totais', () => {
    renderizar()
    const total = screen.getByText('Total do projeto').closest('tr')!
    expect(total).toHaveTextContent('90')
    expect(total).toHaveTextContent('R$ 90,00')
  })

  it('ações de inserir/excluir linha só com permissão de mudar a EAP', async () => {
    const { unmount } = renderizar()
    expect(screen.queryByRole('button', { name: /Adicionar atividade abaixo/ })).toBeNull()
    unmount()
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar atividade abaixo de 1.1.1 Atividade 1' }))
    expect(screen.getByRole('textbox', { name: 'Renomear 1.1.2' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Excluir atividade 1.1.1 Atividade 1' })).toBeInTheDocument()
  })

  it('editar o nome no painel guarda rascunho e Salvar sincroniza pela ação da EAP', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes de 1.1.1 Atividade 1' }))
    const painel = screen.getByRole('region', { name: 'Detalhes de 1.1.1 Atividade 1' })
    fireEvent.click(within(painel).getByRole('button', { name: 'Renomear 1.1.1 Atividade 1' }))
    const campo = within(painel).getByRole('textbox', { name: 'Renomear 1.1.1' })
    fireEvent.change(campo, { target: { value: 'Nova atividade' } })
    fireEvent.blur(campo)
    expect(within(painel).getByText('1.1.1 Nova atividade')).toBeInTheDocument()
    expect(screen.getAllByText('1.1.1 Nova atividade').length).toBeGreaterThan(0)
    expect(renameNodeAction).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /1 alterações não salvas/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(renameNodeAction).toHaveBeenCalledWith('p1', 'a1', 'Nova atividade'))
  })

  it('arrastar atividade mostra rascunho e só move na EAP ao salvar', async () => {
    const outraFase = { ...planilha.macrofases[0], nodeId: 'mf2', codigo: '1.2', titulo: 'Fase 2', atividades: [] }
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas planilha={{ ...planilha, macrofases: [...planilha.macrofases, outraFase] }} /></ToastProvider>)
    const dataTransfer = { effectAllowed: 'move', setData: vi.fn() }
    fireEvent.dragStart(screen.getByTitle('Arrastar 1.1.1 Atividade 1'), { dataTransfer })
    const destino = screen.getByRole('button', { name: 'Renomear 1.2 Fase 2' }).closest('tr')!
    fireEvent.dragOver(destino)
    fireEvent.drop(destino)
    expect(moveNodeAction).not.toHaveBeenCalled()
    expect(within(destino).getByText('1.2 Fase 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(moveNodeAction).toHaveBeenCalledWith('p1', { nodeId: 'a1', targetId: 'mf2', position: 'INSIDE' }))
  })

  it('coluna Atividades tem largura limitada e mostra o nome completo ao passar o mouse', () => {
    const longo = 'Levantar todos os requisitos '.repeat(20).trim()
    const fase = planilha.macrofases[0]
    render(<ToastProvider><PlanilhaCustosView {...props} planilha={{ ...planilha, macrofases: [{ ...fase, atividades: [{ ...fase.atividades[0], titulo: longo, descricao: '' }] }] }} /></ToastProvider>)
    const nome = screen.getByText(`1.1.1 ${longo}`)
    expect(nome).toHaveClass('planilha-node-label')
    expect(nome).toHaveAttribute('title', `1.1.1 ${longo}`)
    expect(nome.closest('td')).toHaveClass('planilha-activity-name')
    expect(nome.closest('td')).not.toHaveClass('whitespace-nowrap')
    expect(screen.getByRole('columnheader', { name: 'Atividades' })).toHaveClass('planilha-activity-name')
  })

  it('título da macrofase fica antes dos controles de arrastar e ações', () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    const linha = screen.getByRole('button', { name: 'Renomear 1.1 Fase 1' }).closest('tr')!
    const botoes = within(linha).getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.getAttribute('title'))
    expect(botoes.indexOf('Renomear 1.1 Fase 1')).toBeLessThan(botoes.indexOf('Adicionar tarefa à macrofase Fase 1'))
  })

  const comCard = (descricao = 'Usar tinta acrílica') => {
    const fase = planilha.macrofases[0]
    return { ...planilha, macrofases: [{ ...fase, atividades: [{ ...fase.atividades[0], descricao, card: { id: 'c1', sprintId: 's1', etapa: 'Em andamento' } }] }] }
  }

  it('atividade ligada a um card não mostra timer na tabela', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} planilha={comCard()} canUsarCards /></ToastProvider>)
    expect(screen.queryByRole('button', { name: 'Iniciar timer' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Detalhes de 1.1.1 Atividade 1' })).toBeInTheDocument()
  })

  it('atividade sem card não mostra o play/stop', () => {
    renderizar()
    expect(screen.queryByRole('button', { name: 'Iniciar timer' })).toBeNull()
  })

  it('painel de detalhes mostra a descrição do card e salva pelo card da sprint', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} planilha={comCard()} canUsarCards /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes de 1.1.1 Atividade 1' }))
    const painel = screen.getByRole('region', { name: 'Detalhes de 1.1.1 Atividade 1' })
    expect(within(painel).getByText('Usar tinta acrílica')).toBeInTheDocument()
    const descricao = within(painel).getByText('Descrição').closest('section')!
    fireEvent.click(within(descricao).getByRole('button', { name: 'Editar' }))
    fireEvent.change(within(descricao).getByRole('textbox', { name: 'Descrição do card' }), { target: { value: 'Duas demãos de tinta acrílica' } })
    fireEvent.click(within(descricao).getByRole('button', { name: 'Concluir' }))
    await waitFor(() => expect(patchCardAction).toHaveBeenCalledWith('s1', 'c1', { description: 'Duas demãos de tinta acrílica' }))
    expect(await within(painel).findByText('Duas demãos de tinta acrílica')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Detalhes de 1.1.1 Atividade 1' })).toBeNull()
  })

  it('sem permissão nos cards, o painel mostra a descrição sem editar', () => {
    render(<ToastProvider><PlanilhaCustosView {...props} planilha={comCard()} /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes de 1.1.1 Atividade 1' }))
    const painel = screen.getByRole('region', { name: 'Detalhes de 1.1.1 Atividade 1' })
    expect(within(painel).getByText('Usar tinta acrílica')).toBeInTheDocument()
    const descricao = within(painel).getByText('Descrição').closest('section')!
    expect(within(descricao).queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('macrofase não oferece exclusão na planilha', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    expect(screen.queryByRole('button', { name: /Excluir macrofase/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Adicionar tarefa à macrofase Fase 1' })).toBeInTheDocument()
    expect(excluirFaseAction).not.toHaveBeenCalled()
  })

  it('alterações pendentes não reintroduzem exclusão de macrofase', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    fireEvent.change(screen.getByDisplayValue('90'), { target: { value: '120' } })
    expect(screen.queryByRole('button', { name: /Excluir macrofase/ })).toBeNull()
    expect(screen.getByDisplayValue('120')).toBeInTheDocument()
  })

  it('macrofase ainda não salva não oferece Excluir macrofase', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas rootId="raiz" /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar macrofase' }))
    expect(screen.getByRole('textbox', { name: 'Renomear 1.1' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: /Excluir macrofase/ })).toBeNull()
  })

  it('criar macrofase escolhe número e permanece visível durante o salvamento', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas rootId="raiz" /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar macrofase' }))
    const title = screen.getByRole('textbox', { name: 'Renomear 1.1' })
    fireEvent.change(title, { target: { value: 'Nova fase' } })
    fireEvent.blur(title)
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Número da nova macrofase' }))
    expect(insertChildAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(insertChildAction).toHaveBeenCalledWith('p1', 'raiz'))
    await waitFor(() => expect(renameNodeAction).toHaveBeenCalledWith('p1', 'mf-criada', 'Nova fase'))
    await waitFor(() => expect(screen.queryByDisplayValue('Nova fase') ?? screen.queryByRole('button', { name: /Renomear .*Nova fase/ })).not.toBeNull())
  })

  it('movimento que falha mantém o rascunho para tentar salvar outra vez', async () => {
    const outraFase = { ...planilha.macrofases[0], nodeId: 'mf2', codigo: '1.2', titulo: 'Fase 2', atividades: [] }
    vi.mocked(moveNodeAction).mockResolvedValueOnce({ ok: false, error: 'Conflito de edição' }).mockResolvedValue({ ok: true, serverVersion: 3 })
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas planilha={{ ...planilha, macrofases: [...planilha.macrofases, outraFase] }} /></ToastProvider>)
    const dataTransfer = { effectAllowed: 'move', setData: vi.fn() }
    fireEvent.dragStart(screen.getByTitle('Arrastar 1.1.1 Atividade 1'), { dataTransfer })
    const destino = screen.getByRole('button', { name: 'Renomear 1.2 Fase 2' }).closest('tr')!
    fireEvent.dragOver(destino)
    fireEvent.drop(destino)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(moveNodeAction).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Salvar agora' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(moveNodeAction).toHaveBeenCalledTimes(2))
  })

  it('salvamento parcial não repete um movimento já aplicado ao tentar novamente', async () => {
    const outraFase = { ...planilha.macrofases[0], nodeId: 'mf2', codigo: '1.2', titulo: 'Fase 2', atividades: [] }
    vi.mocked(moveNodeAction).mockResolvedValueOnce({ ok: true, serverVersion: 2 }).mockResolvedValueOnce({ ok: false, error: 'Conflito' }).mockResolvedValue({ ok: true, serverVersion: 3 })
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas planilha={{ ...planilha, macrofases: [...planilha.macrofases, outraFase] }} /></ToastProvider>)
    const dataTransfer = { effectAllowed: 'move', setData: vi.fn() }
    fireEvent.dragStart(screen.getByTitle('Arrastar 1.1.1 Atividade 1'), { dataTransfer })
    const fase2 = screen.getByRole('button', { name: 'Renomear 1.2 Fase 2' }).closest('tr')!
    fireEvent.dragOver(fase2)
    fireEvent.drop(fase2)
    fireEvent.dragStart(screen.getByTitle('Arrastar 1.1.1 Atividade 1'), { dataTransfer })
    const fase1 = screen.getByRole('button', { name: 'Renomear 1.1 Fase 1' }).closest('tr')!
    fireEvent.dragOver(fase1)
    fireEvent.drop(fase1)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(moveNodeAction).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(moveNodeAction).toHaveBeenCalledTimes(3))
    expect(vi.mocked(moveNodeAction).mock.calls.filter(([, payload]) => payload.targetId === 'mf2')).toHaveLength(1)
  })

  it('exclusão confirmada só chega à EAP depois de Salvar', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Excluir atividade 1.1.1 Atividade 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Excluir linha' })).getByRole('button', { name: 'Excluir' }))
    expect(deleteNodeAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(deleteNodeAction).toHaveBeenCalledWith('p1', 'a1'))
  })

  it('excluir uma linha com campo pendente não tenta gravar o nó excluído', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    fireEvent.change(screen.getByDisplayValue('90'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Excluir atividade 1.1.1 Atividade 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Excluir linha' })).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(deleteNodeAction).toHaveBeenCalledWith('p1', 'a1'))
    expect(updateNodePropertiesAction).not.toHaveBeenCalled()
  })

  it('atividade nova salva os campos usando o ID definitivo retornado pela EAP', async () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar atividade abaixo de 1.1.1 Atividade 1' }))
    const title = screen.getByRole('textbox', { name: 'Renomear 1.1.2' })
    fireEvent.change(title, { target: { value: 'Atividade nova' } })
    fireEvent.blur(title)
    const linha = screen.getByRole('button', { name: 'Renomear 1.1.2 Atividade nova' }).closest('tr')!
    fireEvent.change(within(linha).getAllByDisplayValue('0')[0], { target: { value: '45' } })
    expect(insertSiblingAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(insertSiblingAction).toHaveBeenCalledWith('p1', 'a1'))
    await waitFor(() => expect(updateNodePropertiesAction).toHaveBeenCalledWith('p1', 'atividade-real', { tempoMinutos: 45 }, { background: true }))
    expect(screen.getByText(/Atividade nova/)).toBeInTheDocument()
  })

  it('resumo de valor acompanha o rascunho e só persiste ao salvar', async () => {
    renderizar()
    fireEvent.change(screen.getByDisplayValue('90'), { target: { value: '120' } })
    const resumo = screen.getByText('Resumo — Valor por Fase do Projeto').closest('div')!
    expect(within(resumo).getAllByText('R$ 120,00').length).toBeGreaterThan(0)
    expect(updateNodePropertiesAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(updateNodePropertiesAction).toHaveBeenCalledWith('p1', 'a1', { tempoMinutos: 120 }, { background: true }))
  })
})

describe('parseMoeda', () => {
  it('aceita R$, milhar com ponto e vírgula decimal', () => {
    expect(parseMoeda('R$ 1.234,56')).toBe(1234.56)
    expect(parseMoeda('300')).toBe(300)
    expect(parseMoeda('12.5')).toBe(12.5)
    expect(parseMoeda('')).toBe(0)
    expect(parseMoeda('abc')).toBeNaN()
  })
})

describe('PlanilhaCustosView — situação ao vivo', () => {
  function renderizarDatas(prevista: string | null, realizacao: string | null) {
    const p: PlanilhaDeCustos = {
      ...planilha,
      macrofases: [{
        ...planilha.macrofases[0],
        atividades: [{
          ...planilha.macrofases[0].atividades[0],
          dataPrevista: prevista,
          dataRealizacao: realizacao,
        }],
      }],
    }
    return render(
      <ToastProvider>
        <PlanilhaCustosView {...props} planilha={p} />
      </ToastProvider>
    )
  }

  it('sem realização → Pendente', () => {
    renderizarDatas('2026-03-10', null)
    expect(screen.getByText('Pendente')).toBeInTheDocument()
  })

  it('realização antes da prevista → Antecipada (verde)', () => {
    renderizarDatas('2026-03-10', '2026-03-05')
    expect(screen.getByText('Antecipada')).toBeInTheDocument()
  })

  it('realização após a prevista → Atrasada (vermelho)', () => {
    renderizarDatas('2026-03-10', '2026-03-15')
    expect(screen.getByText('Atrasada')).toBeInTheDocument()
  })

  it('atualiza a situação ao vivo enquanto digita as datas', () => {
    const { container } = renderizarDatas(null, null)

    // Inicial: sem realização → Pendente
    expect(screen.getByText('Pendente')).toBeInTheDocument()

    // Digita prevista 10/03/2026 e realização 15/03/2026 → Atrasada ao vivo
    const inputs = Array.from(container.querySelectorAll('input'))
    const previstaInput = inputs.find(i => i.placeholder === 'dd/mm/aaaa')!
    const realizacaoInput = inputs.find(i => i.placeholder === 'dd/mm/aaaa' && i !== previstaInput)!
    fireEvent.change(previstaInput, { target: { value: '10/03/2026' } })
    fireEvent.change(realizacaoInput, { target: { value: '15/03/2026' } })
    expect(screen.getByText('Atrasada')).toBeInTheDocument()

    // Trocando a realização para antes → Antecipada sem salvar
    fireEvent.change(realizacaoInput, { target: { value: '05/03/2026' } })
    expect(screen.getByText('Antecipada')).toBeInTheDocument()

    // Limpando a realização → volta para Pendente
    fireEvent.change(realizacaoInput, { target: { value: '' } })
    expect(screen.getByText('Pendente')).toBeInTheDocument()
  })
})

describe('PlanilhaCustosView — permissões do realizado', () => {
  it('tempo do timer soma com o digitado no total realizado (ADR-089)', () => {
    const fromCards = structuredClone(planilha)
    Object.assign(fromCards.macrofases[0].atividades[0], { minReal: 100 + 11 / 60, minRealDigitado: 100, minRealApontado: 11 / 60, tempoRealDosCards: true })
    render(<ToastProvider><PlanilhaCustosView {...props} canEditAllActual planilha={fromCards} /></ToastProvider>)
    const row = within(screen.getByText('1.1.1 Atividade 1').closest('tr')!)
    expect(row.getByDisplayValue('100.18')).toBeInTheDocument()
    expect(row.getByDisplayValue('1:40')).toBeInTheDocument()
  })

  it('macrofase é uma faixa de seção com os controles junto ao título e a contagem de atividades', () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    const linha = screen.getByRole('button', { name: 'Renomear 1.1 Fase 1' }).closest('tr')!
    const [titulo] = Array.from(linha.querySelectorAll('td'))
    expect(titulo).toHaveClass('planilha-phase-title')
    expect(titulo).toHaveAttribute('colspan', '18')
    expect(within(titulo).getByRole('button', { name: 'Adicionar tarefa à macrofase Fase 1' })).toBeInTheDocument()
    expect(within(titulo).getByText('1 atividade')).toBeInTheDocument()
  })

  it('Sub-total e Total mostram os minutos com no máximo duas casas', () => {
    const fromCards = structuredClone(planilha)
    Object.assign(fromCards.macrofases[0].atividades[0], { minReal: 1640 + 11 / 60, minRealDigitado: 1640, minRealApontado: 11 / 60, tempoRealDosCards: true })
    render(<ToastProvider><PlanilhaCustosView {...props} planilha={fromCards} /></ToastProvider>)
    expect(screen.getByText('Sub-total').closest('tr')).toHaveTextContent('1.640,18')
    expect(screen.getByText('Total do projeto').closest('tr')).toHaveTextContent('1.640,18')
    expect(document.body.textContent).not.toContain('1640.18333')
  })

  it('ícone da atividade abre o painel de detalhes', () => {
    render(<ToastProvider><PlanilhaCustosView {...props} canEditAllActual /></ToastProvider>)
    const row = within(screen.getByText('1.1.1 Atividade 1').closest('tr')!)
    fireEvent.click(row.getByRole('button', { name: 'Detalhes de 1.1.1 Atividade 1' }))
    expect(screen.getByRole('region', { name: 'Detalhes de 1.1.1 Atividade 1' })).toBeInTheDocument()
  })

  function renderizarPermissoes(overrides: Partial<React.ComponentProps<typeof PlanilhaCustosView>>) {
    return render(<ToastProvider><PlanilhaCustosView {...props} currentUserId="u1" canEdit={false} canEditAllActual={false} {...overrides} /></ToastProvider>)
  }
  it('membro edita somente o realizado da própria linha, com orçado bloqueado', () => {
    renderizarPermissoes({ canEditOwnActual: true })
    const linha = within(screen.getByText('1.1.1 Atividade 1').closest('tr')!)
    expect(linha.getByLabelText('Materiais realizados')).toBeInTheDocument()
    expect(linha.queryByLabelText('Materiais orçados')).toBeNull()
    expect(linha.getByRole('combobox', { name: 'Data de realização da atividade' })).toBeInTheDocument()
    expect(linha.queryByRole('combobox', { name: 'Data prevista da atividade' })).toBeNull()
    expect(linha.queryByRole('button', { name: /^Elaborado por/ })).toBeNull()
    expect(linha.getByText('90')).toBeInTheDocument()
  })
  it('realizado próprio não libera linha de outro usuário', () => {
    renderizarPermissoes({ canEditOwnActual: true, currentUserId: 'u2' })
    const linha = within(screen.getByText('1.1.1 Atividade 1').closest('tr')!)
    expect(linha.queryByLabelText('Materiais realizados')).toBeNull()
    expect(linha.queryByRole('textbox')).not.toBeInTheDocument()
  })
  it('permissão de realizado de todos libera outra linha sem liberar orçamento', () => {
    renderizarPermissoes({ canEditAllActual: true, currentUserId: 'u2' })
    const linha = within(screen.getByText('1.1.1 Atividade 1').closest('tr')!)
    expect(linha.getByLabelText('Materiais realizados')).toBeInTheDocument()
    expect(linha.queryByLabelText('Materiais orçados')).toBeNull()
  })
  it('permissão de orçado isolada mantém realizado bloqueado', () => {
    renderizarPermissoes({ canEdit: true })
    const linha = within(screen.getByText('1.1.1 Atividade 1').closest('tr')!)
    expect(linha.getByDisplayValue('90')).toBeInTheDocument()
    expect(linha.getByLabelText('Materiais orçados')).toBeInTheDocument()
    expect(linha.queryByLabelText('Materiais realizados')).toBeNull()
  })
  it('falha ao salvar mantém o valor digitado e exibe o erro', async () => {
    vi.mocked(updateNodePropertiesAction).mockResolvedValue({ ok: false, error: 'Sem permissão para editar' })
    renderizarPermissoes({ canEdit: true })
    const min = within(screen.getByText('1.1.1 Atividade 1').closest('tr')!).getByDisplayValue('90')
    fireEvent.change(min, { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
    await waitFor(() => expect(updateNodePropertiesAction).toHaveBeenCalledWith('p1', 'a1', { tempoMinutos: 120 }, { background: true }))
    expect(min).toHaveValue('120')
    expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('Sem permissão para editar'))).toBe(true)
  })
})

describe('descrição da tarefa ao passar o mouse', () => {
  it('mostra a descrição completa no hover e no foco pelo teclado', () => {
    renderizar()
    const tarefa = screen.getByText('1.1.1 Atividade 1')
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(tarefa.parentElement!)
    const dica = screen.getByRole('tooltip')
    expect(dica.textContent).toBe('Levantar os requisitos\ncom o cliente')
    expect(dica.className).toContain('whitespace-pre-line')
    fireEvent.mouseLeave(tarefa.parentElement!)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(tarefa).toHaveAttribute('tabindex', '0')
  })

  it('tarefa sem descrição não ganha dica nem foco extra', () => {
    const semDescricao: PlanilhaDeCustos = {
      ...planilha,
      macrofases: planilha.macrofases.map(f => ({ ...f, atividades: f.atividades.map(a => ({ ...a, descricao: '' })) })),
    }
    render(<ToastProvider><PlanilhaCustosView {...props} planilha={semDescricao} /></ToastProvider>)
    const tarefa = screen.getByText('1.1.1 Atividade 1')
    expect(tarefa).not.toHaveAttribute('tabindex')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('Elaborado por com várias pessoas (= responsáveis do card)', () => {
  it('marca mais de um elaborador e salva a lista; a jornada usada é a menor', async () => {
      const dois: Elaborador[] = [...elaboradores, { userId: 'u2', name: 'João', remuneracao: 4000, horasDiarias: 6 }]
      render(<ToastProvider><PlanilhaCustosView {...props} elaboradores={dois} /></ToastProvider>)
      const botao = screen.getByRole('button', { name: /Elaborado por — Atividade 1: Maria/ })
      fireEvent.click(botao)
      const grupo = screen.getByRole('dialog', { name: 'Elaborado por — Atividade 1' })
      expect(within(grupo).getByRole('checkbox', { name: 'Maria' })).toBeChecked()
      fireEvent.click(within(grupo).getByRole('checkbox', { name: 'João' }))
      expect(screen.getByRole('button', { name: /Elaborado por — Atividade 1: Maria, João/ })).toBeInTheDocument()
      // 90 min com a menor jornada (6h) = 0,25 dia
      expect(screen.getAllByDisplayValue('0,25').length).toBeGreaterThan(0)

      fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
      await waitFor(() => expect(updateNodePropertiesAction).toHaveBeenCalled())
      expect(updateNodePropertiesAction).toHaveBeenCalledWith('p1', 'a1', { elaboradoPorUserIds: ['u1', 'u2'] }, { background: true })
  })

  it('desmarcar todos salva lista vazia', async () => {
      renderizar()
      fireEvent.click(screen.getByRole('button', { name: /Elaborado por — Atividade 1/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Maria' }))
      fireEvent.click(screen.getByRole('button', { name: 'Salvar agora' }))
      await waitFor(() => expect(updateNodePropertiesAction).toHaveBeenCalled())
      expect(updateNodePropertiesAction).toHaveBeenCalledWith('p1', 'a1', { elaboradoPorUserIds: [] }, { background: true })
  })
})
