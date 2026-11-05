'use client'

import { usePlanilhaAutosave } from '@/hooks/usePlanilhaAutosave'
import dynamic from 'next/dynamic'
import { SobDemandaPlanilha, MaisAtividadesPlanilha } from './CarregamentoPlanilha'
const HistoricoPlanilha = dynamic(() => import('./HistoricoPlanilha'))
import { salvarHistoricoPlanilhaAction } from '@/app/actions/planilhaHistorico'
import { rotuloVersaoPlanilha } from '@/lib/planilhaVersion'
import type { ArquivoRascunho } from './AtividadeRascunho'
const AtividadeRascunho = dynamic(() => import('./AtividadeRascunho'))
import { fetchWithSession } from '@/lib/clientFetch'
import { getActivityCardAction, patchActivityDescriptionAction, patchActivityPriorityAction } from '@/app/actions/sprintBoard'
import { repetirSincronizacaoAction } from '@/app/actions/sincronizacao'
import FormActions from '@/components/ui/FormActions'
import ChangesPanel, { type ReviewChange } from '@/components/ui/ChangesPanel'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import MoedaInput from '@/components/ui/MoedaInput'
import { parseMoeda as parseMoedaLib } from '@/lib/dinheiro'
import Dica from '@/components/ui/Tooltip'
import ElaboradoresSelect from './ElaboradoresSelect'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ExcluirFaseDialog from '@/components/projetos/ExcluirFaseDialog'
import type { AtividadeDetalhe } from '@/components/custos/AtividadeDetalhesPainel'
const AtividadeDetalhesPainel = dynamic(() => import('./AtividadeDetalhesPainel'))
import PrioridadeAtividade from './PrioridadeAtividade'
import { menorJornada, somaValoresPorMinuto } from '@/lib/elaboradores'

import { Fragment, memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, startTransition, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Download, History, Undo2, Plus, CircleHelp, Trash2, Save, ListChecks, GripVertical, PanelRightOpen } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import { useGuardaSaida } from '@/components/documentos/editor/GuardaSaida'
import SeletorData from '@/components/ui/SeletorData'
import './planilha-custos.css'
import { updateNodePropertiesAction, insertChildAction, insertSiblingAction, renameNodeAction, deleteNodeAction, moveNodeAction } from '@/app/actions/wbs'
import { fmtDataBR, maiorData, situacaoDe, valorPorMinutoDoElaborador, type PlanilhaDeCustos, type SituacaoAtividade, type Elaborador } from '@/lib/planilhaCustos'
import { minutosDeHoras, minutosDeDias, round2 } from '@/lib/custosCalc'
import { formatarMinutos } from '@/lib/tempoRealizado'
const GraficosPlanilha3D = dynamic(() => import('./GraficosPlanilha3D'))

interface Props {
  initialVersion?: number
  projetoId: string
  nomeProjeto: string
  inicioProjeto: string
  fimProjeto: string
  canEdit: boolean
  currentUserId?: string
  canEditOwnActual?: boolean
  canEditAllActual?: boolean
  /** Pode inserir e excluir linhas (muda a estrutura da EAP). */
  canEditLinhas?: boolean
  /** Pode iniciar o timer e editar a descrição dos cards ligados (`quadro:cards`). */
  canUsarCards?: boolean
  rootId?: string | null
  planilha: PlanilhaDeCustos
  elaboradores: Elaborador[]
  exportUrl: string
}

type CampoLinha = Partial<{
  descricao: string
  minOrcado: string
  minReal: string
  materiaisOrcado: string
  dataPrevista: string
  materiaisReal: string
  dataRealizacao: string
  /** Ids separados por vírgula (o rascunho guarda texto). */
  elaboradoPorUserIds: string
  elaboradoPor: string
}>

type StructureOp =
  | { id: string; kind: 'create-phase'; title: string; tempId: string; positionChosen?: boolean }
  | { id: string; kind: 'create-activity'; title: string; tempId: string; refId: string; relation: 'irmao' | 'filho' }
  | { id: string; kind: 'move'; nodeId: string; targetId: string; position: 'INSIDE' | 'BEFORE' | 'AFTER' }
  | { id: string; kind: 'delete'; nodeId: string }

function deletedNodeIds(operations: StructureOp[], source: PlanilhaDeCustos['macrofases']): Set<string> {
  return new Set(operations.filter(op => op.kind === 'delete').flatMap(op => {
    if (op.kind !== 'delete') return []
    const phase = source.find(f => f.nodeId === op.nodeId)
    return phase ? [op.nodeId, ...phase.atividades.map(a => a.nodeId)] : [op.nodeId]
  }))
}

function previewStructure(source: PlanilhaDeCustos['macrofases'], operations: StructureOp[]): PlanilhaDeCustos['macrofases'] {
  let fases = source.map(f => ({ ...f, atividades: [...f.atividades] }))
  for (const op of operations) {
    if (op.kind === 'create-phase') {
      fases = [{ nodeId: op.tempId, codigo: 'Nova', titulo: op.title, atividades: [], minOrcado: 0, materiaisOrcado: 0, totalOrcado: 0, minReal: 0, materiaisReal: 0, totalReal: 0, dataFim: null }, ...fases]
    } else if (op.kind === 'create-activity') {
      const atividade: PlanilhaDeCustos['macrofases'][number]['atividades'][number] = { nodeId: op.tempId, codigo: 'Nova', titulo: op.title, descricao: '', elaboradoPor: '', elaboradoPorUserId: null, elaboradoPorUserIds: [], vpm: null, jornadaDiaria: null, minOrcado: 0, materiaisOrcado: 0, dataPrevista: null, rOrcado: null, totalOrcado: null, minReal: 0, minRealDigitado: 0, minRealApontado: 0, materiaisReal: 0, dataRealizacao: null, rReal: null, totalReal: null, situacao: 'Pendente' }
      fases = fases.map(f => {
        if (op.relation === 'irmao') {
          const ref = f.atividades.find(a => a.nodeId === op.refId)
          if (!ref) return f
          const parts = ref.codigo.split('.')
          const parent = parts.slice(0, -1).join('.')
          const next = Number(parts.at(-1)) + 1
          const shifted = f.atividades.map(a => {
            if (!a.codigo.startsWith(`${parent}.`)) return a
            const suffix = a.codigo.slice(parent.length + 1).split('.')
            const index = Number(suffix[0])
            return index >= next ? { ...a, codigo: `${parent}.${[index + 1, ...suffix.slice(1)].join('.')}` } : a
          })
          return { ...f, atividades: shifted.flatMap(a => a.nodeId === op.refId ? [a, { ...atividade, codigo: `${parent}.${next}` }] : [a]) }
        }
        if (f.nodeId !== op.refId) return f
        const next = Math.max(0, ...f.atividades.map(a => Number(a.codigo.slice(f.codigo.length + 1).split('.')[0]) || 0)) + 1
        return { ...f, atividades: [...f.atividades, { ...atividade, codigo: `${f.codigo}.${next}` }] }
      })
    } else if (op.kind === 'delete') {
      fases = fases.filter(f => f.nodeId !== op.nodeId).map(f => ({ ...f, atividades: f.atividades.filter(a => a.nodeId !== op.nodeId) }))
    } else {
      const phaseIndex = fases.findIndex(f => f.nodeId === op.nodeId)
      if (phaseIndex >= 0) {
        const [phase] = fases.splice(phaseIndex, 1)
        const targetIndex = fases.findIndex(f => f.nodeId === op.targetId)
        if (targetIndex >= 0) fases.splice(targetIndex + (op.position === 'AFTER' ? 1 : 0), 0, phase)
        else fases.splice(phaseIndex, 0, phase)
      } else {
        let activity: PlanilhaDeCustos['macrofases'][number]['atividades'][number] | undefined
        fases = fases.map(f => ({ ...f, atividades: f.atividades.filter(a => { if (a.nodeId === op.nodeId) { activity = a; return false } return true }) }))
        if (!activity) continue
        let inserted = false
        fases = fases.map(f => {
          if (op.position === 'INSIDE' && f.nodeId === op.targetId) { inserted = true; return { ...f, atividades: [...f.atividades, activity!] } }
          if (f.atividades.some(a => a.nodeId === op.targetId)) { inserted = true; return { ...f, atividades: f.atividades.flatMap(a => a.nodeId === op.targetId ? op.position === 'AFTER' ? [a, activity!] : [activity!, a] : [a]) } }
          return f
        })
        if (!inserted && fases[0]) fases[0].atividades.push(activity)
      }
    }
  }
  const prefix = source[0]?.codigo.split('.').slice(0, -1).join('.') || '1'
  return fases.map((fase, index) => {
    const codigo = `${prefix}.${index + 1}`
    return { ...fase, codigo, atividades: fase.atividades.map(a => ({ ...a, codigo: a.codigo.startsWith(`${fase.codigo}.`) ? codigo + a.codigo.slice(fase.codigo.length) : a.codigo })) }
  })
}

const lista = (csv: string): string[] => csv.split(',').map(v => v.trim()).filter(Boolean)
/** Elaboradores da linha; aceita dados no formato antigo (um só). */
const idsDaLinha = (a: { elaboradoPorUserIds?: string[]; elaboradoPorUserId: string | null }): string[] =>
  a.elaboradoPorUserIds ?? (a.elaboradoPorUserId ? [a.elaboradoPorUserId] : [])

const SITUACAO_CLASS: Record<SituacaoAtividade, string> = {
  Antecipada: 'bg-emerald-100 text-emerald-800',
  'No prazo': 'bg-blue-100 text-blue-800',
  Atrasada: 'bg-red-100 text-red-800',
  Pendente: 'bg-gray-100 text-gray-700',
}


