'use client'

import Select from '@/components/ui/Select'
import MoedaInput from '@/components/ui/MoedaInput'
import { parseMoeda as parseMoedaLib } from '@/lib/dinheiro'
import Dica from '@/components/ui/Tooltip'
import ElaboradoresSelect from './ElaboradoresSelect'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { menorJornada, somaValoresPorMinuto } from '@/lib/elaboradores'

import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, Download, UserPlus, Undo2, Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import DateInput from '@/components/ui/DateInput'
import { updateNodePropertiesAction, insertChildAction, insertSiblingAction, renameNodeAction, deleteNodeAction } from '@/app/actions/wbs'
import { addMemberAction } from '@/app/actions/projetos'
import { fmtDataBR, maiorData, situacaoDe, valorPorMinutoDoElaborador, type PlanilhaDeCustos, type SituacaoAtividade, type Elaborador } from '@/lib/planilhaCustos'
import { minutosDeHoras, minutosDeDias, round2 } from '@/lib/custosCalc'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, PieChart, Pie, Cell } from 'recharts'

interface Props {
  projetoId: string
  nomeProjeto: string
  inicioProjeto: string
  fimProjeto: string
  canEdit: boolean
  currentUserId?: string
  canEditOwnActual?: boolean
  canEditAllActual?: boolean
  canManageMembers?: boolean
  /** Pode inserir e excluir linhas (muda a estrutura da EAP). */
  canEditLinhas?: boolean
  planilha: PlanilhaDeCustos
  elaboradores: Elaborador[]
  usuariosDisponiveis: { id: string; name: string; email: string }[]
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

const lista = (csv: string): string[] => csv.split(',').map(v => v.trim()).filter(Boolean)
/** Elaboradores da linha; aceita dados no formato antigo (um só). */
const idsDaLinha = (a: { elaboradoPorUserIds?: string[]; elaboradoPorUserId: string | null }): string[] =>
  a.elaboradoPorUserIds ?? (a.elaboradoPorUserId ? [a.elaboradoPorUserId] : [])

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

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
/** Valor do minuto: centavos não bastam (ex.: R$ 0,3472). */
const brlMinuto = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
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
  projetoId, nomeProjeto, inicioProjeto, fimProjeto, canEdit, currentUserId, canEditOwnActual = false, canEditAllActual = false, canManageMembers = false, canEditLinhas = false, planilha, elaboradores, usuariosDisponiveis, exportUrl,
}: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [rascunho, setRascunho] = useState<Record<string, CampoLinha>>({})
  const [historia, setHistoria] = useState<Record<string, CampoLinha>[]>([])
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState<Record<string, CampoLinha>>({})
  const [mostrarNovoMembro, setMostrarNovoMembro] = useState(false)
  const dirtyCount = Object.keys(rascunho).reduce((acc, nodeId) => {
    const cur = rascunho[nodeId]
    if (!cur || Object.keys(cur).length === 0) return acc
    const s = salvo[nodeId]
    if (!s) return acc + 1
    return JSON.stringify(s) !== JSON.stringify(cur) ? acc + 1 : acc
  }, 0)

  // ── Undo (Ctrl+Z) ────────────────────────────────────────────────────────────
  const setCampo = useCallback((nodeId: string, campo: keyof CampoLinha, valor: string) => {
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

  // ── Auto-save (debounce) ──────────────────────────────────────────────────────
  const salvarRef = useRef<() => void>(() => {})
  useIsomorphicLayoutEffect(() => {
    salvarRef.current = async () => {
      if (Object.keys(rascunho).length === 0) return
      setSalvando(true)
      const erros: string[] = []
      for (const [nodeId, campos] of Object.entries(rascunho)) {
        const props: Record<string, unknown> = {}
        if (campos.minOrcado !== undefined) props.tempoMinutos = Math.round(num(campos.minOrcado, 0))
        if (campos.materiaisOrcado !== undefined) props.materiais = Math.round(num(campos.materiaisOrcado, 0) * 100) / 100
        if (campos.dataPrevista !== undefined) props.dataPrevista = campos.dataPrevista || null
        if (campos.minReal !== undefined) props.tempoRealMinutos = Math.round(num(campos.minReal, 0))
        if (campos.materiaisReal !== undefined) props.materiaisReal = Math.round(num(campos.materiaisReal, 0) * 100) / 100
        if (campos.dataRealizacao !== undefined) props.dataRealizacao = campos.dataRealizacao || null
        // Nomes e responsáveis do card são acertados no servidor (ADR-044).
        if (campos.elaboradoPorUserIds !== undefined) props.elaboradoPorUserIds = lista(campos.elaboradoPorUserIds)

        const res = await updateNodePropertiesAction(projetoId, nodeId, props)
        if (!res.ok) erros.push(res.error)
      }
      setSalvando(false)
      if (erros.length > 0) {
        toast(erros[0], 'error')
      } else {
        setHistoria([])
        setSalvo(rascunho)
        toast('Alterações salvas automaticamente', 'success')
      }
    }
  })

  useEffect(() => {
    if (Object.keys(rascunho).length === 0) return
    const id = setTimeout(() => { salvarRef.current() }, 1000)
    return () => clearTimeout(id)
  }, [rascunho])

  const semAtividades = planilha.macrofases.length === 0

  // ── Inserir / excluir linhas (como no Excel) ────────────────────────────────
  // Cada linha é uma atividade (folha) da EAP: inserir cria o item na EAP e excluir
  // remove o item e o card dele na sprint, como na aba EAP/WBS.
  const [novaLinha, setNovaLinha] = useState<{ tipo: 'irmao' | 'filho'; refId: string } | null>(null)
  const [excluindo, setExcluindo] = useState<{ nodeId: string; nome: string } | null>(null)
  const acoes = useMemoAcoes(canEditLinhas, setNovaLinha, setExcluindo)
  const confirmarNovaLinha = useCallback(async (titulo: string) => {
    if (!novaLinha) return
    const criado = novaLinha.tipo === 'irmao'
      ? await insertSiblingAction(projetoId, novaLinha.refId)
      : await insertChildAction(projetoId, novaLinha.refId)
    if (!criado.ok) { toast(criado.error, 'error'); return }
    const nomeado = await renameNodeAction(projetoId, criado.nodeId, titulo)
    if (!nomeado.ok) toast(nomeado.error, 'error')
    setNovaLinha(null)
    router.refresh()
  }, [novaLinha, projetoId, router, toast])
  const cancelarNovaLinha = useCallback(() => setNovaLinha(null), [])
  async function confirmarExclusao() {
    if (!excluindo) return
    const res = await deleteNodeAction(projetoId, excluindo.nodeId)
    setExcluindo(null)
    if (!res.ok) { toast(res.error, 'error'); return }
    setRascunho(r => { const { [excluindo.nodeId]: _, ...resto } = r; return resto })
    toast('Linha excluída', 'success')
    router.refresh()
  }

  // Total do projeto: soma dos sub-totais, ao vivo.
  const somaFases = (lado: 'orcado' | 'real') =>
    planilha.macrofases.reduce((acc, f) => somar(acc, somaDaFase(f, lado, rascunho, elaboradores, planilha.config.horasPorDia)), SOMA_VAZIA)
  const dataFimProjeto = fmtDataBR(maiorData(planilha.macrofases.flatMap(f => f.atividades.map(a => rascunho[a.nodeId]?.dataPrevista ?? a.dataPrevista))))

  async function salvarManual() {
    await salvarRef.current()
    router.refresh()
  }

  return (
    <div className="p-4 sm:p-6">
      <p className="mb-3 text-sm text-gray-600">Campos brancos com borda azul são editáveis. Campos cinza estão bloqueados. O realizado próprio depende do membro salvo em Elaborado por.</p>
      <p className="mb-3 text-sm text-gray-600">Quando há apontamentos no card, o tempo realizado vem desses registros. Para corrigir esse tempo, edite os apontamentos no card.</p>
      {/* ── Cabeçalho (F.1) ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 font-bold text-white">O</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Planilha de Custos</h1>
              <p className="text-sm text-gray-500">Projeto: <span className="font-medium text-gray-700">{nomeProjeto}</span></p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-2">
          <span>Início do Projeto: <strong className="text-gray-900">{inicioProjeto}</strong></span>
          <span>Fim do Projeto: <strong className="text-gray-900">{fimProjeto}</strong></span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
          <a
            href={exportUrl}
            download
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Download className="h-4 w-4" /> Exportar .xlsx
          </a>
          <button
            type="button"
            onClick={() => { router.refresh() }}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Re-cria a lista de atividades a partir da árvore mais recente da EAP"
          >
            <RefreshCw className="h-4 w-4" /> Recalcular a partir da EAP
          </button>
          {canManageMembers && (
            <>
              <button
                type="button"
                onClick={desfazer}
                disabled={historia.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                title="Desfazer última alteração (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4" /> Desfazer
              </button>
              <button
                type="button"
                onClick={() => setMostrarNovoMembro(v => !v)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <UserPlus className="h-4 w-4" /> Adicionar elaborador
              </button>
            </>
          )}
          {(canEdit || canEditOwnActual || canEditAllActual) && dirtyCount > 0 && (
            <button
              type="button"
              onClick={salvarManual}
              disabled={salvando}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {salvando ? 'Salvando…' : `Salvar (${dirtyCount})`}
            </button>
          )}
        </div>

        {canManageMembers && mostrarNovoMembro && (
          <AdicionarElaborador
            projetoId={projetoId}
            elaboradores={elaboradores}
            usuariosDisponiveis={usuariosDisponiveis}
            onFechar={() => setMostrarNovoMembro(false)}
          />
        )}
      </div>

      {/* ── Tabela (F.2) ────────────────────────────────────────────────── */}
      {semAtividades ? (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-gray-500">Nenhuma atividade derivável da EAP.</p>
          <p className="mt-1 text-sm text-gray-400">Crie macrofases com atividades folha na EAP para gerar a planilha de custos.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full min-w-[1150px] border-collapse text-sm">
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
              {planilha.macrofases.map(fase => (
                <FaseFragment
                  key={fase.nodeId}
                  fase={fase}
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
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <QuadroValor planilha={planilha} />
            <QuadroTempo planilha={planilha} />
            <QuadroElaborador planilha={planilha} />
          </div>
          <Graficos planilha={planilha} />
        </>
      )}

      <ConfirmDialog
        isOpen={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={() => void confirmarExclusao()}
        title="Excluir linha"
        message={`Excluir "${excluindo?.nome ?? ''}"? O item sai da EAP e o card dele na sprint também é excluído.`}
      />
    </div>
  )
}


/** Ações estáveis (o FaseFragment é memo); undefined sem permissão. */
function useMemoAcoes(
  pode: boolean,
  setNovaLinha: (v: { tipo: 'irmao' | 'filho'; refId: string } | null) => void,
  setExcluindo: (v: { nodeId: string; nome: string } | null) => void,
): AcoesLinha | undefined {
  return useMemo(() => pode ? {
    onInserir: (tipo, refId) => setNovaLinha({ tipo, refId }),
    onExcluir: (nodeId, nome) => setExcluindo({ nodeId, nome }),
  } : undefined, [pode, setNovaLinha, setExcluindo])
}

/** Ações de linha (inserir/excluir), como no Excel. */
interface AcoesLinha {
  /** Abre a linha de digitação abaixo de `refId` (irmão) ou no fim da fase (filho). */
  onInserir: (tipo: 'irmao' | 'filho', refId: string) => void
  onExcluir: (nodeId: string, nome: string) => void
}

/** Linha de digitação do nome de uma atividade nova. */
function NovaLinha({ onConfirmar, onCancelar }: { onConfirmar: (titulo: string) => Promise<void>; onCancelar: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [busy, setBusy] = useState(false)
  const confirmar = async () => {
    if (!titulo.trim() || busy) return
    setBusy(true)
    await onConfirmar(titulo.trim())
    setBusy(false)
  }
  return (
    <tr className="bg-blue-50">
      <td className="border border-gray-100 px-2 py-1"></td>
      <td colSpan={17} className="border border-gray-100 px-2 py-1">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void confirmar(); if (e.key === 'Escape') onCancelar() }}
            placeholder="Nome da nova atividade"
            aria-label="Nome da nova atividade"
            maxLength={500}
            className="w-80 rounded border border-blue-300 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
          />
          <button type="button" onClick={() => void confirmar()} disabled={busy || !titulo.trim()} className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Inserindo…' : 'Inserir'}
          </button>
          <button type="button" onClick={onCancelar} className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">Cancelar</button>
        </div>
      </td>
    </tr>
  )
}

const FaseFragment = memo(function FaseFragment({
  fase, rascunho, canEdit, currentUserId, canEditOwnActual, canEditAllActual, elaboradores, onCampoChange, horasPorDiaPadrao,
  acoes, novaLinha, onConfirmarNovaLinha, onCancelarNovaLinha,
}: {
  fase: PlanilhaDeCustos['macrofases'][number]
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
      <input
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
      <input
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
      <input
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
      <tr className="bg-gray-100 font-semibold text-gray-800">
        <td colSpan={18} className="border border-gray-200 px-3 py-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span>{fase.codigo} {fase.titulo}</span>
            {acoes && (
              <button type="button" onClick={() => acoes.onInserir('filho', fase.nodeId)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100" title="Adicionar atividade no fim desta fase">
                <Plus className="h-3.5 w-3.5" /> Atividade
              </button>
            )}
          </div>
        </td>
      </tr>
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
          <tr className="group bg-white align-top hover:bg-blue-50/30">
            <td className="border border-gray-100 px-1 py-1">
              {acoes && (
                <div className="flex items-center justify-center gap-0.5 opacity-40 group-hover:opacity-100 focus-within:opacity-100">
                  <button type="button" onClick={() => acoes.onInserir('irmao', a.nodeId)} className="rounded p-0.5 text-gray-600 hover:bg-blue-100 hover:text-blue-700" aria-label={`Inserir linha abaixo de ${nome}`} title="Inserir linha abaixo">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => acoes.onExcluir(a.nodeId, nome)} className="rounded p-0.5 text-gray-600 hover:bg-red-100 hover:text-red-700" aria-label={`Excluir linha ${nome}`} title="Excluir linha">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </td>
            <td className="border border-gray-100 px-2 py-1 text-xs whitespace-nowrap font-medium text-gray-800">
              {a.descricao ? (
                <Dica label={a.descricao} multiline>
                  <span tabIndex={0} className="cursor-help underline decoration-dotted decoration-gray-300 underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-sm">
                    {nome}
                  </span>
                </Dica>
              ) : (
                <>{nome}</>
              )}
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
    <tr className={destaque ? 'bg-blue-100 font-bold text-blue-950' : 'bg-gray-200/70 font-semibold text-gray-700'}>
      <td colSpan={3} className={`${borda} px-3 py-1 text-right text-xs ${destaque ? 'uppercase tracking-wide' : 'italic'}`}>{rotulo}</td>
      {lado(orcado)}
      {/* Data fim (fase ou projeto): a maior data prevista das atividades, ao vivo. */}
      <td className={`${borda} px-2 py-1 text-center`} title="Data fim: maior data prevista">{cel(dataFim)}</td>
      {lado(real)}
      <td colSpan={2} className={borda}></td>
    </tr>
  )
}

function AdicionarElaborador({
  projetoId, elaboradores, usuariosDisponiveis, onFechar,
}: {
  projetoId: string
  elaboradores: Elaborador[]
  usuariosDisponiveis: { id: string; name: string; email: string }[]
  onFechar: () => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [userId, setUserId] = useState('')
  const jaMembros = new Set(elaboradores.map(e => e.userId))
  const disponiveis = usuariosDisponiveis.filter(u => !jaMembros.has(u.id))

  async function adicionar() {
    if (!userId) return
    setBusy(true)
    const res = await addMemberAction(projetoId, userId)
    setBusy(false)
    if ('error' in res && res.error) {
      toast(res.error, 'error')
    } else {
      toast('Elaborador adicionado ao projeto', 'success')
      onFechar()
      window.location.reload()
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="mb-2 text-xs font-bold text-gray-700 uppercase tracking-widest">Adicionar elaborador (membro do projeto)</div>
      {disponiveis.length === 0 ? (
        <p className="text-xs text-gray-500">Todos os usuários da instituição já são membros deste projeto.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Select
            ariaLabel="Usuário"
            className="min-w-[220px] flex-1"
            value={userId}
            onChange={setUserId}
            placeholder="Selecionar usuário…"
            options={disponiveis.map(u => ({ value: u.id, label: u.name, description: u.email }))}
          />
          <button
            type="button"
            onClick={adicionar}
            disabled={busy || !userId}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" /> {busy ? 'Adicionando…' : 'Adicionar'}
          </button>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
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

const ALTURA_GRAFICO = 360

/** Gráficos dos três quadros-resumo, largos e um embaixo do outro. */
const Graficos = memo(function Graficos({ planilha }: { planilha: PlanilhaDeCustos }) {
  if (planilha.quadros.valor.length === 0) return null
  const valor = planilha.quadros.valor.map(v => ({
    fase: v.fase,
    'Valor Orçado': round2(v.orcado),
    'Valor Real': round2(v.realizado),
  }))
  const tempo = planilha.quadros.tempo.map(t => ({ fase: t.fase, 'Tempo Orçado (Min.)': t.minOrcado, 'Tempo Real (Min.)': t.minReal }))
  const pieData = planilha.quadros.elaboradores.map(e => ({ name: e.elaborador, value: e.qtdeAtividades }))
  const eixoFase = <XAxis dataKey="fase" tick={{ fontSize: 12 }} interval={0} height={56} angle={-15} textAnchor="end" />
  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-gray-800">Valor por Fase do Projeto (R$)</h3>
        <ResponsiveContainer width="100%" height={ALTURA_GRAFICO}>
          <BarChart data={valor} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            {eixoFase}
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => brl(v)} width={96} />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? brl(v) : String(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Valor Orçado" fill="#2563eb" />
            <Bar dataKey="Valor Real" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-4 text-sm font-bold text-gray-800">Tempo por Fase do Projeto (min)</h3>
        <ResponsiveContainer width="100%" height={ALTURA_GRAFICO}>
          <BarChart data={tempo} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            {eixoFase}
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => v.toLocaleString('pt-BR')} width={72} />
            <Tooltip formatter={(v: unknown) => (typeof v === 'number' ? `${v.toLocaleString('pt-BR')} min` : String(v))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Tempo Orçado (Min.)" fill="#2563eb" />
            <Bar dataKey="Tempo Real (Min.)" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </section>
      {pieData.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-bold text-gray-800">Distribuição de Atividades por Elaborador</h3>
          <ResponsiveContainer width="100%" height={ALTURA_GRAFICO}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={130}
                label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''}: ${((percent ?? 0) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}>
                {pieData.map((_, i) => <Cell key={i} fill={CORES_PIE[i % CORES_PIE.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </section>
      )}
    </div>
  )
})
