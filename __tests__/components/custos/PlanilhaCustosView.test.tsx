import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { updateNodePropertiesAction } from '@/app/actions/wbs'
import PlanilhaCustosView, { parseMoeda } from '@/components/custos/PlanilhaCustosView'
import { ToastProvider } from '@/components/ui/Toast'
import type { PlanilhaDeCustos, Elaborador } from '@/lib/planilhaCustos'

vi.mock('@/app/actions/wbs', () => ({
  updateNodePropertiesAction: vi.fn().mockResolvedValue({ ok: true }),
  insertChildAction: vi.fn(),
  insertSiblingAction: vi.fn(),
  renameNodeAction: vi.fn(),
  deleteNodeAction: vi.fn(),
}))
vi.mock('@/app/actions/projetos', () => ({
  addMemberAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(updateNodePropertiesAction).mockResolvedValue({ ok: true, serverVersion: 2 })
})

const elaboradores: Elaborador[] = [
  // 14400 / 30 / 8 / 60 = R$ 1,00 por minuto
  { userId: 'u1', name: 'Maria', remuneracao: 14400, horasDiarias: 8 },
]

const planilha: PlanilhaDeCustos = {
  config: { valorReferencia: 4000, horasPorDia: 8 },
  macrofases: [
    {
      nodeId: 'mf1', codigo: 'M1', titulo: 'Fase 1',
      atividades: [
        {
          nodeId: 'a1', codigo: 'A1', titulo: 'Atividade 1',
          descricao: 'Levantar os requisitos\ncom o cliente',
          elaboradoPor: 'Maria', elaboradoPorUserId: 'u1', elaboradoPorUserIds: ['u1'],
          vpm: 1, jornadaDiaria: 8,
          minOrcado: 90, materiaisOrcado: 0, dataPrevista: null,
          rOrcado: 90, totalOrcado: 90,
          minReal: 0, materiaisReal: 0, dataRealizacao: null,
          rReal: 0, totalReal: 0,
          situacao: 'Pendente',
        },
      ],
      minOrcado: 90, materiaisOrcado: 0, totalOrcado: 90,
      minReal: 0, materiaisReal: 0, totalReal: 0,
    },
  ],
  qtdeAtividades: 1,
  totalOrcado: 90,
  totalReal: 0,
  tempoOrcadoTotal: 90,
  tempoRealTotal: 0,
  quadros: {
    valor: [{ fase: 'M1', orcado: 90, realizado: 0 }],
    tempo: [{ fase: 'M1', minOrcado: 90, minReal: 0 }],
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

  it('auto-save não corta a digitação em andamento', async () => {
    vi.useFakeTimers()
    try {
      renderizar()
      const horas = screen.getByDisplayValue('1:30')

      fireEvent.focus(horas)
      fireEvent.change(horas, { target: { value: '2.' } })
      expect(horas).toHaveValue('2.')

      // dispara o debounce do auto-save (1s) — re-render de setSalvando/setSalvo
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100)
      })

      expect(horas).toHaveValue('2.') // o draft sobrevive ao re-render do auto-save
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
      quadros: { valor: [{ fase: 'M1', orcado: 0, realizado: 0 }], tempo: planilha.quadros.tempo, elaboradores: [] },
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
    const linha = screen.getByText('A1 Atividade 1').closest('tr')!
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
    const linha = screen.getByText('A1 Atividade 1').closest('tr')!
    expect(linha).toHaveTextContent('R$ 390,00') // 90 × 1 + 300
  })

  it('Sub-total só com o rótulo, à direita, somando Materiais orçado e realizado', () => {
    renderizar()
    const rotulo = screen.getByText('Sub-total')
    expect(rotulo).toHaveClass('text-right')
    const [materiais] = screen.getAllByLabelText('Materiais orçados')
    fireEvent.change(materiais, { target: { value: '50' } })
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

  it('ações de inserir/excluir linha só com permissão de mudar a EAP', () => {
    const { unmount } = renderizar()
    expect(screen.queryByLabelText(/Inserir linha abaixo/)).toBeNull()
    unmount()
    render(<ToastProvider><PlanilhaCustosView {...props} canEditLinhas /></ToastProvider>)
    fireEvent.click(screen.getByLabelText('Inserir linha abaixo de A1 Atividade 1'))
    expect(screen.getByLabelText('Nome da nova atividade')).toBeInTheDocument()
    expect(screen.getByLabelText('Excluir linha A1 Atividade 1')).toBeInTheDocument()
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
  function renderizarPermissoes(overrides: Partial<React.ComponentProps<typeof PlanilhaCustosView>>) {
    return render(<ToastProvider><PlanilhaCustosView {...props} currentUserId="u1" canEdit={false} canEditAllActual={false} {...overrides} /></ToastProvider>)
  }
  it('membro edita somente o realizado da própria linha, com orçado bloqueado', () => {
    renderizarPermissoes({ canEditOwnActual: true })
    const linha = within(screen.getByText('A1 Atividade 1').closest('tr')!)
    expect(linha.getByDisplayValue('0:00')).toBeInTheDocument()
    expect(linha.queryByDisplayValue('1:30')).not.toBeInTheDocument()
    expect(linha.queryByRole('combobox')).not.toBeInTheDocument()
    expect(linha.getByText('1:30')).toHaveClass('bg-gray-100')
    expect(linha.getByDisplayValue('0:00')).toHaveClass('border-blue-200')
  })
  it('realizado próprio não libera linha de outro usuário', () => {
    renderizarPermissoes({ canEditOwnActual: true, currentUserId: 'u2' })
    const linha = within(screen.getByText('A1 Atividade 1').closest('tr')!)
    expect(linha.queryByRole('textbox')).not.toBeInTheDocument()
  })
  it('permissão de realizado de todos libera outra linha sem liberar orçamento', () => {
    renderizarPermissoes({ canEditAllActual: true, currentUserId: 'u2' })
    const linha = within(screen.getByText('A1 Atividade 1').closest('tr')!)
    expect(linha.getByDisplayValue('0:00')).toBeInTheDocument()
    expect(linha.queryByDisplayValue('1:30')).not.toBeInTheDocument()
  })
  it('permissão de orçado isolada mantém realizado bloqueado', () => {
    renderizarPermissoes({ canEdit: true })
    const linha = within(screen.getByText('A1 Atividade 1').closest('tr')!)
    expect(linha.getByDisplayValue('1:30')).toBeInTheDocument()
    expect(linha.queryByDisplayValue('0:00')).not.toBeInTheDocument()
  })
  it('falha ao salvar mantém o valor digitado e exibe o erro', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(updateNodePropertiesAction).mockResolvedValue({ ok: false, error: 'Sem permissão para editar' })
      renderizarPermissoes({ canEditOwnActual: true })
      const horas = within(screen.getByText('A1 Atividade 1').closest('tr')!).getByDisplayValue('0:00')
      fireEvent.change(horas, { target: { value: '2:30' } })
      await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
      expect(horas).toHaveValue('2:30')
      expect(screen.getByText('Sem permissão para editar')).toBeInTheDocument()
      expect(updateNodePropertiesAction).toHaveBeenCalledWith('p1', 'a1', { tempoRealMinutos: 150 })
    } finally { vi.useRealTimers() }
  })
})

describe('descrição da tarefa ao passar o mouse', () => {
  it('mostra a descrição completa no hover e no foco pelo teclado', () => {
    renderizar()
    const tarefa = screen.getByText('A1 Atividade 1')
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
    const tarefa = screen.getByText('A1 Atividade 1')
    expect(tarefa.tagName).toBe('TD')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})

describe('Elaborado por com várias pessoas (= responsáveis do card)', () => {
  it('marca mais de um elaborador e salva a lista; a jornada usada é a menor', async () => {
    vi.useFakeTimers()
    try {
      const dois: Elaborador[] = [...elaboradores, { userId: 'u2', name: 'João', remuneracao: 4000, horasDiarias: 6 }]
      render(<ToastProvider><PlanilhaCustosView {...props} elaboradores={dois} /></ToastProvider>)
      const botao = screen.getByRole('button', { name: /Elaborado por — Atividade 1: Maria/ })
      fireEvent.click(botao)
      const grupo = screen.getByRole('group', { name: 'Elaborado por — Atividade 1' })
      expect(within(grupo).getByRole('checkbox', { name: 'Maria' })).toBeChecked()
      fireEvent.click(within(grupo).getByRole('checkbox', { name: 'João' }))
      expect(screen.getByRole('button', { name: /Elaborado por — Atividade 1: Maria, João/ })).toBeInTheDocument()
      // 90 min com a menor jornada (6h) = 0,25 dia
      expect(screen.getAllByDisplayValue('0,25').length).toBeGreaterThan(0)

      await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
      expect(updateNodePropertiesAction).toHaveBeenCalledWith('p1', 'a1', { elaboradoPorUserIds: ['u1', 'u2'] })
    } finally {
      vi.useRealTimers()
    }
  })

  it('desmarcar todos salva lista vazia', async () => {
    vi.useFakeTimers()
    try {
      renderizar()
      fireEvent.click(screen.getByRole('button', { name: /Elaborado por — Atividade 1/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Maria' }))
      await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
      expect(updateNodePropertiesAction).toHaveBeenCalledWith('p1', 'a1', { elaboradoPorUserIds: [] })
    } finally {
      vi.useRealTimers()
    }
  })
})