const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined) return fallback
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const hhmm = (min: number): string => {
  const rounded = Math.round(Math.abs(min))
  const h = Math.floor(rounded / 60)
  const m = String(rounded % 60).padStart(2, '0')
  return `${h}:${m}`
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** Exibição monetária em centavos; os cálculos preservam o valor por minuto sem arredondamento. */
const brlMinuto = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dois = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "R$ 1.234,56", "1234,56" ou "1234.56" → 1234.56; vazio é 0; NaN quando não é número. */
export function parseMoeda(texto: string): number {
  return parseMoedaLib(texto) ?? 0
}

/** Elaboradores da linha, com o rascunho (escolha ainda não salva) por cima. */
const idsAtuais = (a: { nodeId: string; elaboradoPorUserIds?: string[]; elaboradoPorUserId: string | null }, rascunho: Record<string, CampoLinha>): string[] => {
  const r = rascunho[a.nodeId]?.elaboradoPorUserIds
  return r !== undefined ? lista(r) : idsDaLinha(a)
}

/** Coluna R$: valor do minuto dos elaboradores (salário ÷ 30 ÷ jornada ÷ 60; com vários, a soma). */
const vpmDaLinha = (userIds: string[], elaboradores: Elaborador[]): number | null =>
  somaValoresPorMinuto(userIds.map(id => {
    const e = elaboradores.find(x => x.userId === id)
    return e ? valorPorMinutoDoElaborador(e) : null
  }))

/** Total = (Min × R$) + Materiais; sem R$, só os materiais; nenhum sem os dois. */
const totalDaLinha = (min: number, vpm: number | null, materiais: number): number | null =>
  vpm !== null ? round2(min * vpm + materiais) : materiais ? round2(materiais) : null

interface Soma { min: number; dias: number; materiais: number; total: number; temTotal: boolean }
const SOMA_VAZIA: Soma = { min: 0, dias: 0, materiais: 0, total: 0, temTotal: false }
const somar = (a: Soma, b: Soma): Soma => ({
  min: a.min + b.min, dias: a.dias + b.dias, materiais: a.materiais + b.materiais, total: a.total + b.total, temTotal: a.temTotal || b.temTotal,
})

const jornadaDaLinha = (userIds: string[], elaboradores: Elaborador[], padrao: number): number =>
  menorJornada(userIds.map(id => elaboradores.find(elaborador => elaborador.userId === id)?.horasDiarias)) ?? padrao

/**
 * Sub-total de uma fase (orçado ou realizado): soma os MESMOS valores exibidos nas linhas,
 * rascunho incluso, cada célula arredondada como na linha, para bater com a soma visível.
 */
function somaDaFase(
  fase: PlanilhaDeCustos['macrofases'][number],
  lado: 'orcado' | 'real',
  rascunho: Record<string, CampoLinha>,
  elaboradores: Elaborador[],
  horasPorDiaPadrao: number,
): Soma {
  let soma = SOMA_VAZIA
  for (const a of fase.atividades) {
    const r = rascunho[a.nodeId]
    const min = lado === 'orcado' ? num(r?.minOrcado, a.minOrcado) : num(r?.minReal, a.minReal)
    const materiais = lado === 'orcado' ? num(r?.materiaisOrcado, a.materiaisOrcado) : num(r?.materiaisReal, a.materiaisReal)
    const ids = idsAtuais(a, rascunho)
    const horas = jornadaDaLinha(ids, elaboradores, horasPorDiaPadrao)
    const total = totalDaLinha(min, vpmDaLinha(ids, elaboradores), materiais)
    soma = somar(soma, { min, dias: round2(min / 60 / horas), materiais, total: total ?? 0, temTotal: total !== null })
  }
  return soma
}

export default function PlanilhaCustosView({
  initialVersion, projetoId, nomeProjeto, inicioProjeto, fimProjeto, canEdit, currentUserId, canEditOwnActual = false, canEditAllActual = false, canEditLinhas = false, canUsarCards = false, rootId, planilha, elaboradores, exportUrl,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [rascunho, setRascunho] = useState<Record<string, CampoLinha>>({})
  const [historia, setHistoria] = useState<Record<string, CampoLinha>[]>([])
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState<Record<string, CampoLinha>>({})
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({})
  const [nameHistory, setNameHistory] = useState<Record<string, string>[]>([])
  const [showNameChanges, setShowNameChanges] = useState(false)
  const [reviewAnchor, setReviewAnchor] = useState<{ left: number; top: number; width: number } | undefined>()
  const [savingNames, setSavingNames] = useState(false)
  const savingRef = useRef(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastVersion, setLastVersion] = useState<number | undefined>(initialVersion)
  const [showHistory, setShowHistory] = useState(false)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const [structureOps, setStructureOps] = useState<StructureOp[]>([])
  const [fileDrafts, setFileDrafts] = useState<Record<string, ArquivoRascunho[]>>({})
  const [priorityDrafts, setPriorityDrafts] = useState<Record<string, string>>({})
  const tempIds = useRef(new Map<string, string>())
  const [dragged, setDragged] = useState<{ nodeId: string; kind: 'phase' | 'activity' } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const latestServer = useRef(planilha.macrofases)
  useEffect(() => { latestServer.current = planilha.macrofases }, [planilha.macrofases])
  const [savedStructure, setSavedStructure] = useState<{ server: PlanilhaDeCustos['macrofases']; preview: PlanilhaDeCustos['macrofases']; ids: Record<string, string> } | null>(null)
  const structureSource = savedStructure?.server === planilha.macrofases ? savedStructure.preview : planilha.macrofases
  const fasesAtuais = useMemo(() => previewStructure(structureSource, structureOps.map(op => {
    const resolve = (id: string) => { const mapped = savedStructure?.ids[id]; return mapped && structureSource.some(f => f.nodeId === mapped || f.atividades.some(a => a.nodeId === mapped)) ? mapped : id }
    if (op.kind === 'create-activity') return { ...op, refId: resolve(op.refId) }
    if (op.kind === 'move') return { ...op, nodeId: resolve(op.nodeId), targetId: resolve(op.targetId) }
    if (op.kind === 'delete') return { ...op, nodeId: resolve(op.nodeId) }
    return op
  })), [structureSource, structureOps, savedStructure])
  const dirtyCount = Object.keys(rascunho).reduce((acc, nodeId) => {
    const cur = rascunho[nodeId]
    if (!cur || Object.keys(cur).length === 0) return acc
    const s = salvo[nodeId]
    if (!s) return acc + 1
    return JSON.stringify(s) !== JSON.stringify(cur) ? acc + 1 : acc
  }, 0)
  const originalNames = useMemo(() => new Map(planilha.macrofases.flatMap(fase => [
    [fase.nodeId, { codigo: fase.codigo, titulo: fase.titulo }],
    ...fase.atividades.map(a => [a.nodeId, { codigo: a.codigo, titulo: a.titulo }] as const),
  ] as const)), [planilha.macrofases])
  const nameChanges: ReviewChange[] = Object.entries(nameDrafts).flatMap(([nodeId, depois]) => {
    const original = originalNames.get(nodeId)
    return original && original.titulo !== depois ? [{ chave: nodeId, rotulo: original.codigo, antes: original.titulo, depois }] : []
  })
  const setNameDraft = useCallback((nodeId: string, value: string) => {
    const original = originalNames.get(nodeId)?.titulo
    if (value === (nameDrafts[nodeId] ?? original)) return
    setNameHistory(previous => [...previous.slice(-49), nameDrafts])
    setNameDrafts(previous => {
      const next = { ...previous }
      if (value === original) delete next[nodeId]
      else next[nodeId] = value
      return next
    })
  }, [nameDrafts, originalNames])
  const undoNameDraft = useCallback(() => {
    setNameHistory(previous => {
      if (!previous.length) return previous
      setNameDrafts(previous.at(-1) ?? {})
      return previous.slice(0, -1)
    })
  }, [])

  // ── Undo (Ctrl+Z) ────────────────────────────────────────────────────────────
  const setCampo = useCallback((nodeId: string, campo: keyof CampoLinha, valor: string) => {
    setSaveStatus('idle')
    setSaveErrors(previous => { if (!previous[nodeId]) return previous; const next = { ...previous }; delete next[nodeId]; return next })
    setRascunho(prev => {
      setHistoria(h => [...h.slice(-99), prev])
      return { ...prev, [nodeId]: { ...(prev[nodeId] ?? {}), [campo]: valor } }
    })
  }, [])

  const desfazer = useCallback(() => {
    setHistoria(h => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      setRascunho(prev)
      return h.slice(0, -1)
    })
  }, [])

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        desfazer()
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [desfazer])

  // Campos financeiros e responsáveis ficam em rascunho até Salvar.
  async function salvarCampos(excluidos: ReadonlySet<string>): Promise<boolean> {
      if (dirtyCount === 0) return true
      setSalvando(true)
      const erros: Record<string, string> = {}
      const salvos: Record<string, CampoLinha> = {}
      for (const [nodeId, campos] of Object.entries(rascunho)) {
        if (excluidos.has(nodeId)) continue
        if (!fasesAtuais.some(f => f.nodeId === nodeId || f.nodeId === tempIds.current.get(nodeId) || f.atividades.some(a => a.nodeId === nodeId || a.nodeId === tempIds.current.get(nodeId)))) continue
        if (JSON.stringify(salvo[nodeId]) === JSON.stringify(campos)) continue
        const props: Record<string, unknown> = {}
        if (campos.descricao !== undefined) props.description = campos.descricao
        if (campos.minReal !== undefined) {
          const atividade = fasesAtuais.flatMap(f => f.atividades).find(a => a.nodeId === nodeId)
          props.tempoRealAjusteMinutos = Math.round((num(campos.minReal, 0) - (atividade?.minRealDigitado ?? 0) - (atividade?.minRealApontado ?? 0)) * 100) / 100
        }
        if (campos.minOrcado !== undefined) props.tempoMinutos = Math.round(num(campos.minOrcado, 0))
        if (campos.materiaisOrcado !== undefined) props.materiais = Math.round(num(campos.materiaisOrcado, 0) * 100) / 100
        if (campos.dataPrevista !== undefined) props.dataPrevista = campos.dataPrevista || null
        if (campos.materiaisReal !== undefined) props.materiaisReal = Math.round(num(campos.materiaisReal, 0) * 100) / 100
        if (campos.dataRealizacao !== undefined) props.dataRealizacao = campos.dataRealizacao || null
        // Nomes e responsáveis do card são acertados no servidor (ADR-044).
        if (campos.elaboradoPorUserIds !== undefined) props.elaboradoPorUserIds = lista(campos.elaboradoPorUserIds)

        const res = await updateNodePropertiesAction(projetoId, tempIds.current.get(nodeId) ?? nodeId, props, { background: true })
        if (!res.ok) erros[nodeId] = res.error
        else salvos[nodeId] = campos
      }
      setSalvando(false)
      setSalvo(previous => ({ ...previous, ...salvos }))
      setSaveErrors(erros)
      if (Object.keys(erros).length) {
        const primeiro = Object.keys(erros)[0]
        toast(`Não foi possível salvar ${originalNames.get(primeiro)?.codigo ?? 'uma linha'}. Confira o aviso na planilha.`, 'error')
        document.querySelector(`[data-planilha-node="${CSS.escape(primeiro)}"]`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
        return false
      }
      setHistoria([])
      return true
  }

  const semAtividades = fasesAtuais.length === 0

  // ── Inserir / excluir linhas (como no Excel) ────────────────────────────────
  // Cada linha é uma atividade (folha) da EAP: inserir cria o item na EAP e excluir
  // remove o item e o card dele na sprint, como na aba EAP/WBS.
  const [novaLinha, setNovaLinha] = useState<{ tipo: 'irmao' | 'filho'; refId: string } | null>(null)
  const [excluindo, setExcluindo] = useState<{ nodeId: string; nome: string } | null>(null)
  const [faseAExcluir, setFaseAExcluir] = useState<FaseExcluir | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const recarregar = useCallback(() => {
    void salvarHistoricoPlanilhaAction(projetoId).then(result => {
      if (result.error) { setSaveStatus('error'); toast(result.error, 'error') }
      else { setLastVersion(result.numero); setSaveStatus('saved') }
      startTransition(() => router.refresh())
    }).catch(() => { setSaveStatus('error'); toast('A alteração foi salva, mas não foi possível registrar a versão. Tente novamente.', 'error') })
  }, [router, projetoId, toast])
  const fecharDetalhe = useCallback(() => setDetalheId(null), [])
  // A exclusão de macrofase é imediata (mesmo diálogo do cadastro do projeto); com
  // alterações pendentes, o rascunho poderia apontar para itens que deixaram de existir.
  const pendenciasRef = useRef(0)
  const pedirExclusaoFase = useCallback((fase: FaseExcluir) => {
    if (pendenciasRef.current > 0) {
      toast('Salve ou descarte as alterações pendentes antes de excluir uma macrofase.', 'warning')
      return
    }
    setFaseAExcluir(fase)
  }, [toast])
  const inserirAtividade = useCallback((linha: { tipo: 'irmao' | 'filho'; refId: string } | null) => {
    if (!linha) return
    setStructureOps(previous => {
      const fase = previewStructure(structureSource, previous).find(f => f.nodeId === linha.refId || f.atividades.some(a => a.nodeId === linha.refId))
      if (!fase) return previous
      return [...previous, { id: crypto.randomUUID(), kind: 'create-activity', title: 'Nova atividade', tempId: `novo-${crypto.randomUUID()}`, refId: linha.tipo === 'irmao' ? linha.refId : fase.nodeId, relation: linha.tipo }]
    })
  }, [structureSource])
  const acoes = useMemoAcoes(canEditLinhas, inserirAtividade, setExcluindo, pedirExclusaoFase, (nodeId, targetId, position) => {
    setStructureOps(previous => [...previous, { id: crypto.randomUUID(), kind: 'move', nodeId, targetId, position }])
    return Promise.resolve(true)
  })
  const dropOn = useCallback((event: DragEvent<HTMLElement>, targetId: string, kind: 'phase' | 'activity') => {
    event.preventDefault()
    if (!dragged || dragged.nodeId === targetId || !acoes) return
    const rect = event.currentTarget.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'BEFORE' : 'AFTER'
    if (dragged.kind === 'phase' && kind === 'phase') void acoes.onMover(dragged.nodeId, targetId, position)
    if (dragged.kind === 'activity' && kind === 'activity') void acoes.onMover(dragged.nodeId, targetId, position)
    if (dragged.kind === 'activity' && kind === 'phase') void acoes.onMover(dragged.nodeId, targetId, 'INSIDE')
    setDragged(null)
    setDragOverId(null)
  }, [dragged, acoes])
  const criarMacrofase = useCallback(async (titulo: string): Promise<boolean> => {
    if (!rootId) { toast('Abra a EAP para iniciar a estrutura do projeto.', 'error'); return false }
    const tempId = `novo-${crypto.randomUUID()}`
    setStructureOps(previous => {
      const first = previewStructure(structureSource, previous)[0]
      const creation: StructureOp = { id: crypto.randomUUID(), kind: 'create-phase', title: titulo, tempId }
      return first
        ? [...previous, creation, { id: crypto.randomUUID(), kind: 'move', nodeId: tempId, targetId: first.nodeId, position: 'BEFORE' }]
        : [...previous, creation]
    })
    return true
  }, [rootId, toast, structureSource])
  const confirmarNovaLinha = useCallback(async (titulo: string) => {
    if (!novaLinha) return
    setStructureOps(previous => [...previous, { id: crypto.randomUUID(), kind: 'create-activity', title: titulo, tempId: `novo-${crypto.randomUUID()}`, refId: novaLinha.refId, relation: novaLinha.tipo }])
    setNovaLinha(null)
  }, [novaLinha])
  const cancelarNovaLinha = useCallback(() => setNovaLinha(null), [])
  async function confirmarExclusao() {
    if (!excluindo) return
    setStructureOps(previous => [...previous, { id: crypto.randomUUID(), kind: 'delete', nodeId: excluindo.nodeId }])
    setExcluindo(null)
  }

  // Total do projeto: soma dos sub-totais, ao vivo.
  const somaFases = (lado: 'orcado' | 'real') =>
    fasesAtuais.reduce((acc, f) => somar(acc, somaDaFase(f, lado, rascunho, elaboradores, planilha.config.horasPorDia)), SOMA_VAZIA)
  const planilhaAtual = useMemo<PlanilhaDeCustos>(() => {
    const valor = fasesAtuais.map(fase => {
      const orcado = somaDaFase(fase, 'orcado', rascunho, elaboradores, planilha.config.horasPorDia)
      const realizado = somaDaFase(fase, 'real', rascunho, elaboradores, planilha.config.horasPorDia)
      return { fase: `${fase.codigo} ${nameDrafts[fase.nodeId] ?? fase.titulo}`, orcado: orcado.total, realizado: realizado.total, minOrcado: orcado.min, minReal: realizado.min }
    })
    const contagem = new Map<string, number>()
    for (const fase of fasesAtuais) for (const atividade of fase.atividades) {
      const ids = idsAtuais(atividade, rascunho)
      for (const id of ids) contagem.set(id, (contagem.get(id) ?? 0) + 1)
    }
    const qtdeAtividades = fasesAtuais.reduce((total, fase) => total + fase.atividades.length, 0)
    return { ...planilha, macrofases: fasesAtuais, qtdeAtividades,
      totalOrcado: round2(valor.reduce((total, fase) => total + fase.orcado, 0)),
      totalReal: round2(valor.reduce((total, fase) => total + fase.realizado, 0)),
      tempoOrcadoTotal: valor.reduce((total, fase) => total + fase.minOrcado, 0),
      tempoRealTotal: valor.reduce((total, fase) => total + fase.minReal, 0),
      quadros: {
        valor: valor.map(({ fase, orcado, realizado }) => ({ fase, orcado, realizado })),
        tempo: valor.map(({ fase, minOrcado, minReal }) => ({ fase, minOrcado, minReal })),
        elaboradores: [...contagem].map(([userId, quantidade]) => ({ elaborador: elaboradores.find(e => e.userId === userId)?.name ?? 'Elaborador', qtdeAtividades: quantidade, percentual: qtdeAtividades ? quantidade / qtdeAtividades * 100 : 0 })),
      },
    }
  }, [planilha, fasesAtuais, rascunho, elaboradores, nameDrafts])
  const planilhaResumo = useDeferredValue(planilhaAtual)
  const fieldLabels: Record<string, string> = { minOrcado: 'Tempo orçado', materiaisOrcado: 'Materiais orçados', dataPrevista: 'Data prevista', materiaisReal: 'Materiais realizados', dataRealizacao: 'Data de realização', elaboradoPorUserIds: 'Elaboradores' }
  const reviewChanges: ReviewChange[] = [
    ...nameChanges.map(change => ({ ...change, chave: `name:${change.chave}` })),
    ...Object.entries(rascunho).flatMap(([nodeId, campos]) => {
      const original = planilha.macrofases.flatMap(f => f.atividades).find(a => a.nodeId === nodeId)
      return Object.entries(campos).filter(([key, value]) => salvo[nodeId]?.[key as keyof CampoLinha] !== value).map(([key, value]) => ({ chave: `field:${nodeId}:${key}`, rotulo: `${original?.codigo ?? 'Nova'} · ${fieldLabels[key] ?? key}`, antes: String(original?.[key as keyof typeof original] ?? ''), depois: value ?? '' }))
    }),
    ...structureOps.map(op => ({ chave: `structure:${op.id}`, rotulo: 'Estrutura da EAP', antes: '', depois: op.kind === 'create-phase' ? `Criar macrofase: ${op.title}` : op.kind === 'create-activity' ? `Criar atividade: ${op.title}` : op.kind === 'delete' ? 'Excluir item' : 'Mover item' })),
  ]
  useEffect(() => { pendenciasRef.current = reviewChanges.length })
  const atividadeDetalhe: AtividadeDetalhe | null = (() => {
    if (!detalheId) return null
    for (const f of fasesAtuais) {
      const a = f.atividades.find(x => x.nodeId === detalheId)
      if (!a) continue
      const elaboradorIds = idsAtuais(a, rascunho)
      const jornada = jornadaDaLinha(elaboradorIds, elaboradores, planilha.config.horasPorDia)
      const realizado = num(rascunho[a.nodeId]?.minReal, a.minReal)
      const manual = a.minRealDigitado
      return {
        nodeId: a.nodeId, codigo: a.codigo, titulo: nameDrafts[a.nodeId] ?? a.titulo,
        descricao: rascunho[a.nodeId]?.descricao ?? a.descricao, elaboradores: a.elaboradoPor, elaboradorIds, card: a.card,
        minReal: realizado, horasReal: hhmm(realizado), diasReal: dois(realizado / 60 / jornada),
        minLegado: manual,
      }
    }
    return null
  })()
  const dataFimProjeto = fmtDataBR(maiorData(fasesAtuais.flatMap(f => f.atividades.map(a => rascunho[a.nodeId]?.dataPrevista ?? a.dataPrevista))))

  async function salvarEstrutura(): Promise<boolean> {
    if (!structureOps.length) return true
    setSalvando(true)
    let aplicadas = 0
    for (const op of structureOps) {
      const resolveId = (id: string) => tempIds.current.get(id) ?? id
      let result: { ok: boolean; error?: string }
      if (op.kind === 'create-phase' || op.kind === 'create-activity') {
        const existingId = tempIds.current.get(op.tempId)
        const created = existingId ? { ok: true as const, nodeId: existingId } : op.kind === 'create-phase'
          ? rootId ? await insertChildAction(projetoId, rootId) : { ok: false as const, error: 'A raiz da EAP não está disponível.' }
          : op.relation === 'irmao' ? await insertSiblingAction(projetoId, resolveId(op.refId)) : await insertChildAction(projetoId, resolveId(op.refId))
        if (created.ok) {
          const renamed = await renameNodeAction(projetoId, created.nodeId, op.title)
          if (renamed.ok) tempIds.current.set(op.tempId, created.nodeId)
          else await deleteNodeAction(projetoId, created.nodeId)
          result = renamed
        } else result = created
      } else if (op.kind === 'move') result = await moveNodeAction(projetoId, { nodeId: resolveId(op.nodeId), targetId: resolveId(op.targetId), position: op.position })
      else result = await deleteNodeAction(projetoId, resolveId(op.nodeId))
      if (!result.ok) {
        const id = op.kind === 'create-phase' || op.kind === 'create-activity' ? op.tempId : op.nodeId
        setSaveErrors(previous => ({ ...previous, [id]: result.error ?? 'Não foi possível aplicar a alteração.' }))
        setStructureOps(previous => previous.filter(item => !structureOps.slice(0, aplicadas).some(applied => JSON.stringify(applied) === JSON.stringify(item))))
        setSalvando(false)
        toast(`Não foi possível salvar a estrutura: ${result.error ?? 'tente novamente.'}`, 'error')
        router.refresh()
        return false
      }
      aplicadas++
    }
    const excluidos = deletedNodeIds(structureOps, planilha.macrofases)
    if (excluidos.size) {
      setRascunho(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !excluidos.has(id))))
      setNameDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !excluidos.has(id))))
    }
    setSaveErrors(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !structureOps.some(op => (op.kind === 'create-phase' || op.kind === 'create-activity' ? op.tempId : op.nodeId) === id))))
    // Retain the committed rows until the refreshed server props arrive.
    const savedPreview = previewStructure(structureSource, structureOps).map(fase => ({ ...fase,
      nodeId: tempIds.current.get(fase.nodeId) ?? fase.nodeId,
      atividades: fase.atividades.map(a => ({ ...a, nodeId: tempIds.current.get(a.nodeId) ?? a.nodeId })),
    }))
    setSavedStructure({ server: latestServer.current, preview: savedPreview, ids: Object.fromEntries(tempIds.current) })
    setStructureOps(previous => previous.filter(op => !structureOps.some(saved => JSON.stringify(saved) === JSON.stringify(op))))
    setSalvando(false)
    return true
  }

  async function salvarManual() {
    if (Object.values(rascunho).some(row => row.minReal !== undefined && (!Number.isFinite(Number(row.minReal.replace(',', '.'))) || num(row.minReal, 0) < 0))) {
      toast('Informe um tempo realizado válido, maior ou igual a zero.', 'error')
      return
    }
    if (structureOps.some(op => op.kind === 'create-phase' && !op.positionChosen)) {
      toast('Escolha o número de cada nova macrofase antes de salvar.', 'error')
      return
    }
    if (savingRef.current) return
    savingRef.current = true
    setSaveStatus('saving')
    let completed = false
    try {
      const excluidos = deletedNodeIds(structureOps, planilha.macrofases)
      if (!(await salvarEstrutura())) return
      if (!(await salvarCampos(excluidos))) return
      const nomesParaSalvar = nameChanges.filter(change => !excluidos.has(change.chave))
      if (nomesParaSalvar.length) {
        setSavingNames(true)
        const falhas: string[] = []
        const salvos: string[] = []
        for (const change of nomesParaSalvar) {
          const result = await renameNodeAction(projetoId, change.chave, change.depois)
          if (!result.ok) falhas.push(`${change.rotulo}: ${result.error}`)
          else salvos.push(change.chave)
        }
        setSavingNames(false)
        if (salvos.length) setNameDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id, title]) => !salvos.includes(id) || nameDrafts[id] !== title)))
        if (falhas.length) { toast(falhas[0], 'error'); return }
        setNameHistory(previous => previous.filter(item => !nameHistory.includes(item)))
        setShowNameChanges(false)
      }
      if (detalheId && tempIds.current.has(detalheId)) setDetalheId(tempIds.current.get(detalheId)!)
      const changedStructure = structureOps.length > 0 || nameChanges.length > 0
      if (changedStructure && canEditLinhas && canUsarCards) {
        const sync = await repetirSincronizacaoAction(projetoId)
        if ('error' in sync) { toast(sync.error, 'warning'); return }
      }
      if (canUsarCards) for (const [nodeId, fields] of Object.entries(rascunho)) {
        if (fields.descricao === undefined || fields.descricao === salvo[nodeId]?.descricao || excluidos.has(nodeId)) continue
        const result = await patchActivityDescriptionAction(projetoId, tempIds.current.get(nodeId) ?? nodeId, fields.descricao)
        if (result.error) {
          setSalvo(previous => { const row = { ...previous[nodeId] }; delete row.descricao; return { ...previous, [nodeId]: row } })
          toast(result.error, 'error')
          return
        }
      }
      for (const [nodeId, priority] of Object.entries(priorityDrafts)) {
        if (excluidos.has(nodeId)) { setPriorityDrafts(previous => { const next = { ...previous }; delete next[nodeId]; return next }); continue }
        const result = await patchActivityPriorityAction(projetoId, tempIds.current.get(nodeId) ?? nodeId, priority)
        if (result.error) { toast(result.error, 'error'); return }
        setPriorityDrafts(previous => { if (previous[nodeId] !== priority) return previous; const next = { ...previous }; delete next[nodeId]; return next })
      }
      for (const [nodeId, files] of Object.entries(fileDrafts)) {
        if (excluidos.has(nodeId) || files.length === 0) continue
        const result = await getActivityCardAction(projetoId, tempIds.current.get(nodeId) ?? nodeId)
        if (!result.cardId) { toast(result.error ?? 'Não foi possível acessar os anexos.', 'error'); return }
        for (const item of files) {
          const form = new FormData()
          form.append('cardId', result.cardId)
          form.append('file', item.file, item.name)
          const response = await fetchWithSession('/api/uploads', { method: 'POST', body: form })
          if (!response.ok) { toast('Não foi possível enviar o anexo. Tente salvar novamente.', 'error'); return }
          setFileDrafts(previous => ({ ...previous, [nodeId]: (previous[nodeId] ?? []).filter(file => file.id !== item.id) }))
        }
      }
      const history = await salvarHistoricoPlanilhaAction(projetoId, dirtyCount > 0 && !changedStructure)
      if (history.error) { toast(history.error, 'error'); return }
      setLastVersion(history.numero)
      // Move drafts to server IDs without replacing values typed during this save.
      const remap = <T,>(entries: Record<string, T>) => Object.keys(entries).some(id => tempIds.current.has(id)) ? Object.fromEntries(Object.entries(entries).map(([id, value]) => [tempIds.current.get(id) ?? id, value])) : entries
      setRascunho(previous => remap(previous))
      setSalvo(previous => remap(previous))
      setFileDrafts(previous => remap(previous))
      setPriorityDrafts(previous => remap(previous))
      setNameDrafts(previous => remap(previous))
      completed = true
      setSaveStatus('saved')
      if (changedStructure || Object.values(fileDrafts).some(files => files.length > 0)) startTransition(() => router.refresh())
      return true
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Não foi possível salvar. Suas alterações continuam pendentes.', 'error')
    } finally {
      if (!completed) setSaveStatus('error')
      savingRef.current = false
    }
  }
  const pendingFields = Object.fromEntries(Object.entries(rascunho).filter(([id, fields]) => JSON.stringify(fields) !== JSON.stringify(salvo[id])))
  const pending = dirtyCount > 0 || nameChanges.length > 0 || structureOps.length > 0 || Object.values(fileDrafts).some(files => files.length > 0) || Object.keys(priorityDrafts).length > 0
  const autosaveKey = JSON.stringify([pendingFields, nameDrafts, structureOps, priorityDrafts, Object.entries(fileDrafts).map(([id, files]) => [id, files.map(file => [file.id, file.name])])])
  const canAutosave = !structureOps.some(op => op.kind === 'create-phase' && !op.positionChosen)
  const lastAutosaveKey = useRef(autosaveKey)
  useEffect(() => {
    if (lastAutosaveKey.current !== autosaveKey) {
      lastAutosaveKey.current = autosaveKey
      setSaveStatus(previous => previous === 'error' ? 'idle' : previous)
    }
  }, [autosaveKey])
  usePlanilhaAutosave({ changeKey: autosaveKey, enabled: pending && canAutosave && saveStatus !== 'error' && !showHistory, save: salvarManual, isSaving: () => savingRef.current })

  const { dialogo: dialogoSaida } = useGuardaSaida(nameChanges.length || dirtyCount || structureOps.length || Object.values(fileDrafts).some(files => files.length > 0) || Object.keys(priorityDrafts).length ? {
    contexto: 'projeto', pendente: true, salvar: () => { void salvarManual() },
    descartar: () => { setFileDrafts({}); setPriorityDrafts({}); setSavedStructure(null); setStructureOps([]); tempIds.current.clear(); setRascunho({}); setSalvo({}); setSaveErrors({}); setNameDrafts({}); setNameHistory([]); setShowNameChanges(false) },
  } : undefined)

  return (
    <ProjectAppearance enabled isolated><div className="planilha-theme px-3 pb-3 pt-1 sm:px-4 sm:pb-4 sm:pt-1">
      {/* ── Cabeçalho (F.1) ─────────────────────────────────────────────── */}
      <div className="planilha-header rounded-xl border px-3 py-2">
        <div className="planilha-header-main">
          <div className="planilha-identity flex min-w-0 items-center gap-2">
            <h1 className="shrink-0 text-sm font-bold">Planilha de Custos</h1>
            <span className="planilha-identity-divider" aria-hidden="true" />
            <p className="planilha-subtitle truncate text-xs" title={nomeProjeto}>{nomeProjeto}</p>
          </div>
          <div className="planilha-period" aria-label={`Período do projeto: data início ${inicioProjeto}, data fim ${fimProjeto}`}>
            <span><small>Data início</small> {inicioProjeto}</span><span aria-hidden="true">→</span><span><small>Data fim</small> {fimProjeto}</span>
          </div>
          <span role="status" aria-live="polite" className="planilha-save-status text-xs text-[var(--ap-muted)]">{saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'error' ? 'Falha ao salvar · tente novamente' : pending ? 'Alterações pendentes' : lastVersion ? `Salvo · ${rotuloVersaoPlanilha(Math.max(initialVersion ?? 0, lastVersion))}` : 'Salvamento automático'}</span>
          <FormActions surface="none" className="planilha-actions">
          <OperumButton type="button" variant="custom" className="planilha-tool" title="Histórico da planilha" aria-label="Histórico da planilha" disabled={saveStatus === 'saving'} onClick={async () => { if (pending && !(await salvarManual())) return; setShowHistory(true) }}><History className="h-4 w-4" /></OperumButton>
          <div className="planilha-action-group">

          <a
            href={exportUrl}
            download
            aria-label="Exportar planilha .xlsx"
            title="Exportar planilha .xlsx"
            className="planilha-export planilha-tool inline-flex items-center justify-center rounded-lg"
          >
            <Download className="h-4 w-4" />
          </a>
          <Dica label="Campos com borda são editáveis. Valores calculados ficam em superfície mais discreta. Min, Horas e Dias realizados mostram o total já registrado. A edição ajusta o total da atividade sem alterar os registros de tempo do card." multiline>
            <OperumButton variant="custom" type="button" aria-label="Como editar a planilha" className="planilha-help planilha-tool inline-flex items-center justify-center rounded-lg"><CircleHelp className="h-4 w-4 shrink-0" /></OperumButton>
          </Dica>
          </div>
          <span className="planilha-action-divider" aria-hidden="true" />
          <div className="planilha-action-group">
          <OperumButton variant="default" type="button" onClick={() => nameHistory.length ? undoNameDraft() : desfazer()} disabled={nameHistory.length === 0 && historia.length === 0} className="planilha-action planilha-tool rounded-lg" aria-label="Desfazer última alteração" title="Desfazer última alteração">
            <Undo2 className="h-4 w-4" />
          </OperumButton>
          {reviewChanges.length > 0 && <OperumButton variant="default" type="button" onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            setReviewAnchor({ left: Math.max(16, Math.min(rect.left, window.innerWidth - 696)), top: rect.bottom + 8, width: Math.min(680, window.innerWidth - 32) })
            setShowNameChanges(v => !v)
          }} aria-expanded={showNameChanges} aria-label={`${reviewChanges.length} alterações não salvas. Revisar alterações`} title="Revisar alterações não salvas" className="planilha-action planilha-tool planilha-review rounded-lg">
            <ListChecks className="h-4 w-4" /><span className="planilha-tool-count">{reviewChanges.length}</span>
          </OperumButton>}
          </div>
          {(canEdit || canEditOwnActual || canEditAllActual || canEditLinhas || canUsarCards) && (pending || saveStatus === 'error') && (
            <OperumButton variant="primary"
              type="button"
              onClick={salvarManual}
              disabled={salvando || savingNames}
              className="planilha-save planilha-tool rounded-lg disabled:opacity-60"
              aria-label={savingNames || salvando ? 'Salvando alterações' : 'Salvar agora'}
              title="Salvar agora"
            >
              <Save className="h-4 w-4" />
            </OperumButton>
          )}
          </FormActions>
        </div>



      </div>
      <ChangesPanel context={{ type: 'spreadsheet', id: projetoId }} floating open={showNameChanges && reviewChanges.length > 0} anchor={reviewAnchor} changes={reviewChanges} onClose={() => setShowNameChanges(false)} onUndo={key => {
        if (key.startsWith('name:')) setNameDrafts(previous => { const next = { ...previous }; delete next[key.slice(5)]; return next })
        else if (key.startsWith('structure:')) setStructureOps(previous => previous.filter(op => op.id !== key.slice(10)))
        else if (key.startsWith('field:')) {
          const [, nodeId, campo] = key.split(':')
          setRascunho(previous => { const next = { ...previous }; const row = { ...next[nodeId] }; delete row[campo as keyof CampoLinha]; if (Object.keys(row).length) next[nodeId] = row; else delete next[nodeId]; return next })
        }
      }} />

      {/* ── Tabela (F.2) ────────────────────────────────────────────────── */}
      <div className={`planilha-area-trabalho mt-3 ${atividadeDetalhe ? 'planilha-area-trabalho--com-detalhe' : ''}`}>
        {semAtividades ? (
          <div className="planilha-empty rounded-xl border p-8 text-center">
            <p className="text-gray-500">Nenhuma atividade derivável da EAP.</p>
            <div className="mt-2 flex justify-center">{canEditLinhas && <OperumButton variant="default" type="button" onClick={() => void criarMacrofase('Nova macrofase')} className="planilha-action planilha-add-macrofase rounded-lg" aria-label="Adicionar macrofase" title="Adicionar macrofase">
            <Plus className="h-4 w-4" />
          </OperumButton>}</div>
            <p className="mt-1 text-sm text-gray-400">Crie macrofases com atividades folha na EAP para gerar a planilha de custos.</p>
          </div>
        ) : (
          <div className="planilha-table-scroll min-w-0 overflow-auto rounded-xl border">
            <table className="planilha-table w-full min-w-[1150px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th rowSpan={2} className="border border-blue-800 px-2 py-2 text-left text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <span>Macrofases</span>
                      {canEditLinhas && <OperumButton variant="default" type="button" onClick={() => void criarMacrofase('Nova macrofase')} className="planilha-action planilha-add-macrofase rounded-lg" aria-label="Adicionar macrofase" title="Adicionar macrofase">
            <Plus className="h-4 w-4" />
          </OperumButton>}
                    </div>
                  </th>
                  <th rowSpan={2} className="planilha-activity-name border border-blue-800 px-2 py-2 text-left text-xs font-semibold">Atividades</th>
                  <th rowSpan={2} className="border border-blue-800 px-2 py-2 text-left text-xs font-semibold">Elaborada por</th>
                  <th colSpan={7} className="border border-blue-800 px-2 py-2 text-center text-xs font-bold">VALOR ORÇADO</th>
                  <th colSpan={8} className="border border-blue-800 px-2 py-2 text-center text-xs font-bold">VALOR REALIZADO</th>
                </tr>
                <tr className="bg-blue-100 text-blue-900">
                  {['Min', 'Horas', 'Dias', 'R$', 'Materiais', 'Total', 'Data Prevista', 'Min', 'Horas', 'Dias', 'R$', 'Materiais', 'Total', 'Data Realização', 'Situação'].map((h, i) => (
                    <th key={i} className="border border-blue-200 px-2 py-1.5 text-center text-[11px] font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fasesAtuais.map(fase => (
                  <FaseFragment
                    key={fase.nodeId}
                    fase={fase}
                    fases={fasesAtuais}
                    nameDrafts={nameDrafts}
                    saveErrors={saveErrors}
                    onNameDraft={(nodeId, title) => {
                      if (nodeId.startsWith('novo-')) {
                        setStructureOps(previous => previous.map(op => (op.kind === 'create-phase' || op.kind === 'create-activity') && op.tempId === nodeId ? { ...op, title } : op))
                      } else setNameDraft(nodeId, title)
                    }}
                    onPhasePosition={(nodeId, position) => {
                      setStructureOps(previous => previous.map(op => op.kind === 'create-phase' && op.tempId === nodeId ? { ...op, positionChosen: true } : op))
                      const others = fasesAtuais.filter(f => f.nodeId !== nodeId)
                      const target = others[Math.min(position - 1, others.length - 1)]
                      if (target) setStructureOps(previous => [...previous, { id: crypto.randomUUID(), kind: 'move', nodeId, targetId: target.nodeId, position: position > others.length ? 'AFTER' : 'BEFORE' }])
                    }}
                    dragged={dragged}
                    dragOverId={dragOverId}
                    onDragStartNode={setDragged}
                    onDragEndNode={() => { setDragged(null); setDragOverId(null) }}
                    onDragOverNode={setDragOverId}
                    onDropNode={dropOn}
                    rascunho={rascunho}
                    canEdit={canEdit}
                    currentUserId={currentUserId}
                    canEditOwnActual={canEditOwnActual}
                    canEditAllActual={canEditAllActual}
                    elaboradores={elaboradores}
                    onCampoChange={setCampo}
                    horasPorDiaPadrao={planilha.config.horasPorDia}
                    acoes={acoes}
                    detalheId={detalheId ?? undefined}
                    priorityDrafts={priorityDrafts}
                    onPriorityDraft={(nodeId, value) => setPriorityDrafts(previous => ({ ...previous, [nodeId]: value }))}
                    canEditPriority={canUsarCards}
                    onPriorityChanged={recarregar}
                    onAbrirDetalhes={setDetalheId}
                    novaLinha={novaLinha && (novaLinha.refId === fase.nodeId || fase.atividades.some(a => a.nodeId === novaLinha.refId)) ? novaLinha : null}
                    onConfirmarNovaLinha={confirmarNovaLinha}
                    onCancelarNovaLinha={cancelarNovaLinha}
                  />
                ))}
                <LinhaSoma rotulo="Total do projeto" orcado={somaFases('orcado')} real={somaFases('real')} dataFim={dataFimProjeto} destaque />
              </tbody>
            </table>
          </div>
        )}
        {atividadeDetalhe && <AtividadeDetalhesPainel draftEditor={atividadeDetalhe.nodeId.startsWith('novo-') ? <AtividadeRascunho
          atividade={atividadeDetalhe} files={fileDrafts[atividadeDetalhe.nodeId] ?? []}
          onFilesChange={files => setFileDrafts(previous => ({ ...previous, [atividadeDetalhe.nodeId]: files }))}
          onDescriptionChange={value => setCampo(atividadeDetalhe.nodeId, 'descricao', value)}
          onTitleChange={title => setStructureOps(previous => previous.map(op => op.kind === 'create-activity' && op.tempId === atividadeDetalhe.nodeId ? { ...op, title } : op))}
          priority={priorityDrafts[atividadeDetalhe.nodeId] ?? 'baixa'}
          onPriorityChange={value => setPriorityDrafts(previous => ({ ...previous, [atividadeDetalhe.nodeId]: value }))}
          canEdit={canUsarCards}
        /> : undefined} key={atividadeDetalhe.nodeId} elaboradores={elaboradores} onElaboradoresChange={canEdit ? ids => setCampo(atividadeDetalhe.nodeId, 'elaboradoPorUserIds', ids.join(',')) : undefined} atividade={atividadeDetalhe} currentUserId={currentUserId} canUsarCards={canUsarCards} onFechar={fecharDetalhe} onAlterado={recarregar} tituloEditavel={canEditLinhas ? <InlineNodeName codigo={atividadeDetalhe.codigo} titulo={atividadeDetalhe.titulo} onDraft={title => {
          if (atividadeDetalhe.nodeId.startsWith('novo-')) setStructureOps(previous => previous.map(op => op.kind === 'create-activity' && op.tempId === atividadeDetalhe.nodeId ? { ...op, title } : op))
          else setNameDraft(atividadeDetalhe.nodeId, title)
        }} /> : undefined} />}
      </div>

      {/* ── Quadros-resumo (F.4) e gráficos, maiores e um embaixo do outro ── */}
      {!semAtividades && (
        <>
          <SobDemandaPlanilha label="quadros-resumo"><div className="planilha-summary-grid mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <QuadroValor planilha={planilhaResumo} />
            <QuadroTempo planilha={planilhaResumo} />
            <QuadroElaborador planilha={planilhaResumo} />
          </div>
          </SobDemandaPlanilha>
          <SobDemandaPlanilha label="gráficos"><GraficosPlanilha3D planilha={planilhaResumo} /></SobDemandaPlanilha>
        </>
      )}

      <ConfirmDialog
        isOpen={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={() => void confirmarExclusao()}
        title="Excluir linha"
        message={`Marcar "${excluindo?.nome ?? ''}" para exclusão? A linha sai da prévia agora. Ao clicar em Salvar, ela será removida da EAP e o card vinculado na sprint também será excluído.`}
      />
      <ExcluirFaseDialog
        projetoId={projetoId}
        fase={faseAExcluir}
        versao={() => undefined}
        onFechar={() => setFaseAExcluir(null)}
        onExcluida={() => {
          setFaseAExcluir(null)
          toast('Macrofase excluída com as atividades dela.')
          recarregar()
        }}
      />
      {showHistory && <HistoricoPlanilha projectId={projetoId} canRestore={canEditLinhas && canUsarCards} onClose={() => setShowHistory(false)} onRestored={numero => { setLastVersion(numero); setRascunho({}); setSalvo({}); setStructureOps([]); setNameDrafts({}); setNameHistory([]); setPriorityDrafts({}); setFileDrafts({}); setDetalheId(null); setSaveStatus('saved'); router.refresh() }} />}
      {dialogoSaida}
    </div></ProjectAppearance>
  )
}


