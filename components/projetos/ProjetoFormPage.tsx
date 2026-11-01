'use client'

import AnimatedCardStack from '@/components/ui/AnimatedCardStack'
import UndoChangeButton from '@/components/ui/UndoChangeButton'
import Modal from '@/components/ui/Modal'
import { listarVersoesProjetoAction } from '@/app/actions/projetoEdicao'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'
import Select from '@/components/ui/Select'
import AnimatedTrashButton from '@/components/ui/AnimatedTrashButton'
import ExpandableFieldGroup from '@/components/ui/ExpandableFieldGroup'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import MoedaInput from '@/components/ui/MoedaInput'
import { parseMoeda } from '@/lib/dinheiro'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import { useState, useTransition, useEffect, useLayoutEffect, useMemo, useRef, Suspense, type ReactNode, type CSSProperties, type TextareaHTMLAttributes } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, Building2, CheckCircle2, History, CalendarClock, CalendarDays, ChevronDown, Flag, GraduationCap, Layers, Lightbulb,
  ListChecks, MapPin, Package, Plus, Save, Scale, ShieldAlert, Target, Undo2, UserRound, Wrench,
} from 'lucide-react'
import { createProjetoAction, updateProjetoAction, getProjetoAction, retryMacroFasesSyncAction } from '@/app/actions/projetos'
import { listUsersAction } from '@/app/actions/admin'
import { getDepartmentsAction } from '@/app/actions/departments'
import { useToast } from '@/components/ui/Toast'
import MultiCreatableSelect from '@/components/ui/MultiCreatableSelect'
import ExpandableTextarea from '@/components/ui/ExpandableTextarea'
import ProjetoLogoUpload from '@/components/projetos/ProjetoLogoUpload'
import SeletorData from '@/components/ui/SeletorData'
import UserAvatar from '@/components/user/UserAvatar'
import { useGuardaSaida } from '@/components/documentos/editor/GuardaSaida'
import { linhaInstitucional, periodoEhSemestral, TURNOS } from '@/lib/linhaInstitucional'
import { conteudoDaVersao, desfazerAlteracao, formDaVersao, listarAlteracoes, ROTULOS_PROJETO, type CampoTextoTermo, type FaseForm, type FormProjeto } from '@/lib/alteracoesProjeto'
import HistoricoProjeto from '@/components/projetos/HistoricoProjeto'
import RestaurarVersaoDialog from '@/components/projetos/RestaurarVersaoDialog'
import ExcluirFaseDialog from '@/components/projetos/ExcluirFaseDialog'
import type { VersaoProjeto } from '@/services/projetoVersoes'
import { diffTexto } from '@/lib/diffTexto'

interface Usuario {
  id: string
  name: string
  email?: string
  isActive?: boolean
  avatarUrl?: string | null
}

export default function NovoProjetoPage({ canAssignRoles = true }: { canAssignRoles?: boolean }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    }>
      <ProjetoFormContent canAssignRoles={canAssignRoles} />
    </Suspense>
  )
}

// ── Datas no padrão brasileiro (dd/mm/aaaa) ─────────────────
// O valor mantido no state é ISO (YYYY-MM-DD) — só o display é mascarado.
const isoToBR = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

const maskDateBR = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

const brToISO = (br: string): string => {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

function DateInputBR({
  value,
  onChange,
  className,
  disabled = false,
  ariaLabel,
}: {
  value: string
  onChange: (iso: string) => void
  className?: string
  disabled?: boolean
  ariaLabel?: string
}) {
  const [display, setDisplay] = useState(isoToBR(value))
  const [focused, setFocused] = useState(false)
  const [lastValue, setLastValue] = useState(value)

  // Sincroniza o campo quando o valor ISO muda externamente (sem sobrescrever
  // a digitação enquanto o usuário está focado no input).
  if (lastValue !== value && !focused) {
    setLastValue(value)
    setDisplay(isoToBR(value))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/aaaa"
      maxLength={10}
      disabled={disabled}
      aria-label={ariaLabel}
      value={display}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const masked = maskDateBR(e.target.value)
        setDisplay(masked)
        onChange(brToISO(masked))
      }}
      className={className}
    />
  )
}

// ── Estilo ──────────────────────────────────────────────────
// Superfícies de vidro (translúcidas, com desfoque), como no iOS.
const inputClass = 'campo-vidro w-full px-4 py-3 rounded-xl text-sm text-slate-800 font-medium'
const celulaInput = 'campo-limpo w-full px-3 py-2.5 rounded-lg text-sm'
/** Valor de uma linha de propriedades: texto, fundo só ao passar o mouse ou editar. */
const propriedadeInput = 'campo-limpo h-8 w-full rounded-lg px-2.5 text-[13px] font-medium text-slate-800 placeholder:font-normal placeholder:text-slate-400 disabled:cursor-not-allowed disabled:text-slate-500'
const tituloLateral = 'mb-1 px-1 text-[11px] font-bold uppercase tracking-widest text-slate-400'

