'use client'

import Select from '@/components/ui/Select'
import MoedaInput from '@/components/ui/MoedaInput'
import { parseMoeda } from '@/lib/dinheiro'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import { useState, useTransition, useEffect, useLayoutEffect, useMemo, useRef, Suspense, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle, Building2, CheckCircle2, CalendarClock, CalendarDays, ChevronDown, Flag, GraduationCap, Layers, Lightbulb,
  ListChecks, MapPin, Package, Plus, Scale, ShieldAlert, Target, Trash2, Undo2, UserRound, Wrench, X,
} from 'lucide-react'
import { createProjetoAction, updateProjetoAction, getProjetoAction, retryMacroFasesSyncAction } from '@/app/actions/projetos'
import { listUsersAction } from '@/app/actions/admin'
import { getDepartmentsAction } from '@/app/actions/departments'
import { useToast } from '@/components/ui/Toast'
import MultiCreatableSelect from '@/components/ui/MultiCreatableSelect'
import ExpandableTextarea from '@/components/ui/ExpandableTextarea'
import ProjetoLogoUpload from '@/components/projetos/ProjetoLogoUpload'
import { useGuardaSaida } from '@/components/documentos/editor/GuardaSaida'
import { linhaInstitucional, periodoEhSemestral, TURNOS } from '@/lib/linhaInstitucional'
import { desfazerAlteracao, listarAlteracoes, ROTULOS_PROJETO, type CampoTextoTermo, type FaseForm, type FormProjeto } from '@/lib/alteracoesProjeto'
import { diffTexto } from '@/lib/diffTexto'

