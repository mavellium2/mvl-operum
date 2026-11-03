'use client'

import FormActions from '@/components/ui/FormActions'
import ChangesPanel, { type ReviewChange } from '@/components/ui/ChangesPanel'
import GlassPopover from '@/components/ui/GlassPopover'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import Select from '@/components/ui/Select'
import MoedaInput from '@/components/ui/MoedaInput'
import { parseMoeda as parseMoedaLib } from '@/lib/dinheiro'
import Dica from '@/components/ui/Tooltip'
import ElaboradoresSelect from './ElaboradoresSelect'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { menorJornada, somaValoresPorMinuto } from '@/lib/elaboradores'

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Undo2, Plus, CircleHelp, Ellipsis, Save, ListChecks, GripVertical } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import { useGuardaSaida } from '@/components/documentos/editor/GuardaSaida'
import DateInput from '@/components/ui/DateInput'
import './planilha-custos.css'
import { updateNodePropertiesAction, insertChildAction, insertSiblingAction, renameNodeAction, deleteNodeAction, moveNodeAction } from '@/app/actions/wbs'
import { fmtDataBR, maiorData, situacaoDe, valorPorMinutoDoElaborador, type PlanilhaDeCustos, type SituacaoAtividade, type Elaborador } from '@/lib/planilhaCustos'
import { minutosDeHoras, minutosDeDias, round2 } from '@/lib/custosCalc'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from 'recharts'

interface Props {
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
  rootId?: string | null
  planilha: PlanilhaDeCustos
  elaboradores: Elaborador[]
  exportUrl: string
}

type CampoLinha = Partial<{
  minOrcado: string
  materiaisOrcado: string
  dataPrevista: string
  minReal: string
  materiaisReal: string
  dataRealizacao: string
  /** Ids separados por vírgula (o rascunho guarda texto). */
  elaboradoPorUserIds: string
  elaboradoPor: string
}>

type StructureOp =
  | { id: string; kind: 'create-phase'; title: string; tempId: string }
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
      fases = [...fases, { nodeId: op.tempId, codigo: 'Nova', titulo: op.title, atividades: [], minOrcado: 0, materiaisOrcado: 0, totalOrcado: 0, minReal: 0, materiaisReal: 0, totalReal: 0, dataFim: null }]
    } else if (op.kind === 'create-activity') {
      const atividade: PlanilhaDeCustos['macrofases'][number]['atividades'][number] = { nodeId: op.tempId, codigo: 'Nova', titulo: op.title, descricao: '', elaboradoPor: '', elaboradoPorUserId: null, elaboradoPorUserIds: [], vpm: null, jornadaDiaria: null, minOrcado: 0, materiaisOrcado: 0, dataPrevista: null, rOrcado: null, totalOrcado: null, minReal: 0, materiaisReal: 0, dataRealizacao: null, rReal: null, totalReal: null, situacao: 'Pendente' }
      fases = fases.map(f => f.nodeId === op.refId && op.relation === 'filho' ? { ...f, atividades: [...f.atividades, atividade] } : op.relation === 'irmao' && f.atividades.some(a => a.nodeId === op.refId) ? { ...f, atividades: f.atividades.flatMap(a => a.nodeId === op.refId ? [a, atividade] : [a]) } : f)
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
  return fases
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

const CORES_PIE = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#dc2626', '#0d9488', '#ca8a04', '#4f46e5']

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
    const min = lado === 'orcado' ? num(r?.minOrcado, a.minOrcado) : a.tempoRealDosCards ? a.minReal : num(r?.minReal, a.minReal)
    const materiais = lado === 'orcado' ? num(r?.materiaisOrcado, a.materiaisOrcado) : num(r?.materiaisReal, a.materiaisReal)
    const ids = idsAtuais(a, rascunho)
    const horas = menorJornada(ids.map(id => elaboradores.find(x => x.userId === id)?.horasDiarias)) ?? horasPorDiaPadrao
    const total = totalDaLinha(min, vpmDaLinha(ids, elaboradores), materiais)
    soma = somar(soma, { min, dias: round2(min / 60 / horas), materiais, total: total ?? 0, temTotal: total !== null })
  }
  return soma
}