function Propriedade({ Icone, rotulo, htmlFor, children }: { Icone: typeof Flag; rotulo: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="project-field grid grid-cols-[124px_1fr] items-center gap-2 py-1">
      <label htmlFor={htmlFor} className="flex items-center gap-2 text-[13px] text-slate-500"><Icone className="h-4 w-4 shrink-0 text-slate-400" />{rotulo}</label>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Campos do Termo de Abertura (Diretrizes e Escopo), na ordem e com os nomes do formulário. */
const CAMPOS_TERMO: { nome: CampoTextoTermo; Icone: typeof Flag; placeholder: string; largo: boolean }[] = [
  { nome: 'justificativa', Icone: Lightbulb, placeholder: 'Qual problema este projeto resolve? Por que é necessário?', largo: true },
  { nome: 'objetivos', Icone: Target, placeholder: 'O que caracteriza o sucesso deste projeto?', largo: false },
  { nome: 'descricaoProduto', Icone: Package, placeholder: 'Detalhe técnico ou funcional do que será entregue...', largo: false },
  { nome: 'metodologia', Icone: Wrench, placeholder: 'Ex: Desenvolvimento Ágil usando Scrum quinzenal.', largo: true },
  { nome: 'premissas', Icone: ListChecks, placeholder: 'Cenários assumidos como verdadeiros para o planejamento...', largo: false },
  { nome: 'restricoes', Icone: ShieldAlert, placeholder: 'Limites de orçamento, tempo ou recursos obrigatórios...', largo: false },
  { nome: 'limitesAutoridade', Icone: Scale, placeholder: 'Até que ponto o gerente pode tomar decisões financeiras e de escopo sem aprovação extra?', largo: true },
]

const FORM_VAZIO: FormProjeto = {
  name: '', slogan: '', startDate: '', endDate: '', location: '',
  logoUrl: '', initialMemberId: '',
  justificativa: '', objetivos: '', metodologia: '', descricaoProduto: '',
  premissas: '', restricoes: '', limitesAutoridade: '',
  semestre: '', termo: '', turno: '', ano: '', anoAms: '',
  departamentos: [],
}

let proximaChave = 0
const novaFase = (): FaseForm => ({ chave: `nova-${++proximaChave}`, fase: '', dataLimite: '', custo: '' })

/** Campo de texto que cresce com o conteúdo (quebra linha em vez de cortar). */
function TextoQueCresce({ value, onChange, className, ...resto }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return <textarea ref={ref} rows={1} value={value} onChange={e => onChange(e.target.value)} className={`${className} resize-none overflow-hidden`} {...resto} />
}

/** Texto com as palavras removidas (vermelho, riscadas) e incluídas (verde). */
function DiffTexto({ antes, depois }: { antes: string; depois: string }) {
  if (!antes && !depois) return <span className="text-sm text-slate-400">vazio</span>
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
      {diffTexto(antes, depois).map((p, i) => p.tipo === 'igual' ? <span key={i}>{p.texto}</span>
        : p.tipo === 'removido' ? <del key={i} className="rounded bg-rose-100 px-0.5 text-rose-700 decoration-rose-400">{p.texto}</del>
        : <ins key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-800 no-underline">{p.texto}</ins>)}
    </p>
  )
}

function ProjetoFormContent({ canAssignRoles }: { canAssignRoles: boolean }) {
  const permissions = useProjectPermissions()
  const canEditCosts = permissions.has('planilha:orcado') && permissions.has('planilha:realizado-todos')
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams<{ projetoId?: string }>()
  const editId = params.projetoId ?? searchParams.get('edit')
  const canEditPublished = permissions.has('documentos:editar') && permissions.has('documentos:aprovar')
  const podeDepartamentos = permissions.has('cadastros:gerenciar')
  const { toast } = useToast()

  const [isPending, startTransition] = useTransition()
  const [isLoadingEdit, setIsLoadingEdit] = useState(!!editId)

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  /** Gerente atual (nome e foto), vindo do projeto: aparece mesmo sem a lista de usuários. */
  const [gerenteAtual, setGerenteAtual] = useState<Usuario | null>(null)
  const [departamentosExistentes, setDepartamentosExistentes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [syncPending, setSyncPending] = useState(false)
  const [syncProjectId, setSyncProjectId] = useState<string | null>(editId)

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 26 }, (_, i) => currentYear - 20 + i)

  const [form, setForm] = useState<FormProjeto>(FORM_VAZIO)
  const [macroFases, setMacroFases] = useState<FaseForm[]>(() => [novaFase()])
  /** Como o projeto está salvo (base de "Alterações não salvas"). Nulo ao criar. */
  const [limiteFundoHistorico, setLimiteFundoHistorico] = useState(0)
  const [alteracoesJaAbertas, setAlteracoesJaAbertas] = useState(false)
  const [origemHistorico, setOrigemHistorico] = useState<number | undefined>(undefined)
  const [estadoVersoes, setEstadoVersoes] = useState({ ativa: 0, ultima: 0 })
  const [confirmarNovoSalvamento, setConfirmarNovoSalvamento] = useState(false)
  const [erroRestauracao, setErroRestauracao] = useState('')
  const [versaoParaRestaurar, setVersaoParaRestaurar] = useState<{ numero: number; dados: ReturnType<typeof formDaVersao> } | null>(null)
  const [confirmacaoSalvo, setConfirmacaoSalvo] = useState(0)
  const [salvo, setSalvo] = useState<{ form: FormProjeto; fases: FaseForm[] } | null>(null)
  const [verAlteracoes, setVerAlteracoes] = useState(false)
  const [verHistorico, setVerHistorico] = useState(false)
  /** Versão do histórico carregada no formulário (salvar cria uma versão nova a partir dela). */
  const [restaurando, setRestaurando] = useState<number | null>(null)
  const [recarregarHistorico, setRecarregarHistorico] = useState(0)
  const [faseAExcluir, setFaseAExcluir] = useState<{ nodeId: string; nome: string; numero: string; chave: string } | null>(null)
  const [inicioPelaTarefa, setInicioPelaTarefa] = useState(false)
  const [aba, setAba] = useState<'diretrizes' | 'cronograma'>('diretrizes')
  const [abaVisivel, setAbaVisivel] = useState<'diretrizes' | 'cronograma'>('diretrizes')
  const [saindo, setSaindo] = useState(false)
  const [direcaoAba, setDirecaoAba] = useState<'right' | 'left'>('right')
  const trocaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (trocaTimer.current) clearTimeout(trocaTimer.current) }, [])
  function trocarAba(proxima: 'diretrizes' | 'cronograma') {
    if (proxima === aba) return
    if (trocaTimer.current) clearTimeout(trocaTimer.current)
    setAba(proxima)
    setDirecaoAba(proxima === 'cronograma' ? 'right' : 'left')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || proxima === abaVisivel) {
      setAbaVisivel(proxima)
      setSaindo(false)
      return
    }
    setSaindo(true)
    trocaTimer.current = setTimeout(() => {
      setAbaVisivel(proxima)
      setSaindo(false)
      trocaTimer.current = null
    }, 260)
  }

  const rolagemDiretrizes = useRef<HTMLDivElement>(null)
  const rolagemFases = useRef<HTMLDivElement>(null)
  const faseNova = useRef<string | null>(null)
  const raizRef = useRef<HTMLDivElement>(null)
  const abaRef = useRef(aba)
  useEffect(() => { abaRef.current = aba }, [aba])

  // No computador a página não rola: a roda do mouse em qualquer ponto da tela (fora do menu
  // lateral do app, que fica fora desta raiz) rola o conteúdo da aba aberta.
  useEffect(() => {
    const raiz = raizRef.current
    if (!raiz) return
    const largo = window.matchMedia?.('(min-width: 1024px)')
    function aoRolar(e: WheelEvent) {
      if (largo && !largo.matches) return
      if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return // zoom e rolagem lateral seguem normais
      const area = (abaRef.current === 'diretrizes' ? rolagemDiretrizes : rolagemFases).current
      const alvo = e.target as Element | null
      if (!area || !alvo || area.contains(alvo)) return
      // Quem rola sozinho continua rolando sozinho (lista de alterações, menus abertos…).
      for (let el: Element | null = alvo; el && el !== raiz; el = el.parentElement) {
        if (el.matches('[role="dialog"], [role="listbox"], [role="menu"]')) return
        const st = getComputedStyle(el)
        if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight) {
          const podeRolar = e.deltaY > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0
          if (podeRolar) return
        }
      }
      e.preventDefault()
      const passo = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? area.clientHeight : 1
      area.scrollBy({ top: e.deltaY * passo })
    }
    raiz.addEventListener('wheel', aoRolar, { passive: false })
    return () => raiz.removeEventListener('wheel', aoRolar)
  }, [])

  useEffect(() => {
    listUsersAction().then(r => {
      if ('users' in r && r.users) setUsuarios(r.users)
    })
    getDepartmentsAction().then(depts => {
      if (Array.isArray(depts)) {
        setDepartamentosExistentes(depts.map((d: { name: string }) => d.name))
      }
    })
  }, [])

  // Prefill em modo edição
  useEffect(() => {
    if (!editId) return
    getProjetoAction(editId).then(async result => {
      if ('error' in result || !result.projeto) {
        setError('Projeto não encontrado para edição.')
        setIsLoadingEdit(false)
        return
      }
      const p = result.projeto
      setSyncPending(p.macroFasesSyncPending)
      setInicioPelaTarefa(Boolean((p as { inicioPelaPrimeiraTarefa?: boolean }).inicioPelaPrimeiraTarefa))
      const associados = (result as { departamentosAssociados?: { id: string; name: string }[] }).departamentosAssociados
      const gerenteId = (result as { gerenteId?: string }).gerenteId ?? ''
      setGerenteAtual((result as { gerente?: Usuario | null }).gerente ?? null)
      const publicado: FormProjeto = {
        name: p.name ?? '',
        slogan: p.slogan ?? '',
        startDate: p.startDate ? new Date(p.startDate).toISOString().split('T')[0] : '',
        endDate: p.endDate ? new Date(p.endDate).toISOString().split('T')[0] : '',
        location: p.location ?? '',
        logoUrl: p.logoUrl ?? '',
        initialMemberId: gerenteId,
        justificativa: p.justificativa ?? '',
        objetivos: p.objetivos ?? '',
        metodologia: p.metodologia ?? '',
        descricaoProduto: p.descricaoProduto ?? '',
        premissas: p.premissas ?? '',
        restricoes: p.restricoes ?? '',
        limitesAutoridade: p.limitesAutoridade ?? '',
        semestre: p.semestre ?? '',
        termo: p.termo ?? '',
        turno: p.turno ?? '',
        ano: p.ano ? String(p.ano) : '',
        anoAms: p.semestre === 'ano' ? p.anoAms ?? '' : '',
        // Fonte da verdade: associações reais (ProjetoDepartamento). Fallback para
        // as strings legadas de projetos anteriores à sincronização.
        departamentos: associados?.length ? associados.map(d => d.name) : (p.departamentos ?? []),
      }
      const fases: FaseForm[] = p.macroFases?.length
        ? p.macroFases.map((f, i) => {
          // Fase da EAP: o id do item permite renomear e excluir com segurança.
          const nodeId = (f as { nodeId?: string }).nodeId
          return { chave: nodeId ? `no-${nodeId}` : `salva-${i}`, nodeId, fase: f.fase, dataLimite: f.dataLimite ?? '', custo: f.custo ?? '' }
        })
        : []
      setForm(publicado)
      setMacroFases(fases.length ? fases : [novaFase()])
      setSalvo({ form: publicado, fases })
      setIsLoadingEdit(false)
    })
  }, [editId])

  const alterarCampo = (name: keyof FormProjeto, value: string) => {
    setForm(prev => ({ ...prev, [name]: value, ...(name === 'semestre' && value !== 'ano' ? { anoAms: '' } : {}) }))
    if (error && name === 'name') setError('')
  }
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    alterarCampo(e.target.name, e.target.value)
  }

  const scrollNovaFase = useRef<number | null>(null)
  useEffect(() => () => { if (scrollNovaFase.current !== null) cancelAnimationFrame(scrollNovaFase.current) }, [])
  const addMacroFase = () => {
    if (!canEditCosts) return
    const nova = novaFase()
    faseNova.current = nova.chave
    setMacroFases(l => [...l, nova])
  }
  // Fase nova: rola a lista até ela e já deixa o cursor no nome.
  useEffect(() => {
    const chave = faseNova.current
    if (!chave) return
    faseNova.current = null
    const lista = rolagemFases.current
    const campo = lista?.querySelector<HTMLTextAreaElement>(`[data-fase="${chave}"]`)
    if (!lista || !campo) return
    // A fase nova entra no fim: rola a lista até o fim (no celular, a página até a linha) e foca o nome.
    campo.focus({ preventScroll: true })
    if (scrollNovaFase.current !== null) cancelAnimationFrame(scrollNovaFase.current)
    let container: HTMLElement | null = lista
    while (container && !(container.scrollHeight > container.clientHeight && /(auto|scroll)/.test(getComputedStyle(container).overflowY))) container = container.parentElement
    const scroller = container ?? document.scrollingElement as HTMLElement
    if (!scroller) return
    const inicio = scroller.scrollTop
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const inicioTempo = performance.now()
    const rolar = (agora: number) => {
      if (!campo.isConnected) return
      const progresso = reduced ? 1 : Math.min(1, (agora - inicioTempo) / 480)
      const curva = progresso * progresso * (3 - 2 * progresso)
      const base = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top
      const altura = scroller === document.scrollingElement ? window.innerHeight : scroller.clientHeight
      const destino = Math.max(0, Math.min(scroller.scrollHeight - altura,
        scroller.scrollTop + campo.getBoundingClientRect().bottom - base - altura + 24))
      scroller.scrollTo({ top: inicio + (destino - inicio) * curva, behavior: 'instant' })
      scrollNovaFase.current = progresso < 1 ? requestAnimationFrame(rolar) : null
    }
    scrollNovaFase.current = requestAnimationFrame(rolar)
  }, [macroFases])
  const updateMacroFase = (chave: string, field: 'fase' | 'dataLimite' | 'custo', value: string) => {
    if (canEditCosts) setMacroFases(l => l.map(f => (f.chave === chave ? { ...f, [field]: value } : f)))
  }
  const removeMacroFase = (chave: string) => {
    if (!canEditCosts) return
    const fase = macroFases.find(f => f.chave === chave)
    const salva = fase?.nodeId && salvo?.fases.some(f => f.chave === chave)
    if (fase && salva) {
      // Fase já salva: exclusão com confirmação e impacto (EAP, sprints, tarefas, planilha, Termo).
      const numero = `1.${macroFases.indexOf(fase) + 1}`
      setFaseAExcluir({ nodeId: fase.nodeId as string, nome: salvo?.fases.find(f => f.chave === chave)?.fase ?? fase.fase, numero, chave })
      return
    }
    // Fase nova (ainda não salva): sai na hora.
    setMacroFases(l => (l.length > 1 ? l.filter(f => f.chave !== chave) : [novaFase()]))
  }
  function faseExcluida() {
    const chave = faseAExcluir?.chave
    setFaseAExcluir(null)
    if (!chave) return
    setMacroFases(l => { const r = l.filter(f => f.chave !== chave); return r.length ? r : [novaFase()] })
    setSalvo(sv => (sv ? { ...sv, fases: sv.fases.filter(f => f.chave !== chave) } : sv))
    setRecarregarHistorico(n => n + 1)
    toast('Fase excluída da EAP, das sprints e da planilha.', 'success')
  }
  /** Versão gravada junto com a exclusão: o projeto salvo, sem a fase. */
  function versaoDaExclusao() {
    if (!salvo || !faseAExcluir) return undefined
    const fases = salvo.fases.filter(f => f.chave !== faseAExcluir.chave)
    return { conteudo: conteudoDaVersao(salvo.form, fases), anterior: conteudoDaVersao(salvo.form, salvo.fases), alteracoes: [`Fase ${faseAExcluir.numero} ${faseAExcluir.nome} excluída`] }
  }

  const total = macroFases
    // Aceita "1.000,00" (este formulário) e "1000.00" (Termo de Abertura).
    .reduce((acc, f) => acc + (parseMoeda(f.custo) || 0), 0)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // Fases vazias não contam como alteração (o formulário mostra uma linha em branco quando não há fases).
  const fasesPreenchidas = useMemo(
    () => macroFases.filter(f => f.fase.trim() || f.custo || f.dataLimite || salvo?.fases.some(s => s.chave === f.chave)),
    [macroFases, salvo],
  )
  const alteracoes = useMemo(() => {
    if (!salvo) return []
    const nomeDoUsuario = (id: string) => usuarios.find(u => u.id === id)?.name ?? 'Membro'
    return listarAlteracoes(salvo, { form, fases: fasesPreenchidas }, nomeDoUsuario)
  }, [salvo, form, fasesPreenchidas, usuarios])
  const pendente = !!editId && alteracoes.length > 0

  function descartar() {
    setRestaurando(null)
    if (!salvo) return
    setForm(salvo.form)
    setMacroFases(salvo.fases.length ? salvo.fases : [novaFase()])
    setVerAlteracoes(false)
    setError('')
  }
  function restaurar(v: VersaoProjeto) {
    if (!salvo) return
    setErroRestauracao('')
    setVersaoParaRestaurar({ numero: v.numero, dados: formDaVersao(v.conteudo, salvo.fases, () => novaFase().chave) })
  }
  function confirmarRestauracao() {
    if (!versaoParaRestaurar || isPending) return
    const { numero, dados: r } = versaoParaRestaurar
    persistirProjeto(r.form, r.fases, numero, true)
  }

  function desfazer(chave: string) {
    if (!salvo) return
    const r = desfazerAlteracao(chave, salvo, { form, fases: macroFases })
    setForm(r.form)
    setMacroFases(r.fases.length ? r.fases : [novaFase()])
    const restantes = listarAlteracoes(salvo, { form: r.form, fases: r.fases.filter(f => f.fase.trim()) }, id => usuarios.find(u => u.id === id)?.name ?? 'Membro')
    if (!restantes.length) setVerAlteracoes(false)
  }

  function salvar() {
    if (estadoVersoes.ativa && estadoVersoes.ativa < estadoVersoes.ultima) { setConfirmarNovoSalvamento(true); return }
    persistirProjeto(form, macroFases, restaurando, false)
  }

  function persistirProjeto(dadosForm: FormProjeto, dadosFases: FaseForm[], origem: number | null, restauracao: boolean) {
    if (isPending) return
    const falhar = (mensagem: string) => { if (restauracao) setErroRestauracao(mensagem); else setError(mensagem) }
    setError('')
    setErroRestauracao('')
    const fasesValidas = dadosFases.filter(f => f.fase.trim())
    const diferencas = salvo ? listarAlteracoes(salvo, { form: dadosForm, fases: fasesValidas }, id => usuarios.find(u => u.id === id)?.name ?? 'Membro') : []
    if (!dadosForm.name.trim()) {
      falhar('O Nome do Projeto é obrigatório.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const fasesEnvio = dadosFases.map(({ fase, dataLimite, custo, nodeId }) => ({ fase, dataLimite, custo, ...(nodeId ? { nodeId } : {}) }))
    const enviado = { form: dadosForm, fases: fasesValidas }
    const versao = salvo && (diferencas.length || restauracao) ? {
      conteudo: conteudoDaVersao(dadosForm, fasesValidas),
      anterior: conteudoDaVersao(salvo.form, salvo.fases),
      alteracoes: diferencas.map(a => a.rotulo),
      ...(restauracao && origem ? { ativarVersao: origem } : origem ? { restauradaDe: origem } : {}),
    } : undefined

    startTransition(async () => {
      try {
        const update: Record<string, unknown> = { ...dadosForm, anoAms: dadosForm.semestre === 'ano' ? dadosForm.anoAms || null : null }
        // Termo/turno só valem para período semestral; ao mudar para anual, limpa.
        if (!periodoEhSemestral(dadosForm.semestre)) { update.termo = ''; update.turno = '' }
        if (!canAssignRoles) delete update.initialMemberId
        if (!podeDepartamentos) delete update.departamentos
        if (canEditCosts) update.macroFases = fasesEnvio
        if (!canEditPublished) {
          for (const key of ['justificativa','objetivos','metodologia','descricaoProduto','premissas','restricoes','limitesAutoridade']) delete update[key]
        }
        const result = editId
          ? await updateProjetoAction(undefined, editId, update, versao)
          : await createProjetoAction(undefined, { ...dadosForm, macroFases: fasesEnvio })

        if ('error' in result) {
          falhar(result.error || 'Erro ao salvar projeto')
          if (editId) toast(result.error || 'Erro ao salvar projeto', 'error')
          return
        }
        setSyncProjectId(result.projeto.id as string)
        setSyncPending(result.macroFasesSync?.pending ?? false)
        if (editId) { setConfirmacaoSalvo(n => n + 1); setSalvo(enviado); setRestaurando(null); setRecarregarHistorico(n => n + 1) }
        setVerAlteracoes(false)
        setConfirmarNovoSalvamento(false)
        if (restauracao) {
          setForm(dadosForm)
          setMacroFases(dadosFases.length ? dadosFases : [novaFase()])
          setVersaoParaRestaurar(null)
          setVerHistorico(false)
          setEstadoVersoes(e => ({ ...e, ativa: origem ?? e.ativa }))
          toast(`Versão ${origem} está ativa. O histórico foi preservado.`, 'success')
        }
        if (result.macroFasesSync?.pending) return
        if (editId) {
          if (!restauracao) toast('Projeto atualizado com sucesso!', 'success')
        } else {
          router.push(`/projetos/${result.projeto.id}`)
        }
      } catch { falhar('Não foi possível salvar. Suas edições foram preservadas. Tente novamente.') }
    })
  }

  // Sair com alterações: pergunta se quer salvar ou descartar (mesmo aviso dos documentos).
  const { dialogo: dialogoSaida } = useGuardaSaida(editId ? { contexto: 'projeto', pendente, salvar, descartar } : undefined)

  const voltarHref = editId ? `/projetos/${editId}/dashboard` : '/projetos'
  const linha = linhaInstitucional({ location: null, departamentos: [], semestre: form.semestre, termo: form.termo, turno: form.turno, ano: form.ano ? Number(form.ano) : null, anoAms: form.anoAms })
  const alterado = (campo: keyof FormProjeto) => alteracoes.some(a => a.chave === campo)
  const ocupado = isPending || isLoadingEdit
  // Gerente: foto antes do nome. O gerente atual entra na lista mesmo quando ela não foi carregada.
  const pessoasGerente = [...usuarios.filter(u => u.isActive !== false || u.id === form.initialMemberId)]
  if (gerenteAtual && !pessoasGerente.some(u => u.id === gerenteAtual.id)) pessoasGerente.unshift(gerenteAtual)
  const opcoesGerente = [
    { value: '', label: 'Designar depois' },
    ...pessoasGerente.map(u => ({
      value: u.id, label: u.name,
      icone: <UserAvatar name={u.name} avatarUrl={u.avatarUrl ?? (gerenteAtual?.id === u.id ? gerenteAtual.avatarUrl : null)} size="xs" />,
    })),
  ]
  // Local e departamentos mantêm exatamente os valores cadastrados.
  const segmentosLinha = [form.location, ...form.departamentos, ...linha.split(' - ')].filter(t => t.trim())
  const pendenciasFases = fasesPreenchidas.filter(f => !f.dataLimite || !((parseMoeda(f.custo) ?? 0) > 0)).length
  const preenchidos = CAMPOS_TERMO.filter(c => form[c.nome].trim()).length

  useEffect(() => {
    if (!editId) return
    let ativo = true
    void listarVersoesProjetoAction(editId).then(result => {
      if (!ativo || 'error' in result) return
      const ultima = result.versoes[0]?.numero ?? 0
      setEstadoVersoes({ ultima, ativa: result.versoes.find(v => v.ativa)?.numero ?? ultima })
    })
    return () => { ativo = false }
  }, [editId, recarregarHistorico])

  useLayoutEffect(() => {
    if (!verHistorico && !(verAlteracoes && pendente)) return
    const root = raizRef.current
    if (!root) return
    const update = () => setLimiteFundoHistorico(Math.max(0, root.getBoundingClientRect().left))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root)
    window.addEventListener('resize', update)
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [verHistorico, verAlteracoes, pendente])

  return (
    <ProjectAppearance enabled={Boolean(editId)}>
    <div ref={raizRef} className="fundo-vidro relative min-h-screen font-sans">
      <div aria-hidden="true" data-open={verHistorico || (verAlteracoes && pendente)} onClick={() => { setVerHistorico(false); setVerAlteracoes(false) }} className="project-history-backdrop fixed inset-y-0 right-0 z-30" style={{ left: limiteFundoHistorico }} />

      <main className="relative mx-auto max-w-[1280px] px-4 pb-24 pt-5 sm:px-6">
        {syncPending && (
          <div role="status" className="anim-entrar mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>Projeto salvo. A sincronização das macrofases com a EAP está pendente.</p>
            {canEditCosts && syncProjectId && <GlassButton variant="custom" type="button" disabled={isPending} className="mt-2 font-bold underline" onClick={() => startTransition(async () => {
              const result = await retryMacroFasesSyncAction(syncProjectId)
              if ('error' in result) { setError(result.error); return }
              setSyncPending(result.pending)
              if (!result.pending) { toast('Macrofases sincronizadas!', 'success'); if (!editId) router.push(`/projetos/${syncProjectId}`) }
            })}>Tentar sincronizar novamente</GlassButton>}
          </div>
        )}

        {error && (
          <div role="alert" className="anim-entrar mb-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid grid-cols-1 gap-5 lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── Coluna principal: Diretrizes e Escopo | Cronograma Financeiro ── */}
          <div className="order-2 flex min-w-0 flex-col lg:order-1 lg:h-full lg:min-h-0">
            {/* Abas com resumo: as duas partes ficam a um clique, cada uma cabendo na tela. */}
            <GlassSegmentedControl label="Seções do projeto" value={aba} onChange={trocarAba} options={[
              { value: 'diretrizes', label: 'Diretrizes e Escopo', description: `${preenchidos} de ${CAMPOS_TERMO.length} preenchidos`, changed: alteracoes.some(a => CAMPOS_TERMO.some(c => c.nome === a.chave)), id: 'aba-diretrizes', panelId: 'painel-diretrizes' },
              { value: 'cronograma', label: 'Cronograma Financeiro', description: `${fasesPreenchidas.length} ${fasesPreenchidas.length === 1 ? 'fase' : 'fases'} · ${total}`, changed: alteracoes.some(a => a.chave.startsWith('fase:')), id: 'aba-cronograma', panelId: 'painel-cronograma' },
            ]} />

            {abaVisivel === 'diretrizes' && (
              <GlassCard key="diretrizes" id="painel-diretrizes" role="tabpanel" inert={saindo} data-motion={saindo ? 'exit' : 'enter'} data-direction={direcaoAba} aria-labelledby="aba-diretrizes" className={`anim-entrar flex flex-col overflow-hidden lg:min-h-0 lg:flex-1`}>
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 pb-4 pt-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Diretrizes e Escopo</h2>
                    <p className="mt-0.5 text-sm font-medium text-slate-500">{editId ? 'As alterações serão registradas em uma nova versão do Termo de Abertura.' : 'Detalhe as justificativas, metodologia e limites para aprovação deste projeto.'}</p>
                  </div>
                  {editId && <Link href={`/projetos/${editId}/documentacao?doc=charter`} className="shrink-0 pt-1 text-xs font-semibold text-blue-600 hover:underline">Abrir a folha do Termo</Link>}
                </header>
                <div ref={rolagemDiretrizes} className="grid grid-cols-1 gap-x-4 gap-y-3 px-6 pb-6 pt-3 md:grid-cols-2 lg:borda-suave-rolagem lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:scroll-smooth">
                  {[[CAMPOS_TERMO[0]], CAMPOS_TERMO.slice(1, 3), [CAMPOS_TERMO[3]], CAMPOS_TERMO.slice(4, 6), [CAMPOS_TERMO[6]]].map(campos => (
                    <ExpandableFieldGroup key={campos[0].nome}>
                    {controls => campos.map(({ nome, Icone, placeholder, largo }) => (
                    <div key={nome} className={largo ? 'md:col-span-2' : 'min-w-0'}>
                      <ExpandableTextarea
                        id={`termo-${nome}`} readOnly={!canEditPublished} name={nome} value={form[nome]}
                        onChange={e => alterarCampo(nome, e.target.value)} placeholder={placeholder} alturaMinima={70} preencher={!largo}
                        {...controls}
                        rotulo={
                          <span className="ml-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500 transition-colors duration-300 group-focus-within:text-blue-600">
                            <Icone className="h-3.5 w-3.5 shrink-0" />{ROTULOS_PROJETO[nome]}
                            {alterado(nome) && <span className="anim-surgir ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Alterado" />}
                          </span>
                        }
                        className={`${inputClass} resize-none leading-relaxed`}
                      />
                    </div>
                    ))}
                    </ExpandableFieldGroup>
                  ))}
                </div>
              </GlassCard>
            )}

            {abaVisivel === 'cronograma' && (
              <fieldset disabled={!canEditCosts} className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
                <GlassCard key="cronograma" id="painel-cronograma" role="tabpanel" inert={saindo} data-motion={saindo ? 'exit' : 'enter'} data-direction={direcaoAba} aria-labelledby="aba-cronograma" className={`anim-entrar flex flex-col overflow-hidden lg:min-h-0 lg:flex-1`}>
                  {/* Cabeçalho fixo: título, ação e os números do cronograma. */}
                  <header className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-slate-900">Cronograma Financeiro</h2>
                        <p className="mt-0.5 text-sm font-medium text-slate-500">Estime as entregas macro e o orçamento dedicado a cada etapa.</p>
                      </div>
                      <GlassButton variant="custom" type="button" onClick={addMacroFase} className="finance-add-phase pressionavel flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_8px_20px_-8px_rgb(15_23_42/0.6)] hover:bg-slate-800 disabled:opacity-50">
                        <Plus className="h-4 w-4" />Adicionar Fase
                      </GlassButton>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2">
                      <div className="finance-glass-stat rounded-2xl px-4 py-3">
                        <dt className="text-[11px] font-medium text-slate-500">Fases</dt>
                        <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{fasesPreenchidas.length}</dd>
                      </div>
                      <div className="finance-glass-stat rounded-2xl px-4 py-3" data-pending={pendenciasFases > 0}>
                        <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><span aria-hidden="true" className="finance-status-dot h-1.5 w-1.5 shrink-0 rounded-full" />Sem prazo ou custo</dt>
                        <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{pendenciasFases}</dd>
                      </div>
                      <div className="finance-budget-glass rounded-2xl px-4 py-3 text-right text-white">
                        <dt className="text-[11px] font-medium text-white/65">Orçamento total</dt>
                        <dd className="mt-1 text-lg font-semibold tabular-nums tracking-tight sm:text-xl" data-testid="orcamento-total">{total}</dd>
                      </div>
                    </dl>
                  </header>
                  <div aria-hidden="true" className="finance-stable-heading grid shrink-0 grid-cols-[minmax(0,1fr)_124px_140px_44px] text-[11px] font-bold uppercase tracking-widest text-slate-500">
                    <span className="py-2.5 pl-6 pr-4">Descrição da Fase</span>
                    <span className="px-2 py-2.5">Data Limite</span>
                    <span className="px-3 py-2.5 text-right">Custo Previsto</span>
                    <span />
                  </div>
                  <div ref={rolagemFases} className="lg:borda-suave-rolagem-baixo lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
                    <table className="finance-phase-table w-full table-fixed text-left">
                      <colgroup><col /><col className="w-[124px]" /><col className="w-[140px]" /><col className="w-11" /></colgroup>
                      <thead className="sr-only">
                        <tr>
                          <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">Descrição da Fase</th>
                          <th className="px-2 py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Data Limite</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500">Custo Previsto</th>
                          <th><span className="sr-only">Ações</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {macroFases.map((fase, idx) => (
                          <tr key={fase.chave} onClick={event => {
                            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
                            const numero = event.currentTarget.querySelector<HTMLElement>('[data-phase-number]')
                            numero?.getAnimations().forEach(animation => animation.cancel())
                            numero?.animate([
                              { transform: 'scale(1)', offset: 0 },
                              { transform: 'translateY(-2px) scale(1.16)', offset: .4 },
                              { transform: 'translateY(0) scale(.98)', offset: .75 },
                              { transform: 'scale(1)', offset: 1 },
                            ], { duration: 520, easing: 'cubic-bezier(.22, 1, .36, 1)' })
                          }} className={`group align-top transition-colors duration-200 hover:bg-slate-50/50 ${fase.chave.startsWith('nova-') ? 'anim-linha-nova' : ''}`}>
                            <td className="py-1.5 pl-4 pr-1">
                              <div className="flex items-start gap-1.5">
                                <span data-phase-number className="w-7 shrink-0 py-2.5 text-right text-sm tabular-nums text-slate-500">1.{idx + 1}</span>
                                <TextoQueCresce data-fase={fase.chave} aria-label={`Fase 1.${idx + 1}`} value={fase.fase} onChange={v => updateMacroFase(fase.chave, 'fase', v)} placeholder={`Ex: Fase ${idx + 1}...`} className={`${celulaInput} min-w-0 flex-1 font-semibold text-slate-800`} />
                              </div>
                            </td>
                            <td className="px-1 py-1.5">
                              <DateInputBR ariaLabel={`Data limite da fase 1.${idx + 1}`} value={fase.dataLimite} onChange={v => updateMacroFase(fase.chave, 'dataLimite', v)} className={`${celulaInput} px-2 font-medium tabular-nums text-slate-600`} />
                            </td>
                            <td className="px-1 py-1.5">
                              <MoedaInput
                                value={fase.custo}
                                onValueChange={texto => updateMacroFase(fase.chave, 'custo', texto)}
                                rotulo="Custo"
                                aria-label={`Custo da fase ${idx + 1}`}
                                adorno={<span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm font-bold text-slate-400">R$</span>}
                                className={`${celulaInput} pl-8 text-right font-bold tabular-nums text-slate-800`}
                              />
                            </td>
                            <td className="py-1.5 pr-2 text-center">
                              <AnimatedTrashButton label={`Remover fase 1.${idx + 1}`} onDelete={() => removeMacroFase(fase.chave)} disabled={macroFases.length === 1 && !fase.nodeId} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              </fieldset>
            )}
          </div>

          {/* ── Coluna lateral: o projeto e as propriedades ── */}
          <AnimatedCardStack className="project-card-stack order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pb-2">
            <GlassCard className={`overflow-hidden`} aria-label="Projeto">
              <div className="flex items-start gap-3 p-4">
                <ProjetoLogoUpload nome={form.name} url={form.logoUrl} onChange={url => setForm(f => ({ ...f, logoUrl: url }))} disabled={ocupado} tamanho="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{editId ? 'Projeto' : 'Novo projeto'}</p>
                  <TextoQueCresce
                    value={form.name} onChange={v => alterarCampo('name', v.replace(/\n/g, ' '))} aria-label="Nome do projeto" placeholder="Nome do projeto"
                    className="-mx-1.5 block w-[calc(100%+0.75rem)] campo-limpo rounded-lg px-1.5 py-0.5 text-lg font-extrabold leading-tight tracking-tight text-slate-900 placeholder:text-slate-300"
                  />
                  <TextoQueCresce
                    value={form.slogan} onChange={v => alterarCampo('slogan', v.replace(/\n/g, ' '))} aria-label="Slogan / visão" placeholder="Adicione um slogan…"
                    className="-mx-1.5 mt-0.5 block w-[calc(100%+0.75rem)] campo-limpo rounded-lg px-1.5 py-0.5 text-[13px] leading-snug text-slate-500 placeholder:text-slate-400"
                  />
                </div>
              </div>
              {segmentosLinha.length > 0 && (
                <div className="institution-glass-line border-t border-slate-100 px-4 py-3" title="Linha institucional dos documentos">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400"><GraduationCap className="h-3.5 w-3.5" />Nos documentos</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Linha institucional">
                    {segmentosLinha.map((seg, i) => (
                      <li key={i} className="institution-glass-chip rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700">{seg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </GlassCard>

            <GlassCard className={`p-4`} aria-label="Propriedades">
              <h3 className={tituloLateral}>Propriedades</h3>
              <Propriedade Icone={UserRound} rotulo="Gerente" htmlFor="projeto-gerente">
                <Select id="projeto-gerente" propriedade disabled={!canAssignRoles} name="initialMemberId" placeholder="Designar depois" value={form.initialMemberId} onChange={v => alterarCampo('initialMemberId', v)}
                  options={opcoesGerente} />
              </Propriedade>
              <Propriedade Icone={CalendarDays} rotulo="Início">
                {inicioPelaTarefa ? (
                  <div className="flex h-8 items-center justify-between gap-2 px-2.5 text-[13px] font-medium text-slate-600" data-testid="inicio-pela-tarefa" title="Definida pela primeira tarefa do projeto; muda quando as datas das tarefas mudam.">
                    {isoToBR(form.startDate) || '—'}<span className="text-[11px] font-normal text-slate-400">1ª tarefa</span>
                  </div>
                ) : (
                  <SeletorData ariaLabel="Data de início" value={form.startDate} onChange={iso => setForm(prev => ({ ...prev, startDate: iso }))} className={propriedadeInput} />
                )}
              </Propriedade>
              <Propriedade Icone={CalendarClock} rotulo="Fim previsto">
                <SeletorData ariaLabel="Data prevista de fim" value={form.endDate} onChange={iso => setForm(prev => ({ ...prev, endDate: iso }))} className={propriedadeInput} />
              </Propriedade>
              <Propriedade Icone={MapPin} rotulo="Local" htmlFor="projeto-local">
                <input id="projeto-local" name="location" value={form.location} onChange={e => alterarCampo('location', e.target.value)} placeholder="Sede, filial, cliente…" className={propriedadeInput} />
              </Propriedade>
              <div className="py-1">
                <span className="flex items-center gap-2 py-1.5 text-[13px] text-slate-500"><Building2 className="h-4 w-4 text-slate-400" />Departamentos</span>
                <fieldset disabled={!podeDepartamentos} className="min-w-0">
                  <MultiCreatableSelect
                    values={form.departamentos}
                    onChange={v => setForm(f => ({ ...f, departamentos: v }))}
                    options={departamentosExistentes}
                    placeholder="Adicionar departamento..."
                    ariaLabel="Departamentos"
                    disabled={isPending}
                  />
                </fieldset>
              </div>
            </GlassCard>

            <GlassCard className={`p-4`} aria-label="Turma">
              <h3 className={tituloLateral}>Turma</h3>
              <GlassSegmentedControl variant="compact" label="Período" value={form.semestre} onChange={v => alterarCampo('semestre', v)} options={[
                { value: '1', label: '1º Sem.' }, { value: '2', label: '2º Sem.' }, { value: 'ano', label: 'Ano' },
              ]} />
              <Propriedade Icone={CalendarDays} rotulo="Ano" htmlFor="projeto-ano">
                <Select id="projeto-ano" propriedade name="ano" placeholder="Selecione" value={form.ano} onChange={v => alterarCampo('ano', v)}
                  options={[...new Set([...years, ...(form.ano ? [Number(form.ano)] : [])])].sort((a, b) => b - a).map(y => ({ value: String(y), label: String(y), ...(y === currentYear ? { description: 'Ano atual' } : {}) }))} />
              </Propriedade>
              {form.semestre === 'ano' && (
                <Propriedade Icone={GraduationCap} rotulo="Ano do AMS" htmlFor="projeto-ano-ams">
                  <Select id="projeto-ano-ams" propriedade name="anoAms" searchable={false} placeholder="Selecione" value={form.anoAms} onChange={v => alterarCampo('anoAms', v)}
                    options={[{ value: '1', label: '1º' }, { value: '2', label: '2º' }]} />
                </Propriedade>
              )}
              {periodoEhSemestral(form.semestre) && (
                <>
                  <Propriedade Icone={Layers} rotulo="Termo" htmlFor="projeto-termo">
                    <input id="projeto-termo" name="termo" type="text" inputMode="numeric" maxLength={20} value={form.termo} onChange={e => alterarCampo('termo', e.target.value)} placeholder="Ex.: 5" className={propriedadeInput} />
                  </Propriedade>
                  <Propriedade Icone={Flag} rotulo="Turno" htmlFor="projeto-turno">
                    <Select id="projeto-turno" propriedade name="turno" searchable={false} placeholder="Selecione" value={form.turno} onChange={v => alterarCampo('turno', v)}
                      options={[...new Set([...TURNOS, ...(form.turno ? [form.turno] : [])])].map(t => ({ value: t, label: t }))} />
                  </Propriedade>
                </>
              )}
              {!form.semestre && <p className="px-1 pt-1 text-xs text-slate-500">Escolha o período para preencher a turma.</p>}
            </GlassCard>
          </AnimatedCardStack>
        </form>
        {/* Barra centralizada na janela, independente da largura da sidebar. */}
        <div className="project-save-dock fixed bottom-8 left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2" style={{ width: editId && !pendente ? 420 : 880 }}>
          {editId && (
            <HistoricoProjeto
              projetoId={editId} aberto={verHistorico} origemX={origemHistorico} salvo={salvo} recarregar={recarregarHistorico}
              nomeDoUsuario={id => (usuarios.find(u => u.id === id) ?? (gerenteAtual?.id === id ? gerenteAtual : null))?.name ?? 'Membro'}
              onFechar={() => setVerHistorico(false)} onRestaurar={restaurar}
            />
          )}
          {/* Painel flutua acima da barra (não empurra nada) e entra/sai com transição. */}
          {pendente && (
            <div
              role="dialog" aria-label="Alterações não salvas" aria-hidden={!verAlteracoes} inert={!verAlteracoes}
              data-open={verAlteracoes} data-visited={alteracoesJaAbertas}
              style={{ '--history-drop-x': origemHistorico !== undefined ? `${origemHistorico}px` : '50%' } as CSSProperties}
              className="project-changes-panel project-history-panel absolute bottom-full mb-3 vidro-flutuante rounded-[22px] p-3"
            >
              <div className="flex items-center justify-between px-3 py-2">
                <h3 className="text-sm font-bold text-slate-900">O que mudou desde o último salvamento</h3>
                <GlassCloseButton label="Fechar" onClick={() => setVerAlteracoes(false)} className="project-history-close" />
              </div>
              <ul className="space-y-3 px-1 pb-1 pt-2">
                {alteracoes.map(a => (
                  <li key={a.chave} className="history-version-card rounded-2xl px-4 py-3" data-testid="alteracao">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{a.rotulo}</span>
                      <UndoChangeButton label={a.rotulo} onUndo={() => desfazer(a.chave)} />
                    </div>
                    {a.texto ? <DiffTexto antes={a.antes} depois={a.depois} /> : (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {a.antes ? <del className="rounded-lg bg-rose-50 px-2 py-0.5 text-rose-700">{a.antes}</del> : <span className="text-slate-400">vazio</span>}
                        <span className="text-slate-400" aria-hidden="true">→</span>
                        {a.depois ? <ins className="rounded-lg bg-emerald-50 px-2 py-0.5 text-emerald-800 no-underline">{a.depois}</ins> : <span className="text-slate-400">vazio</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="project-save-dock-surface vidro-flutuante relative flex items-center gap-2 rounded-[22px] py-2 pl-4 pr-2">
            {confirmacaoSalvo > 0 && !pendente && <span key={confirmacaoSalvo} aria-hidden="true" className="project-save-glint pointer-events-none absolute inset-0 rounded-[22px]" />}
            {editId && estadoVersoes.ativa > 0 && <span className="project-active-version shrink-0 rounded-xl px-3 py-2 text-xs font-semibold tabular-nums" aria-label={`Versão ativa: ${estadoVersoes.ativa}`} title={pendente ? `Editando a partir da versão ${estadoVersoes.ativa}` : `Versão ${estadoVersoes.ativa} ativa`} aria-live="polite">v{estadoVersoes.ativa}</span>}
            {!editId ? (
              <span className="flex-1 text-sm font-medium text-slate-600">Preencha os dados e crie o projeto.</span>
            ) : pendente ? (
              <GlassButton variant="custom" key="pendente" type="button" onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect()
                setOrigemHistorico(rect.left + rect.width / 2 - (window.innerWidth - Math.min(680, window.innerWidth - 32)) / 2)
                setAlteracoesJaAbertas(true)
                setVerHistorico(false); setVerAlteracoes(v => !v)
              }} aria-expanded={verAlteracoes} aria-label={`${alteracoes.length} ${alteracoes.length === 1 ? 'alteração não salva' : 'alterações não salvas'}. ${verAlteracoes ? 'Fechar detalhes' : 'Abrir detalhes'}`} className="project-unsaved-status anim-entrar flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium text-slate-700 transition-colors hover:text-slate-900">
                <span className={`anim-surgir h-2 w-2 shrink-0 rounded-full transition-colors duration-300 ${restaurando ? 'bg-blue-500' : 'bg-amber-500'}`} />
                {restaurando && <span className="shrink-0 font-semibold text-blue-700">Restaurando a v{restaurando} ·</span>}
                <span className="project-pending-copy flex min-w-0 items-center gap-2"><span className="project-pending-count shrink-0 rounded-lg px-1.5 py-0.5 text-xs font-semibold tabular-nums">{alteracoes.length}</span><span className="truncate">{alteracoes.length === 1 ? 'alteração não salva' : 'alterações não salvas'}</span></span>
                <ChevronDown data-open={verAlteracoes} className="project-changes-arrow h-4 w-4 shrink-0 text-slate-400" />
              </GlassButton>
            ) : (
              <span key="salvo" role="status" className="project-saved-status anim-entrar flex min-w-0 flex-1 items-center gap-2.5 text-sm font-medium text-slate-500">
                <span className="project-saved-seal flex h-7 w-7 shrink-0 items-center justify-center rounded-full"><CheckCircle2 className="anim-mola h-4 w-4" strokeWidth={1.7} /></span><span>{isLoadingEdit ? 'Carregando…' : 'Tudo salvo'}</span>
              </span>
            )}
            {editId && (
              <GlassButton onClick={event => {
                const rect = event.currentTarget.getBoundingClientRect()
                const painelWidth = Math.min(680, window.innerWidth - 32)
                setOrigemHistorico(rect.left + rect.width / 2 - (window.innerWidth - painelWidth) / 2)
                setVerAlteracoes(false); setVerHistorico(v => !v)
              }} aria-expanded={verHistorico} className="project-dock-history">
                <History className="h-4 w-4" />Histórico
              </GlassButton>
            )}
            {editId
              ? pendente && <GlassButton onClick={descartar} disabled={isPending} className="project-dock-discard"><Undo2 className="h-4 w-4" />Descartar</GlassButton>
              : <Link href={voltarHref} className="pressionavel rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-900/[0.05]">Cancelar</Link>}
            {(!editId || pendente) && <span aria-hidden="true" className="project-dock-divider mx-1 h-6 w-px shrink-0" />}
            {(!editId || pendente) && <GlassButton variant="primary" onClick={salvar} disabled={ocupado} className="project-dock-save shrink-0">
              {isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Save className="project-save-icon h-4 w-4" strokeWidth={1.7} />}
              {isPending ? (editId ? 'Salvando…' : 'Criando…') : (editId ? 'Salvar alterações' : 'Criar projeto')}
            </GlassButton>}
          </div>
        </div>
      </main>

      {confirmarNovoSalvamento && <Modal isOpen title="Salvar como nova versão?" className="phase-delete-dialog" onClose={() => { if (!isPending) setConfirmarNovoSalvamento(false) }}>
        <p className="phase-delete-muted text-sm leading-relaxed">A versão ativa é a v{estadoVersoes.ativa}. Este salvamento substitui o estado atual e cria a v{estadoVersoes.ultima + 1}. As versões anteriores continuam disponíveis no histórico.</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-3"><GlassButton autoFocus disabled={isPending} onClick={() => setConfirmarNovoSalvamento(false)}>Cancelar</GlassButton><GlassButton variant="primary" disabled={isPending} onClick={() => persistirProjeto(form, macroFases, estadoVersoes.ativa, false)}>{isPending ? 'Salvando…' : `Salvar como v${estadoVersoes.ultima + 1}`}</GlassButton></div>
      </Modal>}
      {versaoParaRestaurar && <RestaurarVersaoDialog numero={versaoParaRestaurar.numero} fasesMantidas={versaoParaRestaurar.dados.fasesMantidas} alteracoesPendentes={pendente} ocupado={isPending} erro={erroRestauracao} onClose={() => { if (!isPending) setVersaoParaRestaurar(null) }} onConfirm={confirmarRestauracao} />}
      {editId && (
        <ExcluirFaseDialog projetoId={editId} fase={faseAExcluir} versao={versaoDaExclusao} onFechar={() => setFaseAExcluir(null)} onExcluida={faseExcluida} />
      )}
      {dialogoSaida}
    </div>
    </ProjectAppearance>
  )
}