/** Ações estáveis (o FaseFragment é memo); undefined sem permissão. */
function useMemoAcoes(
  pode: boolean,
  setNovaLinha: (v: { tipo: 'irmao' | 'filho'; refId: string } | null) => void,
  setExcluindo: (v: { nodeId: string; nome: string } | null) => void,
  onExcluirFase: AcoesLinha['onExcluirFase'],
  onMover: AcoesLinha['onMover'],
): AcoesLinha | undefined {
  return useMemo(() => pode ? {
    onInserir: (tipo: 'irmao' | 'filho', refId: string) => setNovaLinha({ tipo, refId }),
    onExcluir: (nodeId: string, nome: string) => setExcluindo({ nodeId, nome }),
    onExcluirFase,
    onMover,
  } : undefined, [pode, setNovaLinha, setExcluindo, onExcluirFase, onMover])
}

/** Macrofase já salva a excluir pelo diálogo do cadastro do projeto. */
interface FaseExcluir { nodeId: string; nome: string; numero: string }

/** Ações de linha (inserir/excluir), como no Excel. */
interface AcoesLinha {
  /** Abre a linha de digitação abaixo de `refId` (irmão) ou no fim da fase (filho). */
  onInserir: (tipo: 'irmao' | 'filho', refId: string) => void
  onExcluir: (nodeId: string, nome: string) => void
  /** Abre a confirmação de exclusão da macrofase e de todas as atividades dela. */
  onExcluirFase: (fase: FaseExcluir) => void
  onMover: (nodeId: string, targetId: string, position: 'INSIDE' | 'BEFORE' | 'AFTER') => Promise<boolean>
}