interface Usuario {
  id: string
  name: string
  email: string
  isActive?: boolean
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
const card = 'rounded-2xl border border-slate-200/70 bg-white shadow-sm'
const inputClass = 'w-full px-4 py-3 bg-slate-50/50 border border-slate-200/60 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200 text-slate-800 font-medium'
const celulaInput = 'w-full px-3 py-2.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg text-sm transition-all outline-none'
/** Valor de uma linha de propriedades: texto, fundo só ao passar o mouse ou editar. */
const propriedadeInput = 'h-8 w-full rounded-lg bg-transparent px-2.5 text-[13px] font-medium text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent'
const tituloLateral = 'mb-1 px-1 text-[11px] font-bold uppercase tracking-widest text-slate-400'

function Propriedade({ Icone, rotulo, htmlFor, children }: { Icone: typeof Flag; rotulo: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[124px_1fr] items-center gap-2 py-1">
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
  const [departamentosExistentes, setDepartamentosExistentes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [syncPending, setSyncPending] = useState(false)
  const [syncProjectId, setSyncProjectId] = useState<string | null>(editId)

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 26 }, (_, i) => currentYear - 20 + i)

  const [form, setForm] = useState<FormProjeto>(FORM_VAZIO)
  const [macroFases, setMacroFases] = useState<FaseForm[]>(() => [novaFase()])
  /** Como o projeto está salvo (base de "Alterações não salvas"). Nulo ao criar. */
  const [salvo, setSalvo] = useState<{ form: FormProjeto; fases: FaseForm[] } | null>(null)
  const [verAlteracoes, setVerAlteracoes] = useState(false)
  const [inicioPelaTarefa, setInicioPelaTarefa] = useState(false)
  const [aba, setAba] = useState<'diretrizes' | 'cronograma'>('diretrizes')
  const rolagemDiretrizes = useRef<HTMLDivElement>(null)
  const rolagemFases = useRef<HTMLDivElement>(null)
  const faseNova = useRef<string | null>(null)

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
        ? p.macroFases.map((f, i) => ({ chave: `salva-${i}`, fase: f.fase, dataLimite: f.dataLimite ?? '', custo: f.custo ?? '' }))
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
    const campo = rolagemFases.current?.querySelector<HTMLTextAreaElement>(`[data-fase="${chave}"]`)
    campo?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    campo?.focus({ preventScroll: true })
  }, [macroFases])
  const updateMacroFase = (chave: string, field: 'fase' | 'dataLimite' | 'custo', value: string) => {
    if (canEditCosts) setMacroFases(l => l.map(f => (f.chave === chave ? { ...f, [field]: value } : f)))
  }
  const removeMacroFase = (chave: string) => {
    if (canEditCosts && macroFases.length > 1) setMacroFases(l => l.filter(f => f.chave !== chave))
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
    if (!salvo) return
    setForm(salvo.form)
    setMacroFases(salvo.fases.length ? salvo.fases : [novaFase()])
    setVerAlteracoes(false)
    setError('')
  }
  function desfazer(chave: string) {
    if (!salvo) return
    const r = desfazerAlteracao(chave, salvo, { form, fases: macroFases })
    setForm(r.form)
    setMacroFases(r.fases.length ? r.fases : [novaFase()])
  }

  function salvar() {
    setError('')
    if (!form.name.trim()) {
      setError('O Nome do Projeto é obrigatório.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const fasesEnvio = macroFases.map(({ fase, dataLimite, custo }) => ({ fase, dataLimite, custo }))
    const enviado = { form, fases: fasesPreenchidas }

    startTransition(async () => {
      const update: Record<string, unknown> = { ...form, anoAms: form.semestre === 'ano' ? form.anoAms || null : null }
      // Termo/turno só valem para período semestral; ao mudar para anual, limpa.
      if (!periodoEhSemestral(form.semestre)) { update.termo = ''; update.turno = '' }
      if (!canAssignRoles) delete update.initialMemberId
      if (!podeDepartamentos) delete update.departamentos
      if (canEditCosts) update.macroFases = fasesEnvio
      if (!canEditPublished) {
        for (const key of ['justificativa','objetivos','metodologia','descricaoProduto','premissas','restricoes','limitesAutoridade']) delete update[key]
      }
      const result = editId
        ? await updateProjetoAction(undefined, editId, update)
        : await createProjetoAction(undefined, { ...form, macroFases: fasesEnvio })

      if ('error' in result) {
        setError(result.error || 'Erro ao salvar projeto')
        if (editId) toast(result.error || 'Erro ao salvar projeto', 'error')
        return
      }
      setSyncProjectId(result.projeto.id as string)
      setSyncPending(result.macroFasesSync?.pending ?? false)
      if (editId) setSalvo(enviado)
      setVerAlteracoes(false)
      if (result.macroFasesSync?.pending) return
      if (editId) {
        toast('Projeto atualizado com sucesso!', 'success')
      } else {
        router.push(`/projetos/${result.projeto.id}`)
      }
    })
  }

  // Sair com alterações: pergunta se quer salvar ou descartar (mesmo aviso dos documentos).
  const { dialogo: dialogoSaida } = useGuardaSaida(editId ? { pendente, salvar, descartar } : undefined)

  const voltarHref = editId ? `/projetos/${editId}/dashboard` : '/projetos'
  const linha = linhaInstitucional({ location: form.location, departamentos: form.departamentos, semestre: form.semestre, termo: form.termo, turno: form.turno, ano: form.ano ? Number(form.ano) : null, anoAms: form.anoAms })
  const alterado = (campo: keyof FormProjeto) => alteracoes.some(a => a.chave === campo)
  const ocupado = isPending || isLoadingEdit
  // Linha institucional em partes ("Fatec Garça", "ADS", "2º Semestre 2026"…), para ler sem esforço.
  const segmentosLinha = linha ? linha.split(' - ').map(t => t.trim()).filter(Boolean) : []
  const pendenciasFases = fasesPreenchidas.filter(f => !f.dataLimite || !((parseMoeda(f.custo) ?? 0) > 0)).length
  const preenchidos = CAMPOS_TERMO.filter(c => form[c.nome].trim()).length

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] font-sans">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[260px] w-full max-w-3xl -translate-x-1/2 rounded-full bg-blue-500/5 blur-[120px]" />

      <main className="relative mx-auto max-w-[1280px] px-4 pb-4 pt-5 sm:px-6">
        {syncPending && (
          <div role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p>Projeto salvo. A sincronização das macrofases com a EAP está pendente.</p>
            {canEditCosts && syncProjectId && <button type="button" disabled={isPending} className="mt-2 font-bold underline" onClick={() => startTransition(async () => {
              const result = await retryMacroFasesSyncAction(syncProjectId)
              if ('error' in result) { setError(result.error); return }
              setSyncPending(result.pending)
              if (!result.pending) { toast('Macrofases sincronizadas!', 'success'); if (!editId) router.push(`/projetos/${syncProjectId}`) }
            })}>Tentar sincronizar novamente</button>}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm font-semibold text-red-600">
            <AlertTriangle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); salvar() }} className="grid grid-cols-1 gap-5 lg:h-[calc(100dvh-7.5rem)] lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── Coluna principal: Diretrizes e Escopo | Cronograma Financeiro ── */}
          <div className="order-2 flex min-w-0 flex-col lg:order-1 lg:h-full lg:min-h-0">
            {/* Abas com resumo: as duas partes ficam a um clique, cada uma cabendo na tela. */}
            <div role="tablist" aria-label="Seções do projeto" className="mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-2xl border border-slate-200/50 bg-slate-200/50 p-1.5 shadow-sm">
              {([
                ['diretrizes', 'Diretrizes e Escopo', `${preenchidos} de ${CAMPOS_TERMO.length} preenchidos`, alteracoes.some(a => (CAMPOS_TERMO as { nome: string }[]).some(c => c.nome === a.chave))],
                ['cronograma', 'Cronograma Financeiro', `${fasesPreenchidas.length} ${fasesPreenchidas.length === 1 ? 'fase' : 'fases'} · ${total}`, alteracoes.some(a => a.chave.startsWith('fase:'))],
              ] as const).map(([id, titulo, resumo, mudou]) => (
                <button
                  key={id} type="button" role="tab" id={`aba-${id}`} aria-selected={aba === id} aria-controls={`painel-${id}`}
                  onClick={() => setAba(id)}
                  className={`flex min-w-0 flex-col items-start rounded-xl px-4 py-2 text-left transition-all ${aba === id ? 'border border-slate-200/40 bg-white shadow-sm' : 'border border-transparent hover:bg-slate-200/60'}`}
                >
                  <span className={`flex items-center gap-1.5 text-sm font-bold ${aba === id ? 'text-slate-900' : 'text-slate-600'}`}>
                    {titulo}{mudou && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Com alterações" />}
                  </span>
                  <span className="truncate text-xs font-medium text-slate-500">{resumo}</span>
                </button>
              ))}
            </div>

            {aba === 'diretrizes' && (
              <section id="painel-diretrizes" role="tabpanel" aria-labelledby="aba-diretrizes" className={`${card} flex flex-col overflow-hidden lg:min-h-0 lg:flex-1`}>
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 pb-4 pt-5">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Diretrizes e Escopo</h2>
                    <p className="mt-0.5 text-sm font-medium text-slate-500">{editId ? 'As alterações serão registradas em uma nova versão do Termo de Abertura.' : 'Detalhe as justificativas, metodologia e limites para aprovação deste projeto.'}</p>
                  </div>
                  {editId && <Link href={`/projetos/${editId}/documentacao?doc=charter`} className="shrink-0 pt-1 text-xs font-semibold text-blue-600 hover:underline">Abrir a folha do Termo</Link>}
                </header>
                <div ref={rolagemDiretrizes} className="grid grid-cols-1 gap-x-4 gap-y-3 px-6 pb-6 pt-3 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                  {CAMPOS_TERMO.map(({ nome, Icone, placeholder, largo }) => (
                    <div key={nome} className={largo ? 'md:col-span-2' : 'min-w-0'}>
                      <ExpandableTextarea
                        id={`termo-${nome}`} readOnly={!canEditPublished} name={nome} value={form[nome]}
                        onChange={e => alterarCampo(nome, e.target.value)} placeholder={placeholder} alturaMinima={70} preencher={!largo}
                        rotulo={
                          <span className="ml-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                            <Icone className="h-3.5 w-3.5 shrink-0" />{ROTULOS_PROJETO[nome]}
                            {alterado(nome) && <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Alterado" />}
                          </span>
                        }
                        className={`${inputClass} resize-none leading-relaxed`}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {aba === 'cronograma' && (
              <fieldset disabled={!canEditCosts} className="flex min-w-0 flex-col lg:min-h-0 lg:flex-1">
                <section id="painel-cronograma" role="tabpanel" aria-labelledby="aba-cronograma" className={`${card} flex flex-col overflow-hidden lg:min-h-0 lg:flex-1`}>
                  {/* Cabeçalho fixo: título, ação e os números do cronograma. */}
                  <header className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 className="text-lg font-bold text-slate-900">Cronograma Financeiro</h2>
                        <p className="mt-0.5 text-sm font-medium text-slate-500">Estime as entregas macro e o orçamento dedicado a cada etapa.</p>
                      </div>
                      <button type="button" onClick={addMacroFase} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-50">
                        <Plus className="h-4 w-4" />Adicionar Fase
                      </button>
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-slate-50 px-4 py-2.5 ring-1 ring-inset ring-slate-200/70">
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Fases</dt>
                        <dd className="text-lg font-black tabular-nums text-slate-900">{fasesPreenchidas.length}</dd>
                      </div>
                      <div className={`rounded-xl px-4 py-2.5 ring-1 ring-inset ${pendenciasFases ? 'bg-amber-50 ring-amber-200' : 'bg-slate-50 ring-slate-200/70'}`}>
                        <dt className={`text-[10px] font-bold uppercase tracking-widest ${pendenciasFases ? 'text-amber-700' : 'text-slate-400'}`}>Sem prazo ou custo</dt>
                        <dd className={`text-lg font-black tabular-nums ${pendenciasFases ? 'text-amber-800' : 'text-slate-900'}`}>{pendenciasFases}</dd>
                      </div>
                      <div className="rounded-xl bg-slate-900 px-4 py-2.5 text-right text-white">
                        <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Orçamento total</dt>
                        <dd className="text-lg font-black tabular-nums tracking-tight" data-testid="orcamento-total">{total}</dd>
                      </div>
                    </dl>
                  </header>
                  <div ref={rolagemFases} className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                    <table className="w-full table-fixed text-left">
                      <colgroup><col /><col className="w-[124px]" /><col className="w-[140px]" /><col className="w-11" /></colgroup>
                      <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur">
                        <tr>
                          <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">Descrição da Fase</th>
                          <th className="px-2 py-2.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">Data Limite</th>
                          <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-widest text-slate-500">Custo Previsto</th>
                          <th><span className="sr-only">Ações</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {macroFases.map((fase, idx) => (
                          <tr key={fase.chave} className="group align-top transition-colors hover:bg-slate-50/50">
                            <td className="py-1.5 pl-4 pr-1">
                              <div className="flex items-start gap-1.5">
                                <span className="w-7 shrink-0 py-2.5 text-right text-sm tabular-nums text-slate-500">1.{idx + 1}</span>
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
                              <button type="button" aria-label={`Remover fase 1.${idx + 1}`} onClick={() => removeMacroFase(fase.chave)} disabled={macroFases.length === 1} className="mt-0.5 rounded-lg p-2 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </fieldset>
            )}
          </div>

          {/* ── Coluna lateral: o projeto e as propriedades ── */}
          <aside className="order-1 space-y-4 lg:order-2 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pb-2">
            <section className={`${card} overflow-hidden`} aria-label="Projeto">
              <div className="flex items-start gap-3 p-4">
                <ProjetoLogoUpload nome={form.name} url={form.logoUrl} onChange={url => setForm(f => ({ ...f, logoUrl: url }))} disabled={ocupado} tamanho="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{editId ? 'Projeto' : 'Novo projeto'}</p>
                  <TextoQueCresce
                    value={form.name} onChange={v => alterarCampo('name', v.replace(/\n/g, ' '))} aria-label="Nome do projeto" placeholder="Nome do projeto"
                    className="-mx-1.5 block w-[calc(100%+0.75rem)] rounded-lg px-1.5 py-0.5 text-lg font-extrabold leading-tight tracking-tight text-slate-900 outline-none placeholder:text-slate-300 hover:bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                  <TextoQueCresce
                    value={form.slogan} onChange={v => alterarCampo('slogan', v.replace(/\n/g, ' '))} aria-label="Slogan / visão" placeholder="Adicione um slogan…"
                    className="-mx-1.5 mt-0.5 block w-[calc(100%+0.75rem)] rounded-lg px-1.5 py-0.5 text-[13px] leading-snug text-slate-500 outline-none placeholder:text-slate-400 hover:bg-slate-50 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>
              {segmentosLinha.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3" title="Linha institucional dos documentos">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400"><GraduationCap className="h-3.5 w-3.5" />Nos documentos</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Linha institucional">
                    {segmentosLinha.map((seg, i) => (
                      <li key={i} className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">{seg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className={`${card} p-4`} aria-label="Propriedades">
              <h3 className={tituloLateral}>Propriedades</h3>
              <Propriedade Icone={UserRound} rotulo="Gerente" htmlFor="projeto-gerente">
                <Select id="projeto-gerente" propriedade disabled={!canAssignRoles} name="initialMemberId" placeholder="Designar depois" value={form.initialMemberId} onChange={v => alterarCampo('initialMemberId', v)}
                  options={[{ value: '', label: 'Designar depois' }, ...usuarios.filter(u => u.isActive !== false || u.id === form.initialMemberId).map(u => ({ value: u.id, label: u.name }))]} />
              </Propriedade>
              <Propriedade Icone={CalendarDays} rotulo="Início">
                {inicioPelaTarefa ? (
                  <div className="flex h-8 items-center justify-between gap-2 px-2.5 text-[13px] font-medium text-slate-600" data-testid="inicio-pela-tarefa" title="Definida pela primeira tarefa do projeto; muda quando as datas das tarefas mudam.">
                    {isoToBR(form.startDate) || '—'}<span className="text-[11px] font-normal text-slate-400">1ª tarefa</span>
                  </div>
                ) : (
                  <DateInputBR ariaLabel="Data de início" value={form.startDate} onChange={iso => setForm(prev => ({ ...prev, startDate: iso }))} className={propriedadeInput} />
                )}
              </Propriedade>
              <Propriedade Icone={CalendarClock} rotulo="Fim previsto">
                <DateInputBR ariaLabel="Data prevista de fim" value={form.endDate} onChange={iso => setForm(prev => ({ ...prev, endDate: iso }))} className={propriedadeInput} />
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
            </section>

            <section className={`${card} p-4`} aria-label="Turma">
              <h3 className={tituloLateral}>Turma</h3>
              <div role="radiogroup" aria-label="Período" className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                {[['1', '1º Sem.'], ['2', '2º Sem.'], ['ano', 'Ano']].map(([v, r]) => (
                  <button key={v} type="button" role="radio" aria-checked={form.semestre === v} onClick={() => alterarCampo('semestre', v)}
                    className={`rounded-lg px-2 py-1.5 text-center transition ${form.semestre === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <Propriedade Icone={CalendarDays} rotulo="Ano" htmlFor="projeto-ano">
                <input id="projeto-ano" name="ano" type="number" min={currentYear - 20} max={currentYear + 5} list="anos-sugeridos" value={form.ano} onChange={e => alterarCampo('ano', e.target.value)} placeholder="Ano" className={propriedadeInput} />
                <datalist id="anos-sugeridos">
                  {[...new Set([...years, ...(form.ano ? [Number(form.ano)] : [])])].sort((a, b) => a - b).map(y => <option key={y} value={String(y)}>{y}</option>)}
                </datalist>
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
            </section>
          </aside>
        </form>
        {/* ── Barra de salvar: sempre visível. No computador fica logo abaixo das colunas (a página não rola);
            no celular, presa ao rodapé enquanto a página rola. ── */}
        <div className="sticky bottom-4 z-40 mx-auto mt-3 w-full max-w-[720px]">
          {verAlteracoes && pendente && (
            <div role="dialog" aria-label="Alterações não salvas" className="mb-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
              <div className="flex items-center justify-between px-3 py-2">
                <h3 className="text-sm font-bold text-slate-900">O que mudou desde o último salvamento</h3>
                <button type="button" aria-label="Fechar" onClick={() => setVerAlteracoes(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
              </div>
              <ul className="space-y-1">
                {alteracoes.map(a => (
                  <li key={a.chave} className="rounded-xl px-3 py-2.5 hover:bg-slate-50" data-testid="alteracao">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{a.rotulo}</span>
                      <button type="button" onClick={() => desfazer(a.chave)} aria-label={`Desfazer ${a.rotulo}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                        <Undo2 className="h-3.5 w-3.5" />Desfazer
                      </button>
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
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur">
            {!editId ? (
              <span className="flex-1 text-sm font-medium text-slate-600">Preencha os dados e crie o projeto.</span>
            ) : pendente ? (
              <button type="button" onClick={() => setVerAlteracoes(v => !v)} aria-expanded={verAlteracoes} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-medium text-slate-700 hover:text-slate-900">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <span className="truncate">{alteracoes.length} {alteracoes.length === 1 ? 'alteração não salva' : 'alterações não salvas'}</span>
                <span className="shrink-0 text-xs font-semibold text-blue-600">{verAlteracoes ? 'Ocultar' : 'Ver o que mudou'}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${verAlteracoes ? '' : 'rotate-180'}`} />
              </button>
            ) : (
              <span role="status" className="flex flex-1 items-center gap-2 text-sm font-medium text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />{isLoadingEdit ? 'Carregando…' : 'Tudo salvo'}
              </span>
            )}
            {editId
              ? pendente && <button type="button" onClick={descartar} disabled={isPending} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Descartar</button>
              : <Link href={voltarHref} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</Link>}
            <button type="button" onClick={salvar} disabled={ocupado || (!!editId && !pendente)} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600">
              {isPending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {isPending ? (editId ? 'Salvando…' : 'Criando…') : (editId ? 'Salvar alterações' : 'Criar projeto')}
            </button>
          </div>
        </div>
      </main>

      {dialogoSaida}
    </div>
  )
}