export default function PlanilhaCustosView({
  projetoId, nomeProjeto, inicioProjeto, fimProjeto, canEdit, currentUserId, canEditOwnActual = false, canEditAllActual = false, canEditLinhas = false, rootId, planilha, elaboradores, exportUrl,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [rascunho, setRascunho] = useState<Record<string, CampoLinha>>({})
  const [historia, setHistoria] = useState<Record<string, CampoLinha>[]>([])
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState<Record<string, CampoLinha>>({})
  const [mostrarNovaMacrofase, setMostrarNovaMacrofase] = useState(false)
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({})
  const [nameHistory, setNameHistory] = useState<Record<string, string>[]>([])
  const [showNameChanges, setShowNameChanges] = useState(false)
  const [reviewAnchor, setReviewAnchor] = useState<{ left: number; top: number; width: number } | undefined>()
  const [savingNames, setSavingNames] = useState(false)
  const savingRef = useRef(false)
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const [structureOps, setStructureOps] = useState<StructureOp[]>([])
  const tempIds = useRef(new Map<string, string>())
  const [dragged, setDragged] = useState<{ nodeId: string; kind: 'phase' | 'activity' } | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const fasesAtuais = useMemo(() => previewStructure(planilha.macrofases, structureOps), [planilha.macrofases, structureOps])
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
        if (!fasesAtuais.some(f => f.nodeId === nodeId || f.atividades.some(a => a.nodeId === nodeId))) continue
        if (JSON.stringify(salvo[nodeId]) === JSON.stringify(campos)) continue
        const props: Record<string, unknown> = {}
        if (campos.minOrcado !== undefined) props.tempoMinutos = Math.round(num(campos.minOrcado, 0))
        if (campos.materiaisOrcado !== undefined) props.materiais = Math.round(num(campos.materiaisOrcado, 0) * 100) / 100
        if (campos.dataPrevista !== undefined) props.dataPrevista = campos.dataPrevista || null
        if (campos.minReal !== undefined) props.tempoRealMinutos = Math.round(num(campos.minReal, 0))
        if (campos.materiaisReal !== undefined) props.materiaisReal = Math.round(num(campos.materiaisReal, 0) * 100) / 100
        if (campos.dataRealizacao !== undefined) props.dataRealizacao = campos.dataRealizacao || null
        // Nomes e responsáveis do card são acertados no servidor (ADR-044).
        if (campos.elaboradoPorUserIds !== undefined) props.elaboradoPorUserIds = lista(campos.elaboradoPorUserIds)

        const res = await updateNodePropertiesAction(projetoId, tempIds.current.get(nodeId) ?? nodeId, props)
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
  const acoes = useMemoAcoes(canEditLinhas, setNovaLinha, setExcluindo, (nodeId, targetId, position) => {
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
    setStructureOps(previous => [...previous, { id: crypto.randomUUID(), kind: 'create-phase', title: titulo, tempId: `novo-${crypto.randomUUID()}` }])
    setMostrarNovaMacrofase(false)
    return true
  }, [rootId, toast])
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
  const fieldLabels: Record<string, string> = { minOrcado: 'Tempo orçado', materiaisOrcado: 'Materiais orçados', dataPrevista: 'Data prevista', minReal: 'Tempo realizado', materiaisReal: 'Materiais realizados', dataRealizacao: 'Data de realização', elaboradoPorUserIds: 'Elaboradores' }
  const reviewChanges: ReviewChange[] = [
    ...nameChanges.map(change => ({ ...change, chave: `name:${change.chave}` })),
    ...Object.entries(rascunho).flatMap(([nodeId, campos]) => {
      const original = planilha.macrofases.flatMap(f => f.atividades).find(a => a.nodeId === nodeId)
      return Object.entries(campos).filter(([key, value]) => salvo[nodeId]?.[key as keyof CampoLinha] !== value).map(([key, value]) => ({ chave: `field:${nodeId}:${key}`, rotulo: `${original?.codigo ?? 'Nova'} · ${fieldLabels[key] ?? key}`, antes: String(original?.[key as keyof typeof original] ?? ''), depois: value ?? '' }))
    }),
    ...structureOps.map(op => ({ chave: `structure:${op.id}`, rotulo: 'Estrutura da EAP', antes: '', depois: op.kind === 'create-phase' ? `Criar macrofase: ${op.title}` : op.kind === 'create-activity' ? `Criar atividade: ${op.title}` : op.kind === 'delete' ? 'Excluir item' : 'Mover item' })),
  ]
  const dataFimProjeto = fmtDataBR(maiorData(fasesAtuais.flatMap(f => f.atividades.map(a => rascunho[a.nodeId]?.dataPrevista ?? a.dataPrevista))))

  async function salvarEstrutura(): Promise<boolean> {
    if (!structureOps.length) return true
    setSalvando(true)
    let aplicadas = 0
    for (const op of structureOps) {
      const resolveId = (id: string) => tempIds.current.get(id) ?? id
      let result: { ok: boolean; error?: string }
      if (op.kind === 'create-phase' || op.kind === 'create-activity') {
        const created = op.kind === 'create-phase'
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
        setStructureOps(previous => previous.slice(aplicadas))
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
    setStructureOps([])
    setSalvando(false)
    router.refresh()
    return true
  }

  async function salvarManual() {
    if (savingRef.current) return
    savingRef.current = true
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
        if (salvos.length) setNameDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !salvos.includes(id))))
        if (falhas.length) { toast(falhas[0], 'error'); return }
        setNameHistory([])
        setShowNameChanges(false)
      }
      tempIds.current.clear()
      router.refresh()
    } finally {
      savingRef.current = false
    }
  }
  const { dialogo: dialogoSaida } = useGuardaSaida(nameChanges.length || dirtyCount || structureOps.length ? {
    contexto: 'projeto', pendente: true, salvar: () => { void salvarManual() },
    descartar: () => { setStructureOps([]); tempIds.current.clear(); setRascunho({}); setSalvo({}); setSaveErrors({}); setNameDrafts({}); setNameHistory([]); setShowNameChanges(false) },
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
          <FormActions surface="none" className="planilha-actions">
          <div className="planilha-action-group">
          {canEditLinhas && <OperumButton variant="default" type="button" onClick={() => setMostrarNovaMacrofase(v => !v)} className="planilha-action planilha-tool rounded-lg" aria-label="Adicionar macrofase" title="Adicionar macrofase" aria-expanded={mostrarNovaMacrofase}>
            <Plus className="h-4 w-4" />
          </OperumButton>}
          <a
            href={exportUrl}
            download
            aria-label="Exportar planilha .xlsx"
            title="Exportar planilha .xlsx"
            className="planilha-export planilha-tool inline-flex items-center justify-center rounded-lg"
          >
            <Download className="h-4 w-4" />
          </a>
          <Dica label="Campos com borda são editáveis. Valores calculados ficam em superfície mais discreta. Quando houver apontamentos no card, corrija o tempo realizado nos registros do próprio card." multiline>
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
          {(canEdit || canEditOwnActual || canEditAllActual || canEditLinhas) && (dirtyCount > 0 || nameChanges.length > 0 || structureOps.length > 0) && (
            <OperumButton variant="primary"
              type="button"
              onClick={salvarManual}
              disabled={salvando || savingNames}
              className="planilha-save planilha-tool rounded-lg disabled:opacity-60"
              aria-label={savingNames || salvando ? 'Salvando alterações' : 'Salvar alterações'}
              title="Salvar alterações"
            >
              <Save className="h-4 w-4" />
            </OperumButton>
          )}
          </FormActions>
        </div>

        {mostrarNovaMacrofase && (
          <NovoNome
            label="Nome da nova macrofase"
            onConfirmar={criarMacrofase}
            onCancelar={() => setMostrarNovaMacrofase(false)}
          />
        )}

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
      {semAtividades ? (
        <div className="planilha-empty mt-4 rounded-xl border p-8 text-center">
          <p className="text-gray-500">Nenhuma atividade derivável da EAP.</p>
          <p className="mt-1 text-sm text-gray-400">Crie macrofases com atividades folha na EAP para gerar a planilha de custos.</p>
        </div>
      ) : (
        <div className="planilha-table-scroll mt-3 overflow-auto rounded-xl border">
          <table className="planilha-table w-full min-w-[1150px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th rowSpan={2} className="border border-blue-800 px-2 py-2 text-left text-xs font-semibold">Macrofases</th>
                <th rowSpan={2} className="border border-blue-800 px-2 py-2 text-left text-xs font-semibold">Atividades</th>
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
                  onNameDraft={setNameDraft}
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

      {/* ── Quadros-resumo (F.4) e gráficos, maiores e um embaixo do outro ── */}
      {!semAtividades && (
        <>
          <div className="planilha-summary-grid mt-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
            <QuadroValor planilha={planilhaAtual} />
            <QuadroTempo planilha={planilhaAtual} />
            <QuadroElaborador planilha={planilhaAtual} />
          </div>
          <Graficos planilha={planilhaAtual} />
        </>
      )}

      <ConfirmDialog
        isOpen={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={() => void confirmarExclusao()}
        title="Excluir linha"
        message={`Marcar "${excluindo?.nome ?? ''}" para exclusão? A linha sai da prévia agora. Ao clicar em Salvar, ela será removida da EAP e o card vinculado na sprint também será excluído.`}
      />
      {dialogoSaida}
    </div></ProjectAppearance>
  )
}


/** Ações estáveis (o FaseFragment é memo); undefined sem permissão. */
function useMemoAcoes(
  pode: boolean,
  setNovaLinha: (v: { tipo: 'irmao' | 'filho'; refId: string } | null) => void,
  setExcluindo: (v: { nodeId: string; nome: string } | null) => void,
  onMover: AcoesLinha['onMover'],
): AcoesLinha | undefined {
  return useMemo(() => pode ? {
    onInserir: (tipo: 'irmao' | 'filho', refId: string) => setNovaLinha({ tipo, refId }),
    onExcluir: (nodeId: string, nome: string) => setExcluindo({ nodeId, nome }),
    onMover,
  } : undefined, [pode, setNovaLinha, setExcluindo, onMover])
}

/** Ações de linha (inserir/excluir), como no Excel. */
interface AcoesLinha {
  /** Abre a linha de digitação abaixo de `refId` (irmão) ou no fim da fase (filho). */
  onInserir: (tipo: 'irmao' | 'filho', refId: string) => void
  onExcluir: (nodeId: string, nome: string) => void
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

function InlineNodeName({ codigo, titulo, descricao, onDraft }: { codigo: string; titulo: string; descricao?: string; onDraft?: (title: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(titulo)
  const cancelled = useRef(false)
  const confirmar = () => {
    if (cancelled.current) { cancelled.current = false; return }
    const value = draft.trim()
    if (value && value !== titulo) onDraft?.(value)
    setEditing(false)
  }
  if (editing) return <span className="planilha-name-editor inline-flex items-center gap-1">
    <span className="shrink-0">{codigo}</span>
    <OperumInput autoFocus aria-label={`Renomear ${codigo}`} maxLength={500} value={draft} onFocus={e => e.target.select()} onChange={e => setDraft(e.target.value)} onBlur={confirmar} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { cancelled.current = true; setEditing(false) } }} className="planilha-name-input min-w-[150px] rounded border px-2 py-1 text-xs" />
  </span>
  const nome = <span tabIndex={descricao ? 0 : undefined} className={descricao ? 'rounded-sm underline decoration-dotted underline-offset-2 focus-visible:outline focus-visible:outline-2' : ''}>{codigo} {titulo}</span>
  return <span className="planilha-node-name inline-flex min-w-0 items-center gap-1">
    {onDraft ? <OperumButton variant="custom" type="button" onClick={() => { cancelled.current = false; setDraft(titulo); setEditing(true) }} aria-label={`Renomear ${codigo} ${titulo}`} title="Clique para editar o nome" className="planilha-name-trigger rounded px-1 py-0.5 text-left">{descricao ? <Dica label={descricao} multiline>{nome}</Dica> : nome}</OperumButton> : descricao ? <Dica label={descricao} multiline>{nome}</Dica> : nome}
  </span>
}

function DragHandle({ label, nodeId, kind, onStart, onEnd }: { label: string; nodeId: string; kind: 'phase' | 'activity'; onStart: (node: { nodeId: string; kind: 'phase' | 'activity' }) => void; onEnd: () => void }) {
  return <span draggable aria-hidden="true" title={label} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', nodeId); onStart({ nodeId, kind }) }} onDragEnd={onEnd} className="planilha-drag-handle inline-flex cursor-grab items-center justify-center rounded p-1 active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5" /></span>
}

function NodeActionsMenu({ label, actions }: { label: string; actions: { label: string; onClick: () => void; disabled?: boolean; tone?: 'danger' }[] }) {
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return <>
    <OperumButton ref={anchor} variant="custom" type="button" onClick={() => setOpen(v => !v)} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} className="planilha-icon-action rounded p-1"><Ellipsis className="h-4 w-4" /></OperumButton>
    <GlassPopover open={open} onClose={() => setOpen(false)} anchor={anchor} label={label}>
      <div className="planilha-node-menu flex flex-col gap-1">{actions.map(action => <OperumButton key={action.label} variant="custom" type="button" disabled={action.disabled} onClick={() => { setOpen(false); action.onClick() }} className={`rounded-lg px-3 py-2 text-left text-xs ${action.tone === 'danger' ? 'planilha-menu-danger' : ''}`}>{action.label}</OperumButton>)}</div>
    </GlassPopover>
  </>
}

function MoveActivityRow({ fases, onMover, onCancelar }: { fases: PlanilhaDeCustos['macrofases']; onMover: (targetId: string) => Promise<boolean>; onCancelar: () => void }) {
  const [targetId, setTargetId] = useState(fases[0]?.nodeId ?? '')
  const [busy, setBusy] = useState(false)
  return <tr className="planilha-new-row"><td colSpan={18} className="px-2 py-1"><div className="planilha-new-name flex flex-wrap items-center gap-2 rounded-lg p-2">
    <span className="text-xs font-semibold">Mover atividade para</span>
    <Select compact ariaLabel="Macrofase de destino" className="min-w-[220px]" value={targetId} onChange={setTargetId} options={fases.map(f => ({ value: f.nodeId, label: `${f.codigo} ${f.titulo}` }))} />
    <OperumButton variant="primary" type="button" disabled={busy || !targetId} onClick={async () => { setBusy(true); try { await onMover(targetId) } finally { setBusy(false) } }} className="planilha-inline-button rounded px-2.5 py-1 text-xs">{busy ? 'Movendo…' : 'Mover'}</OperumButton>
    <OperumButton variant="default" type="button" onClick={onCancelar} className="planilha-inline-button rounded px-2.5 py-1 text-xs">Cancelar</OperumButton>
  </div></td></tr>
}

const FaseFragment = memo(function FaseFragment({
  fase, fases, nameDrafts, saveErrors, onNameDraft, dragged, dragOverId, onDragStartNode, onDragEndNode, onDragOverNode, onDropNode, rascunho, canEdit, currentUserId, canEditOwnActual, canEditAllActual, elaboradores, onCampoChange, horasPorDiaPadrao,
  acoes, novaLinha, onConfirmarNovaLinha, onCancelarNovaLinha,
}: {
  fase: PlanilhaDeCustos['macrofases'][number]
  fases: PlanilhaDeCustos['macrofases']
  nameDrafts: Record<string, string>
  saveErrors: Record<string, string>
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
  novaLinha: { tipo: 'irmao' | 'filho'; refId: string } | null
  onConfirmarNovaLinha: (titulo: string) => Promise<void>
  onCancelarNovaLinha: () => void
}) {
  const [moverAtividade, setMoverAtividade] = useState<string | null>(null)
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
  const horasDe = (userIds: string[]): number =>
    menorJornada(userIds.map(id => elaboradores.find(x => x.userId === id)?.horasDiarias)) ?? horasPorDiaPadrao
  const texto = (v: string, title = '🔒 Campo calculado ou sem permissão de edição') => <span title={title} className="block rounded bg-gray-100 px-1 text-xs tabular-nums text-gray-700">{v}</span>
  const clsCampo = 'w-full min-w-[64px] rounded border border-blue-200 bg-white px-1.5 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none'
  const clsData = 'w-full min-w-[124px] rounded border border-blue-200 bg-white px-1.5 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none'
  const campoInput = (nodeId: string, campo: keyof CampoLinha, original: string | number | null | undefined) => {
    if (campo === 'dataPrevista' || campo === 'dataRealizacao') {
      return (
        <DateInput
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
        onChange={e => onCampoChange(nodeId, campo, e.target.value)}
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
  // e grava em minOrcado/minReal, fazendo Min e Dias atualizarem ao mesmo tempo.
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
          if (!Number.isNaN(min)) onCampoChange(nodeId, campo, String(min))
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
          if (!Number.isNaN(min)) onCampoChange(nodeId, campo, String(min))
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
        <td colSpan={18} className="border border-gray-200 px-3 py-1 text-sm">
          <div className="planilha-phase-content flex items-center gap-2">
            <InlineNodeName codigo={fase.codigo} titulo={nameDrafts[fase.nodeId] ?? fase.titulo} onDraft={acoes && !fase.nodeId.startsWith('novo-') ? title => onNameDraft(fase.nodeId, title) : undefined} />
            {acoes && <div className="planilha-node-controls ml-auto flex items-center gap-0.5">
              <DragHandle label={`Arrastar macrofase ${fase.titulo}`} nodeId={fase.nodeId} kind="phase" onStart={onDragStartNode} onEnd={onDragEndNode} />
              <NodeActionsMenu label={`Ações da macrofase ${fase.titulo}`} actions={[
                { label: 'Nova atividade', onClick: () => acoes.onInserir('filho', fase.nodeId) },
              ]} />
            </div>}
          </div>
        </td>
      </tr>
      {saveErrors[fase.nodeId] && <tr className="planilha-save-error-row"><td colSpan={18} role="alert"><strong>{fase.codigo} {fase.titulo}</strong>: {saveErrors[fase.nodeId]} Ajuste a macrofase e clique em Salvar novamente.</td></tr>}
      {fase.atividades.map(a => {
        const canReal = canEditAllActual || (canEditOwnActual && !!currentUserId && idsDaLinha(a).includes(currentUserId))
        const canRealTime = canReal && !a.tempoRealDosCards
        const origemTempo = a.tempoRealDosCards ? 'Calculado dos apontamentos encerrados do card. Para corrigir, edite os registros de tempo no card.' : undefined
        const minO = num(rascunho[a.nodeId]?.minOrcado, a.minOrcado)
        const matO = num(rascunho[a.nodeId]?.materiaisOrcado, a.materiaisOrcado)
        const minR = a.tempoRealDosCards ? a.minReal : num(rascunho[a.nodeId]?.minReal, a.minReal)
        const matR = num(rascunho[a.nodeId]?.materiaisReal, a.materiaisReal)
        const userIds = idsAtuais(a, rascunho)
        const vpm = vpmDaLinha(userIds, elaboradores)
        const totalO = totalDaLinha(minO, vpm, matO)
        const totalR = totalDaLinha(minR, vpm, matR)
        const horasLinha = horasDe(userIds)
        const nome = `${a.codigo} ${a.titulo}`
        return (
          <Fragment key={a.nodeId}>
          <tr className="planilha-activity-row group bg-white align-top hover:bg-blue-50/30" data-planilha-node={a.nodeId} data-save-error={!!saveErrors[a.nodeId] || undefined} data-drop-target={dragOverId === a.nodeId || undefined} onDragOver={event => { if (dragged?.kind === 'activity' && dragged.nodeId !== a.nodeId) { event.preventDefault(); onDragOverNode(a.nodeId) } }} onDragLeave={() => { if (dragOverId === a.nodeId) onDragOverNode(null) }} onDrop={event => onDropNode(event, a.nodeId, 'activity')}>
            <td className="border border-gray-100 px-1 py-1">
              {acoes && (
                <div className="planilha-node-controls flex items-center justify-center gap-0.5">
                  <DragHandle label={`Arrastar ${nome}`} nodeId={a.nodeId} kind="activity" onStart={onDragStartNode} onEnd={onDragEndNode} />
                  <NodeActionsMenu label={`Ações de ${nome}`} actions={[
                    { label: 'Nova atividade abaixo', onClick: () => acoes.onInserir('irmao', a.nodeId) },
                    ...(fases.length > 1 ? [{ label: 'Mover para outra macrofase', onClick: () => setMoverAtividade(current => current === a.nodeId ? null : a.nodeId) }] : []),
                    { label: 'Excluir atividade', tone: 'danger' as const, onClick: () => acoes.onExcluir(a.nodeId, nome) },
                  ]} />
                </div>
              )}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-xs whitespace-nowrap font-medium text-gray-800">
              <InlineNodeName codigo={a.codigo} titulo={nameDrafts[a.nodeId] ?? a.titulo} descricao={a.descricao} onDraft={acoes && !a.nodeId.startsWith('novo-') ? title => onNameDraft(a.nodeId, title) : undefined} />
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
            <td className="border border-gray-100 px-1 py-1 min-w-[132px]">
              {canEdit ? campoInput(a.nodeId, 'dataPrevista', a.dataPrevista) : texto(fmtDataBR(a.dataPrevista))}
            </td>
            <td className="border border-gray-100 px-1 py-1 text-right">
              {canRealTime ? campoInput(a.nodeId, 'minReal', a.minReal) : texto(a.minReal.toLocaleString('pt-BR', { maximumFractionDigits: 2 }), origemTempo)}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">
              {canRealTime ? campoHoras(a.nodeId, 'minReal', minR) : texto(hhmm(minR), origemTempo)}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">
              {canRealTime ? campoDias(a.nodeId, 'minReal', minR, horasLinha) : texto(dois(minR / 60 / horasLinha), origemTempo)}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right">{celulaR(vpm)}</td>
            <td className="border border-gray-100 px-1 py-1 text-right">
              {canReal ? campoMoeda(a.nodeId, 'materiaisReal', matR) : texto(brl(matR))}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-right font-semibold text-gray-900">{texto(totalR === null ? '—' : brl(totalR), 'Total = (Min × R$) + Materiais')}</td>
            <td className="border border-gray-100 px-1 py-1 min-w-[132px]">
              {canReal ? campoInput(a.nodeId, 'dataRealizacao', a.dataRealizacao) : texto(fmtDataBR(a.dataRealizacao))}
            </td>
            <td className="border border-gray-100 px-1 py-1 text-center">
              <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${SITUACAO_CLASS[situacaoAtual(a.nodeId, a.dataPrevista, a.dataRealizacao)]}`}>
                {situacaoAtual(a.nodeId, a.dataPrevista, a.dataRealizacao)}
              </span>
            </td>
          </tr>
          {saveErrors[a.nodeId] && <tr className="planilha-save-error-row"><td colSpan={18} role="alert"><strong>{nome}</strong> · {Object.keys(rascunho[a.nodeId] ?? {}).map(campo => ({ minOrcado: 'tempo orçado', materiaisOrcado: 'materiais orçados', dataPrevista: 'data prevista', minReal: 'tempo realizado', materiaisReal: 'materiais realizados', dataRealizacao: 'data de realização', elaboradoPorUserIds: 'elaboradores' }[campo] ?? campo)).join(', ')}: {saveErrors[a.nodeId]} Corrija os dados e clique em Salvar novamente.</td></tr>}
          {moverAtividade === a.nodeId && acoes && <MoveActivityRow
            fases={fases.filter(f => f.nodeId !== fase.nodeId)}
            onCancelar={() => setMoverAtividade(null)}
            onMover={async targetId => {
              const ok = await acoes.onMover(a.nodeId, targetId, 'INSIDE')
              if (ok) setMoverAtividade(null)
              return ok
            }}
          />}
          {novaLinha?.tipo === 'irmao' && novaLinha.refId === a.nodeId && linhaNova}
          </Fragment>
        )
      })}
      {novaLinha?.tipo === 'filho' && novaLinha.refId === fase.nodeId && linhaNova}
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
      <td className={`${borda} px-2 py-1 text-right`}>{cel(String(s.min))}</td>
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
              <td className="px-3 py-1.5 text-right tabular-nums">{t.minOrcado.toLocaleString('pt-BR')}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{t.minReal.toLocaleString('pt-BR')}</td>
            </tr>
          ))}
          <tr className="bg-gray-100 font-bold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{planilha.tempoOrcadoTotal.toLocaleString('pt-BR')}</td>
            <td className="px-3 py-2 text-right tabular-nums">{planilha.tempoRealTotal.toLocaleString('pt-BR')}</td>
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
const Graficos = memo(function Graficos({ planilha }: { planilha: PlanilhaDeCustos }) {
  if (planilha.quadros.valor.length === 0) return null
  const valor = planilha.quadros.valor.map(v => ({
    fase: v.fase,
    'Valor Orçado': round2(v.orcado),
    'Valor Real': round2(v.realizado),
  }))
  const tempo = planilha.quadros.tempo.map(t => ({ fase: t.fase, 'Tempo Orçado (Min.)': t.minOrcado, 'Tempo Real (Min.)': t.minReal }))
  const pieData = planilha.quadros.elaboradores.filter(e => e.qtdeAtividades > 0).map(e => ({ name: e.elaborador, value: e.qtdeAtividades }))
  const barHeight = Math.max(210, valor.length * 42 + 36)
  const faseTick = (name: string) => name.length > 22 ? `${name.slice(0, 21)}…` : name
  const axisTick = { fontSize: 11, fill: 'var(--ap-muted)' }
  const gridColor = 'var(--ap-border)'
  return (
    <div className="planilha-charts mt-4 grid gap-3 xl:grid-cols-2">
      <section className="planilha-chart-card rounded-xl border">
        <div className="planilha-chart-heading"><div><h3>Valores por macrofase</h3><p>Orçado e realizado em reais</p></div><span>{valor.length} {valor.length === 1 ? 'fase' : 'fases'}</span></div>
        <div className="planilha-chart-legend"><span><i className="planilha-legend-budget" /> Orçado</span><span><i className="planilha-legend-actual" /> Realizado</span></div>
        <div className="planilha-chart-scroll" role="region" aria-label="Gráfico de valores por macrofase" tabIndex={0}>
          <div style={{ height: barHeight, minWidth: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={valor} margin={{ top: 6, right: 20, left: 0, bottom: 2 }} barGap={2}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 5" horizontal={false} />
                <XAxis type="number" tick={axisTick} tickFormatter={(v: number) => v.toLocaleString('pt-BR')} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="fase" width={160} tick={axisTick} tickFormatter={faseTick} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: unknown) => typeof v === 'number' ? brl(v) : String(v)} cursor={{ fill: 'var(--ap-glow)' }} />
                <Bar dataKey="Valor Orçado" fill="var(--chart-budget)" radius={[0, 5, 5, 0]} maxBarSize={13} />
                <Bar dataKey="Valor Real" fill="var(--chart-actual)" radius={[0, 5, 5, 0]} maxBarSize={13} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      <section className="planilha-chart-card rounded-xl border">
        <div className="planilha-chart-heading"><div><h3>Tempo por macrofase</h3><p>Minutos planejados e registrados</p></div><span>{tempo.length} {tempo.length === 1 ? 'fase' : 'fases'}</span></div>
        <div className="planilha-chart-legend"><span><i className="planilha-legend-budget" /> Orçado</span><span><i className="planilha-legend-actual" /> Realizado</span></div>
        <div className="planilha-chart-scroll" role="region" aria-label="Gráfico de tempo por macrofase" tabIndex={0}>
          <div style={{ height: barHeight, minWidth: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={tempo} margin={{ top: 6, right: 20, left: 0, bottom: 2 }} barGap={2}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 5" horizontal={false} />
                <XAxis type="number" tick={axisTick} tickFormatter={(v: number) => v.toLocaleString('pt-BR')} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="fase" width={160} tick={axisTick} tickFormatter={faseTick} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: unknown) => typeof v === 'number' ? `${v.toLocaleString('pt-BR')} min` : String(v)} cursor={{ fill: 'var(--ap-glow)' }} />
                <Bar dataKey="Tempo Orçado (Min.)" fill="var(--chart-budget)" radius={[0, 5, 5, 0]} maxBarSize={13} />
                <Bar dataKey="Tempo Real (Min.)" fill="var(--chart-actual)" radius={[0, 5, 5, 0]} maxBarSize={13} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      {pieData.length > 0 && (
        <section className="planilha-chart-card rounded-xl border xl:col-span-2">
          <div className="planilha-chart-heading"><div><h3>Atividades por elaborador</h3><p>Participação no total de atividades</p></div><span>{planilha.qtdeAtividades} atividades</span></div>
          <div className="planilha-donut-layout">
            <div className="planilha-donut-figure"><ResponsiveContainer width="100%" height={225}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={94} paddingAngle={2} stroke="none">
                  {pieData.map((_, i) => <Cell key={i} fill={CORES_PIE[i % CORES_PIE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer><div className="planilha-donut-center"><strong>{planilha.qtdeAtividades}</strong><span>atividades</span></div></div>
            <div className="planilha-donut-list">{pieData.map((item, index) => <div key={item.name} className="planilha-donut-item"><i style={{ backgroundColor: CORES_PIE[index % CORES_PIE.length] }} /><span title={item.name}>{item.name}</span><strong>{item.value}</strong><small>{((item.value / planilha.qtdeAtividades) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small></div>)}</div>
          </div>
        </section>
      )}
    </div>
  )
})