/** Mesmo editor para criar macrofases e atividades. */
function NovoNome({ label, onConfirmar, onCancelar }: { label: string; onConfirmar: (titulo: string) => Promise<boolean | void>; onCancelar: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [busy, setBusy] = useState(false)
  const confirmar = async () => {
    if (!titulo.trim() || busy) return
    setBusy(true)
    try { await onConfirmar(titulo.trim()) } finally { setBusy(false) }
  }
  return (
    <div className="planilha-new-name flex flex-wrap items-center gap-2 rounded-lg p-2">
          <OperumInput
            autoFocus
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void confirmar(); if (e.key === 'Escape') onCancelar() }}
            placeholder={label}
            aria-label={label}
            maxLength={500}
            className="planilha-name-input w-80 max-w-full rounded border px-2 py-1 text-xs"
          />
          <OperumButton variant="primary" type="button" onClick={() => void confirmar()} disabled={busy || !titulo.trim()} className="planilha-inline-button rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50">
            {busy ? 'Inserindo…' : 'Inserir'}
          </OperumButton>
          <OperumButton variant="default" type="button" onClick={onCancelar} className="planilha-inline-button rounded px-2.5 py-1 text-xs">Cancelar</OperumButton>
    </div>
  )
}

/** Linha de digitação do nome de uma atividade nova. */
function NovaLinha({ onConfirmar, onCancelar }: { onConfirmar: (titulo: string) => Promise<void>; onCancelar: () => void }) {
  return (
    <tr className="planilha-new-row">
      <td colSpan={18} className="px-2 py-1">
        <NovoNome label="Nome da nova atividade" onConfirmar={onConfirmar} onCancelar={onCancelar} />
      </td>
    </tr>
  )
}

/** Play/stop do card ligado à atividade: o mesmo timer do quadro da sprint. */


function InlineNodeName({ codigo, titulo, descricao, onDraft, onCommitted, initiallyEditing = false }: { codigo: string; titulo: string; descricao?: string; onDraft?: (title: string) => void; initiallyEditing?: boolean; onCommitted?: () => void }) {
  const [editing, setEditing] = useState(initiallyEditing)
  const [draft, setDraft] = useState(titulo)
  const cancelled = useRef(false)
  const confirmar = () => {
    if (cancelled.current) { cancelled.current = false; return }
    const value = draft.trim()
    if (value && value !== titulo) onDraft?.(value)
    setEditing(false)
    if (value) onCommitted?.()
  }
  if (editing) return <span className="planilha-name-editor inline-flex items-center gap-1">
    <span className="shrink-0">{codigo}</span>
    <OperumInput autoFocus aria-label={`Renomear ${codigo}`} maxLength={500} value={draft} onFocus={e => e.target.select()} onChange={e => setDraft(e.target.value)} onBlur={confirmar} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancelled.current = true; setEditing(false) } }} className="planilha-name-input min-w-[150px] rounded border px-2 py-1 text-xs" />
  </span>
  const nome = <span tabIndex={descricao ? 0 : undefined} title={descricao ? undefined : `${codigo} ${titulo}`} className={`planilha-node-label${descricao ? ' rounded-sm underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-2' : ''}`}>{codigo} {titulo}</span>
  return <span className="planilha-node-name inline-flex min-w-0 items-center gap-1">
    {onDraft ? <OperumButton variant="custom" type="button" onClick={() => { cancelled.current = false; setDraft(titulo); setEditing(true) }} aria-label={`Renomear ${codigo} ${titulo}`} title="Clique para editar o nome" className="planilha-name-trigger rounded px-1 py-0.5 text-left">{descricao ? <Dica label={descricao} multiline>{nome}</Dica> : nome}</OperumButton> : descricao ? <Dica label={descricao} multiline>{nome}</Dica> : nome}
  </span>
}

function DragHandle({ label, nodeId, kind, onStart, onEnd }: { label: string; nodeId: string; kind: 'phase' | 'activity'; onStart: (node: { nodeId: string; kind: 'phase' | 'activity' }) => void; onEnd: () => void }) {
  return <span draggable aria-hidden="true" title={label} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', nodeId); onStart({ nodeId, kind }) }} onDragEnd={onEnd} className="planilha-drag-handle inline-flex cursor-grab items-center justify-center rounded p-1 active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5" /></span>
}



const FaseFragment = memo(function FaseFragment({
  fase, fases, nameDrafts, saveErrors, onNameDraft, onPhasePosition, dragged, dragOverId, onDragStartNode, onDragEndNode, onDragOverNode, onDropNode, rascunho, canEdit, currentUserId, canEditOwnActual, canEditAllActual, elaboradores, onCampoChange, horasPorDiaPadrao,
  acoes, priorityDrafts, onPriorityDraft, canEditPriority, onPriorityChanged, detalheId, onAbrirDetalhes, novaLinha, onConfirmarNovaLinha, onCancelarNovaLinha,
}: {
  priorityDrafts: Record<string, string>
  onPriorityDraft: (nodeId: string, value: string) => void
  canEditPriority: boolean
  onPriorityChanged: () => void
  fase: PlanilhaDeCustos['macrofases'][number]
  fases: PlanilhaDeCustos['macrofases']
  nameDrafts: Record<string, string>
  saveErrors: Record<string, string>
  onPhasePosition: (nodeId: string, position: number) => void
  onNameDraft: (nodeId: string, value: string) => void
  dragged: { nodeId: string; kind: 'phase' | 'activity' } | null
  dragOverId: string | null
  onDragStartNode: (node: { nodeId: string; kind: 'phase' | 'activity' }) => void
  onDragEndNode: () => void
  onDragOverNode: (nodeId: string | null) => void
  onDropNode: (event: DragEvent<HTMLElement>, targetId: string, kind: 'phase' | 'activity') => void
  rascunho: Record<string, CampoLinha>
  canEdit: boolean
  currentUserId?: string
  canEditOwnActual: boolean
  canEditAllActual: boolean
  elaboradores: Elaborador[]
  onCampoChange: (nodeId: string, campo: keyof CampoLinha, valor: string) => void
  /** jornada padrão do projeto (config.horasPorDia) usada quando a linha não tem elaborador com jornada */
  horasPorDiaPadrao: number
  /** Sem permissão para mudar a estrutura da EAP, não há ações de linha. */
  acoes?: AcoesLinha
  /** Abre o painel lateral com etapa, timer e descrição da atividade. */
  detalheId?: string
  onAbrirDetalhes: (nodeId: string) => void
  novaLinha: { tipo: 'irmao' | 'filho'; refId: string } | null
  onConfirmarNovaLinha: (titulo: string) => Promise<void>
  onCancelarNovaLinha: () => void
}) {
  const [rowLimit, setRowLimit] = useState(30)
  const loadMoreRows = useCallback(() => setRowLimit(limit => limit + 30), [])
  // Reveal new rows immediately so insertion can focus the inline title.
  const lastNewRow = fase.atividades.findLastIndex(a => a.nodeId.startsWith('novo-'))
  const visibleRows = Math.max(rowLimit, lastNewRow + 1, fase.atividades.findIndex(a => a.nodeId === detalheId) + 1)
  const [choosingPosition, setChoosingPosition] = useState(false)
  // Draft local de digitação para Horas/Dias/Materiais: enquanto o usuário edita, o campo
  // mostra o texto bruto (em vez de reformatar cada tecla, o que "cortava" a digitação,
  // inclusive no re-render do auto-save). No blur/Enter normaliza.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const pintaDraft = (key: string, texto: string) =>
    setDrafts(d => (d[key] === texto ? d : { ...d, [key]: texto }))
  const limparDraft = (key: string) =>
    setDrafts(d => {
      if (!(key in d)) return d
      const next = { ...d }
      delete next[key]
      return next
    })
  const valorDe = (nodeId: string, campo: keyof CampoLinha, original: string | number | null | undefined): string => {
    const r = rascunho[nodeId]?.[campo]
    if (r !== undefined) return r
    if (original === null || original === undefined) return ''
    return String(original)
  }
  // Situação calculada AO VIVO a partir do rascunho (datas digitadas ainda não salvas),
  // com fallback para os valores originais salvos no servidor.
  const situacaoAtual = (nodeId: string, prev: string | null, real: string | null): SituacaoAtividade => {
    const prevista = valorDe(nodeId, 'dataPrevista', prev).slice(0, 10) || null
    const realizacao = valorDe(nodeId, 'dataRealizacao', real).slice(0, 10) || null
    return situacaoDe(prevista, realizacao)
  }
  // Jornada diária da linha: a menor jornada entre os elaboradores (todos trabalham
  // em paralelo); sem elaborador ou sem jornada cadastrada, a padrão do projeto.
  const texto = (v: string, title = '🔒 Campo calculado ou sem permissão de edição') => <span title={title} className="block px-1 text-xs tabular-nums text-gray-700">{v}</span>
  const clsCampo = 'w-full min-w-[64px] rounded border border-blue-200 bg-white px-1.5 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none'
  const clsData = 'planilha-date-input w-full min-w-[108px] rounded border border-blue-200 bg-white px-1.5 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none'
  const alterarTempo = (nodeId: string, campo: 'minOrcado' | 'minReal', valor: string) => {
    onCampoChange(nodeId, campo, valor)
  }
  const campoInput = (nodeId: string, campo: keyof CampoLinha, original: string | number | null | undefined) => {
    if (campo === 'dataPrevista' || campo === 'dataRealizacao') {
      return (
        <SeletorData
          ariaLabel={campo === 'dataPrevista' ? 'Data prevista da atividade' : 'Data de realização da atividade'}
          value={valorDe(nodeId, campo, original)}
          onChange={v => onCampoChange(nodeId, campo, v)}
          className={clsData}
        />
      )
    }
    return (
      <OperumInput
        type="text"
        inputMode={campo === 'minOrcado' || campo === 'minReal' ? 'numeric' : undefined}
        value={valorDe(nodeId, campo, original)}
        onChange={e => campo === 'minReal' ? alterarTempo(nodeId, campo, e.target.value) : onCampoChange(nodeId, campo, e.target.value)}
        onFocus={e => e.target.select()}
        className={clsCampo}
      />
    )
  }
  // Materiais em moeda (R$ 300,00), com máscara: os centavos entram pela direita.
  const campoMoeda = (nodeId: string, campo: 'materiaisOrcado' | 'materiaisReal', valor: number) => (
    <MoedaInput
      comSimbolo
      aria-label={campo === 'materiaisOrcado' ? 'Materiais orçados' : 'Materiais realizados'}
      rotulo="Materiais"
      value={valor}
      onValueChange={(_, n) => onCampoChange(nodeId, campo, String(n ?? 0))}
      onFocus={e => { const el = e.target; requestAnimationFrame(() => el.select()) }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={clsCampo}
    />
  )
  // Horas editável: com draft local, converte o digitado ("5.5" ou "5:30") para minutos
  // e grava em minOrcado, fazendo Min e Dias atualizarem ao mesmo tempo.
  const campoHoras = (nodeId: string, campo: 'minOrcado' | 'minReal', minAtual: number) => {
    const key = `${nodeId}:${campo}:horas`
    return (
      <OperumInput
        type="text"
        inputMode="decimal"
        value={drafts[key] ?? hhmm(minAtual)}
        onChange={e => {
          const texto = e.target.value
          pintaDraft(key, texto)
          const min = minutosDeHoras(texto)
          if (!Number.isNaN(min)) alterarTempo(nodeId, campo, String(Math.round(min * 100) / 100))
        }}
        onFocus={e => e.target.select()}
        onBlur={() => limparDraft(key)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={clsCampo}
      />
    )
  }
  // Dias editável: converte decimal digitado para minutos (dias × jornada × 60).
  const campoDias = (nodeId: string, campo: 'minOrcado' | 'minReal', minAtual: number, jornada: number) => {
    const key = `${nodeId}:${campo}:dias`
    return (
      <OperumInput
        type="text"
        inputMode="decimal"
        value={drafts[key] ?? dois(minAtual / 60 / jornada)}
        onChange={e => {
          const texto = e.target.value
          pintaDraft(key, texto)
          const min = minutosDeDias(texto, jornada)
          if (!Number.isNaN(min)) alterarTempo(nodeId, campo, String(Math.round(min * 100) / 100))
        }}
        onFocus={e => e.target.select()}
        onBlur={() => limparDraft(key)}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={clsCampo}
      />
    )
  }
  const TITULO_R = 'Valor do minuto do elaborador: salário ÷ 30 ÷ jornada diária ÷ 60, do cadastro do membro em Stakeholders. Com vários elaboradores, a soma.'
  const celulaR = (vpm: number | null) => texto(vpm === null ? '—' : brlMinuto(vpm), vpm === null ? 'Sem valor do minuto: o elaborador não tem salário e jornada cadastrados em Stakeholders.' : TITULO_R)
  const subO = somaDaFase(fase, 'orcado', rascunho, elaboradores, horasPorDiaPadrao)
  const subR = somaDaFase(fase, 'real', rascunho, elaboradores, horasPorDiaPadrao)
  const linhaNova = novaLinha ? <NovaLinha onConfirmar={onConfirmarNovaLinha} onCancelar={onCancelarNovaLinha} /> : null
  return (
    <>
      <tr className="planilha-phase-row bg-gray-100 font-semibold text-gray-800" data-planilha-node={fase.nodeId} data-save-error={!!saveErrors[fase.nodeId] || undefined} data-drop-target={dragOverId === fase.nodeId || undefined} onDragOver={event => { if (dragged && dragged.nodeId !== fase.nodeId) { event.preventDefault(); onDragOverNode(fase.nodeId) } }} onDragLeave={() => { if (dragOverId === fase.nodeId) onDragOverNode(null) }} onDrop={event => onDropNode(event, fase.nodeId, 'phase')}>
        <td colSpan={18} className="planilha-phase-title border border-gray-200 px-3 py-1">
          <div className="planilha-phase-content flex items-center gap-2">
            <InlineNodeName onCommitted={() => { if (fase.nodeId.startsWith('novo-')) setChoosingPosition(true) }} initiallyEditing={!!acoes && fase.nodeId.startsWith('novo-')} codigo={fase.codigo} titulo={nameDrafts[fase.nodeId] ?? fase.titulo} onDraft={acoes ? title => onNameDraft(fase.nodeId, title) : undefined} />
            {choosingPosition && <label className="inline-flex items-center gap-2 text-xs">
              Número da macrofase
              <OperumInput autoFocus type="number" min={1} max={fases.length} step={1}
                aria-label="Número da nova macrofase" defaultValue={fases.findIndex(f => f.nodeId === fase.nodeId) + 1}
                onFocus={event => event.target.select()}
                onBlur={event => {
                  const position = event.target.valueAsNumber
                  if (!Number.isInteger(position) || position < 1 || position > fases.length) {
                    event.target.reportValidity()
                    return
                  }
                  onPhasePosition(fase.nodeId, position)
                  setChoosingPosition(false)
                }}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }}
                className="w-16 rounded border px-2 py-1 text-xs" required
              />
              <span className="font-normal">de 1 a {fases.length} · Enter para confirmar</span>
            </label>}
            {acoes && <div className="planilha-node-controls flex items-center shrink-0 gap-0.5">
              <DragHandle label={`Arrastar macrofase ${fase.titulo}`} nodeId={fase.nodeId} kind="phase" onStart={onDragStartNode} onEnd={onDragEndNode} />
              <OperumButton variant="custom" type="button"
                onClick={() => acoes.onInserir('filho', fase.nodeId)}
                aria-label={`Adicionar tarefa à macrofase ${fase.titulo}`}
                title="Adicionar tarefa"
                className="planilha-add-task inline-flex h-6 w-6 items-center justify-center rounded">
                <Plus className="h-3.5 w-3.5" />
              </OperumButton>
            </div>}
            <span className="planilha-phase-count">{fase.atividades.length} {fase.atividades.length === 1 ? 'atividade' : 'atividades'}</span>
          </div>
        </td>
      </tr>
      {saveErrors[fase.nodeId] && <tr className="planilha-save-error-row"><td colSpan={18} role="alert"><strong>{fase.codigo} {fase.titulo}</strong>: {saveErrors[fase.nodeId]} Ajuste a macrofase e clique em Salvar novamente.</td></tr>}
      {fase.atividades.slice(0, visibleRows).map(a => {
        const canReal = canEditAllActual || (canEditOwnActual && !!currentUserId && idsDaLinha(a).includes(currentUserId))
        const minO = num(rascunho[a.nodeId]?.minOrcado, a.minOrcado)
        const matO = num(rascunho[a.nodeId]?.materiaisOrcado, a.materiaisOrcado)
        const minR = num(rascunho[a.nodeId]?.minReal, a.minReal)
        const matR = num(rascunho[a.nodeId]?.materiaisReal, a.materiaisReal)
        const userIds = idsAtuais(a, rascunho)
        const vpm = vpmDaLinha(userIds, elaboradores)
        const totalO = totalDaLinha(minO, vpm, matO)
        const totalR = totalDaLinha(minR, vpm, matR)
        const horasLinha = jornadaDaLinha(userIds, elaboradores, horasPorDiaPadrao)
        const nome = `${a.codigo} ${a.titulo}`
        const nomeExibido = `${a.codigo} ${nameDrafts[a.nodeId] ?? a.titulo}`
        const rotuloNome = a.descricao
          ? <Dica label={a.descricao} multiline><span tabIndex={0} className="planilha-node-label rounded-sm underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-2">{nomeExibido}</span></Dica>
          : <span className="planilha-node-label" title={nomeExibido}>{nomeExibido}</span>
        return (
          <Fragment key={a.nodeId}>
          <tr className="planilha-activity-row group bg-white align-middle hover:bg-blue-50/30" data-planilha-node={a.nodeId} data-detalhe-aberto={detalheId === a.nodeId || undefined} data-save-error={!!saveErrors[a.nodeId] || undefined} data-drop-target={dragOverId === a.nodeId || undefined} onDragOver={event => { if (dragged?.kind === 'activity' && dragged.nodeId !== a.nodeId) { event.preventDefault(); onDragOverNode(a.nodeId) } }} onDragLeave={() => { if (dragOverId === a.nodeId) onDragOverNode(null) }} onDrop={event => onDropNode(event, a.nodeId, 'activity')}>
            <td className="border border-gray-100 px-1 py-1">
              <div className="flex items-center justify-center gap-1">

                {acoes && (
                  <div className="planilha-node-controls flex items-center justify-center gap-0.5">
                    <DragHandle label={`Arrastar ${nome}`} nodeId={a.nodeId} kind="activity" onStart={onDragStartNode} onEnd={onDragEndNode} />
                    <OperumButton variant="custom" type="button" onClick={() => acoes.onInserir('irmao', a.nodeId)} aria-label={`Adicionar atividade abaixo de ${nome}`} title="Adicionar atividade abaixo" className="planilha-add-task inline-flex h-6 w-6 items-center justify-center rounded"><Plus className="h-3.5 w-3.5" /></OperumButton>
                    <OperumButton variant="custom" type="button" onClick={() => acoes.onExcluir(a.nodeId, nome)} aria-label={`Excluir atividade ${nome}`} title="Excluir atividade" className="planilha-add-task inline-flex h-6 w-6 items-center justify-center rounded"><Trash2 className="h-3.5 w-3.5" /></OperumButton>
                  </div>
                )}
              </div>
            </td>
            {/* Largura limitada: nomes longos quebram em até 3 linhas; o nome completo aparece ao passar o mouse. */}
            <td className="planilha-activity-name border border-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
              <div className="planilha-activity-cell">
                {a.nodeId.startsWith('novo-') ? (
                  <InlineNodeName initiallyEditing codigo={a.codigo} titulo={a.titulo} onDraft={title => onNameDraft(a.nodeId, title)} />
                ) : (
                  <OperumButton variant="custom" type="button" onClick={() => onAbrirDetalhes(a.nodeId)} aria-expanded={detalheId === a.nodeId} className="planilha-node-name planilha-name-trigger rounded px-1 py-0.5 text-left">
                    {rotuloNome}
                  </OperumButton>
                )}
                {(a.card || a.nodeId.startsWith('novo-')) && <PrioridadeAtividade key={a.card ? `${a.card.id}:${a.card.priority}` : a.nodeId} card={a.card} draftPriority={priorityDrafts[a.nodeId]} onDraft={!a.card ? value => onPriorityDraft(a.nodeId, value) : undefined} nome={nome} canEdit={canEditPriority} onChanged={onPriorityChanged} />}
                <OperumButton variant="custom" type="button" onClick={() => onAbrirDetalhes(a.nodeId)} aria-label={`Detalhes de ${nome}`} aria-expanded={detalheId === a.nodeId} title="Descrição, tempo e etapa na sprint" className="planilha-detalhes-trigger">
                    <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  </OperumButton>
              </div>
            </td>
            <td className="border border-gray-100 px-1 py-1">
              {canEdit ? (
                <ElaboradoresSelect
                  tarefa={a.titulo}
                  value={userIds}
                  options={elaboradores}
                  onChange={ids => onCampoChange(a.nodeId, 'elaboradoPorUserIds', ids.join(','))}
                />
              ) : texto(a.elaboradoPor)}
            </td>
            <td className="border border-gray-100 px-1 py-1 text-right">
              {canEdit ? campoInput(a.nodeId, 'minOrcado', a.minOrcado) : texto(String(a.minOrcado))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">
              {canEdit ? campoHoras(a.nodeId, 'minOrcado', minO) : texto(hhmm(minO))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">
              {canEdit ? campoDias(a.nodeId, 'minOrcado', minO, horasLinha) : texto(dois(minO / 60 / horasLinha))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">{celulaR(vpm)}</td>
            <td className="border border-gray-100 px-1 py-1 text-right">
              {canEdit ? campoMoeda(a.nodeId, 'materiaisOrcado', matO) : texto(brl(matO))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right font-semibold text-gray-900">{texto(totalO === null ? '—' : brl(totalO), 'Total = (Min × R$) + Materiais')}</td>
            <td className="border border-gray-100 px-1 py-1 w-[116px] min-w-[116px]">
              {canEdit ? campoInput(a.nodeId, 'dataPrevista', a.dataPrevista) : texto(fmtDataBR(a.dataPrevista))}
            </td>
            <td className="border border-gray-100 px-1 py-1 text-right">
              {canReal ? campoInput(a.nodeId, 'minReal', Math.round(a.minReal * 100) / 100) : texto(formatarMinutos(minR))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">
              {canReal ? campoHoras(a.nodeId, 'minReal', minR) : texto(hhmm(minR))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">
              {canReal ? campoDias(a.nodeId, 'minReal', minR, horasLinha) : texto(dois(minR / 60 / horasLinha))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">{celulaR(vpm)}</td>
            <td className="border border-gray-100 px-1 py-1 text-right">
              {canReal ? campoMoeda(a.nodeId, 'materiaisReal', matR) : texto(brl(matR))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right font-semibold text-gray-900">{texto(totalR === null ? '—' : brl(totalR), 'Total = (Min realizados × R$) + Materiais')}</td>
            <td className="border border-gray-100 px-1 py-1 w-[116px] min-w-[116px]">
              {canReal ? campoInput(a.nodeId, 'dataRealizacao', a.dataRealizacao) : texto(fmtDataBR(a.dataRealizacao))}
            </td>
            <td className="border border-gray-100 px-1 py-1 text-center">
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${SITUACAO_CLASS[situacaoAtual(a.nodeId, a.dataPrevista, a.dataRealizacao)]}`}>
                {situacaoAtual(a.nodeId, a.dataPrevista, a.dataRealizacao)}
              </span>
            </td>
          </tr>
          {saveErrors[a.nodeId] && <tr className="planilha-save-error-row"><td colSpan={18} role="alert"><strong>{nome}</strong> · {Object.keys(rascunho[a.nodeId] ?? {}).map(campo => ({ minReal: 'tempo realizado manual', minOrcado: 'tempo orçado', materiaisOrcado: 'materiais orçados', dataPrevista: 'data prevista', materiaisReal: 'materiais realizados', dataRealizacao: 'data de realização', elaboradoPorUserIds: 'elaboradores' }[campo] ?? campo)).join(', ')}: {saveErrors[a.nodeId]} Corrija os dados e clique em Salvar novamente.</td></tr>}

          {novaLinha?.tipo === 'irmao' && novaLinha.refId === a.nodeId && linhaNova}
          </Fragment>
        )
      })}
      {novaLinha?.tipo === 'filho' && novaLinha.refId === fase.nodeId && linhaNova}
      {visibleRows < fase.atividades.length && <MaisAtividadesPlanilha remaining={fase.atividades.length - visibleRows} onLoad={loadMoreRows} />}
      <LinhaSoma
        rotulo="Sub-total"
        orcado={subO}
        real={subR}
        dataFim={fmtDataBR(maiorData(fase.atividades.map(a => valorDe(a.nodeId, 'dataPrevista', a.dataPrevista))))}
      />
    </>
  )
})

/** Linha de soma (Sub-total da fase ou Total do projeto): Min, Horas, Dias, Materiais e Total. */
function LinhaSoma({ rotulo, orcado, real, dataFim, destaque = false }: { rotulo: string; orcado: Soma; real: Soma; dataFim: string; destaque?: boolean }) {
  const cel = (v: string) => <span className="block px-1 text-xs tabular-nums">{v}</span>
  const borda = destaque ? 'border border-blue-300' : 'border border-gray-200'
  const lado = (s: Soma) => (
    <>
      <td className={`${borda} px-2 py-1 text-right`}>{cel(formatarMinutos(s.min))}</td>
      <td className={`${borda} px-2 py-1 text-right`}>{cel(hhmm(s.min))}</td>
      <td className={`${borda} px-2 py-1 text-right`}>{cel(dois(s.dias))}</td>
      <td className={`${borda} px-2 py-1`}></td>
      <td className={`${borda} px-2 py-1 text-right`}>{cel(brl(s.materiais))}</td>
      <td className={`${borda} px-2 py-1 text-right`}>{cel(s.temTotal ? brl(s.total) : '—')}</td>
    </>
  )
  return (
    <tr className={destaque ? 'planilha-total-row bg-blue-100 font-bold text-blue-950' : 'planilha-subtotal-row bg-gray-200/70 font-semibold text-gray-700'}>
      <td colSpan={3} className={`${borda} px-3 py-1 text-right text-xs ${destaque ? 'uppercase tracking-wide' : 'italic'}`}>{rotulo}</td>
      {lado(orcado)}
      {/* Data fim (fase ou projeto): a maior data prevista das atividades, ao vivo. */}
      <td className={`${borda} px-2 py-1 text-center`} title="Data fim: maior data prevista">{cel(dataFim)}</td>
      {lado(real)}
      <td colSpan={2} className={borda}></td>
    </tr>
  )
}

const QuadroValor = memo(function QuadroValor({ planilha }: { planilha: PlanilhaDeCustos }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-800">Resumo — Valor por Fase do Projeto</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-blue-600 text-white">
            <th className="px-3 py-2 text-left text-xs font-semibold">Fases do Projeto</th>
            <th className="px-3 py-2 text-right text-xs font-semibold">Valor Orçado</th>
            <th className="px-3 py-2 text-right text-xs font-semibold">Valor Real</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {planilha.quadros.valor.map(v => (
            <tr key={v.fase}>
              <td className="px-3 py-1.5 text-gray-800">{v.fase}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{brl(v.orcado)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{brl(v.realizado)}</td>
            </tr>
          ))}
          <tr className="bg-gray-100 font-bold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{brl(planilha.totalOrcado)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{brl(planilha.totalReal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
})

const QuadroTempo = memo(function QuadroTempo({ planilha }: { planilha: PlanilhaDeCustos }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-800">Resumo — Tempo por Fase do Projeto</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-blue-600 text-white">
            <th className="px-3 py-2 text-left text-xs font-semibold">Fases do Projeto</th>
            <th className="px-3 py-2 text-right text-xs font-semibold">Tempo Orçado (Min.)</th>
            <th className="px-3 py-2 text-right text-xs font-semibold">Tempo Real (Min.)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {planilha.quadros.tempo.map(t => (
            <tr key={t.fase}>
              <td className="px-3 py-1.5 text-gray-800">{t.fase}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatarMinutos(t.minOrcado)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatarMinutos(t.minReal)}</td>
            </tr>
          ))}
          <tr className="bg-gray-100 font-bold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatarMinutos(planilha.tempoOrcadoTotal)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatarMinutos(planilha.tempoRealTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
})

const QuadroElaborador = memo(function QuadroElaborador({ planilha }: { planilha: PlanilhaDeCustos }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-800">Resumo — Distribuição por Elaborador</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-blue-600 text-white">
            <th className="px-3 py-2 text-left text-xs font-semibold">Elaborador por</th>
            <th className="px-3 py-2 text-right text-xs font-semibold">Qtde. Atividades</th>
            <th className="px-3 py-2 text-right text-xs font-semibold">Percentual</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {planilha.quadros.elaboradores.map(e => (
            <tr key={e.elaborador}>
              <td className="px-3 py-1.5 text-gray-800">{e.elaborador}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{e.qtdeAtividades}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{e.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
            </tr>
          ))}
          <tr className="bg-gray-100 font-bold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{planilha.qtdeAtividades}</td>
            <td className="px-3 py-2 text-right tabular-nums">100%</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
})

/** Gráficos dos três quadros-resumo. A área das fases rola quando a lista cresce. */
