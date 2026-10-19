'use client'

import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useState, useTransition, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { createProjetoAction, updateProjetoAction, getProjetoAction, retryMacroFasesSyncAction } from '@/app/actions/projetos'
import { listUsersAction } from '@/app/actions/admin'
import { getDepartmentsAction } from '@/app/actions/departments'
import { useToast } from '@/components/ui/Toast'
import AvatarUpload from '@/components/profile/AvatarUpload'
import MultiCreatableSelect from '@/components/ui/MultiCreatableSelect'
import Link from 'next/link'
import ExpandableTextarea from '@/components/ui/ExpandableTextarea'

interface Usuario {
  id: string
  name: string
  email: string
  isActive?: boolean
}

interface MacroFase {
  fase: string
  dataLimite: string
  custo: string
}

const IconPlus = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
  </svg>
)

const IconTrash = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

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

const formatCurrency = (value: string) => {
    if (!value) return '';
    
    // Remove tudo que não é número
    const rawValue = value.replace(/\D/g, '');
    if (rawValue === '') return '';

    // Converte para decimal (ex: digitou 1000 -> vira 10.00)
    const numberValue = parseInt(rawValue, 10) / 100;

    // Formata para o padrão pt-BR (1.000,00)
    return numberValue.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

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
}: {
  value: string
  onChange: (iso: string) => void
  className?: string
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

function ProjetoFormContent({ canAssignRoles }: { canAssignRoles: boolean }) {
  const permissions = useProjectPermissions()
  const canEditCosts = permissions.has('planilha:orcado') && permissions.has('planilha:realizado-todos')
  const router = useRouter()
  const searchParams = useSearchParams()
  const params = useParams<{ projetoId?: string }>()
  const editId = params.projetoId ?? searchParams.get('edit')
  const canEditPublished = permissions.has('documentos:editar') && permissions.has('documentos:aprovar')
  const { toast } = useToast()

  const [isPending, startTransition] = useTransition()
  const [isLoadingEdit, setIsLoadingEdit] = useState(!!editId)

  const [activeTab, setActiveTab] = useState<'basico' | 'estrategico' | 'fases'>('basico')

  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [departamentosExistentes, setDepartamentosExistentes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [syncPending, setSyncPending] = useState(false)
  const [syncProjectId, setSyncProjectId] = useState<string | null>(editId)

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 26 }, (_, i) => currentYear - 20 + i)

  const [form, setForm] = useState({
    name: '', slogan: '', startDate: '', endDate: '', location: '',
    logoUrl: '', initialMemberId: '',
    justificativa: '', objetivos: '', metodologia: '', descricaoProduto: '',
    premissas: '', restricoes: '', limitesAutoridade: '',
    semestre: '', ano: '',
    departamentos: [] as string[],
  })

  const [macroFases, setMacroFases] = useState<MacroFase[]>([{ fase: '', dataLimite: '', custo: '' }])

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
      const associados = (result as { departamentosAssociados?: { id: string; name: string }[] }).departamentosAssociados
      const gerenteId = (result as { gerenteId?: string }).gerenteId ?? ''
      const publishedForm = {
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
        ano: p.ano ? String(p.ano) : '',
        // Fonte da verdade: associações reais (ProjetoDepartamento). Fallback para
        // as strings legadas de projetos anteriores à sincronização.
        departamentos: associados?.length ? associados.map(d => d.name) : (p.departamentos ?? []),
      }
      setForm(publishedForm)
      const publishedMacroFases = p.macroFases?.length
        ? p.macroFases.map(f => ({ fase: f.fase, dataLimite: f.dataLimite ?? '', custo: f.custo ?? '' }))
        : macroFases
      if (p.macroFases?.length) setMacroFases(publishedMacroFases)
      setIsLoadingEdit(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (error && name === 'name') setError('')
  }

  const addMacroFase = () => { if (!canEditCosts) return; setMacroFases([...macroFases, { fase: '', dataLimite: '', custo: '' }]) }
  const updateMacroFase = (index: number, field: keyof MacroFase, value: string) => {
    if (!canEditCosts) return
    const newFases = [...macroFases]
    newFases[index][field] = value
    setMacroFases(newFases)
  }
  const removeMacroFase = (index: number) => {
    if (!canEditCosts) return
    if (macroFases.length === 1) return
    setMacroFases(macroFases.filter((_, i) => i !== index))
  }

  const calculateTotal = () => {
    const total = macroFases.reduce((acc, curr) => {
      const val = parseFloat(curr.custo.replace(/\./g, '').replace(',', '.')) || 0
      return acc + val
    }, 0)
    return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) {
      setError('O Nome do Projeto é obrigatório.')
      setActiveTab('basico')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    startTransition(async () => {
      const update: Record<string, unknown> = { ...form }
      if (!canAssignRoles) delete update.initialMemberId
      if (!permissions.has('cadastros:gerenciar')) delete update.departamentos
      if (canEditCosts) update.macroFases = macroFases
      if (!canEditPublished) {
        for (const key of ['justificativa','objetivos','metodologia','descricaoProduto','premissas','restricoes','limitesAutoridade']) delete update[key]
      }
      const result = editId
        ? await updateProjetoAction(undefined, editId, update)
        : await createProjetoAction(undefined, { ...form, macroFases })

      if ('error' in result) {
        setError(result.error || 'Erro ao salvar projeto')
        if (editId) toast(result.error || 'Erro ao salvar projeto', 'error')
        return
      }
      setSyncProjectId(result.projeto.id as string)
      setSyncPending(result.macroFasesSync?.pending ?? false)
      if (result.macroFasesSync?.pending) return
      if (editId) {
        toast('Projeto atualizado com sucesso!', 'success')
      } else {
        router.push(`/projetos/${result.projeto.id}`)
      }
    })
  }

  const pageTitle = editId ? 'Editar Projeto' : 'Termo de Abertura'
  const pageSubtitle = editId ? 'Atualize as diretrizes do projeto' : 'Configure as diretrizes do novo projeto'
  const submitLabel = isPending
    ? (editId ? 'Salvando...' : 'Criando Projeto...')
    : (editId ? 'Salvar Alterações' : 'Salvar Projeto')

  const inputClass = "w-full px-4 py-3 bg-slate-50/50 border border-slate-200/60 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-200 text-slate-800 font-medium"
  const labelClass = "block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1"

  return (
    <div className="min-h-screen bg-[#F8FAFC] relative font-sans">

      {/* BACKGROUND DECORATIVO */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[300px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

      {/* HEADER FIXO TRANSLÚCIDO */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-slate-200/50 px-6 py-5 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={editId ? `/projetos/${editId}/dashboard` : "/projetos"} className="p-2.5 -ml-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{pageTitle}</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{pageSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={editId ? `/projetos/${editId}/dashboard` : "/projetos"} className="px-5 py-2.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200/80 rounded-xl hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm">
              Cancelar
            </Link>
            <button onClick={handleSubmit} disabled={isPending || isLoadingEdit} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-600/20 active:scale-95 disabled:opacity-50 disabled:hover:shadow-none transition-all shadow-sm">
              {(isPending || isLoadingEdit) && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 relative z-10">

        {/* NAVEGAÇÃO SEGMENTADA CENTRALIZADA */}
        <div className="flex justify-center mb-10 sticky top-[95px] z-30">
          <div className="flex p-1.5 bg-slate-200/50 backdrop-blur-md border border-slate-200/50 rounded-[16px] shadow-sm">
            {(['basico', 'estrategico', 'fases'] as const).map((tab) => {
              const labels = {
                basico: 'Informações Iniciais',
                estrategico: 'Dados Complementares',
                fases: 'Cronograma & Custos'
              }
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`
                    px-6 py-2 text-sm font-bold rounded-xl transition-all duration-300
                    ${activeTab === tab
                      ? 'bg-white text-slate-900 shadow-sm border border-slate-200/40 scale-100'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 border border-transparent scale-95'}
                  `}
                >
                  {labels[tab]}
                </button>
              )
            })}
          </div>
        </div>

        {syncPending && (
          <div role="status" className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-900">
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
          <div className="mb-8 p-4 bg-red-50/80 border border-red-200 rounded-2xl text-sm text-red-600 font-semibold flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="p-1.5 bg-red-100 rounded-lg text-red-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* ================= ABA 1: BÁSICO ================= */}
          <div className={`transition-all duration-500 ${activeTab === 'basico' ? 'block animate-in fade-in slide-in-from-bottom-4' : 'hidden'}`}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

              {/* Coluna da Logo (1/3) */}
              <div className="md:col-span-4 bg-white p-8 rounded-[24px] border border-slate-200/60 shadow-sm flex flex-col items-center justify-center text-center">
                <AvatarUpload name="Projeto" avatarUrl={form.logoUrl} onChange={(url) => setForm(f => ({ ...f, logoUrl: url }))} />
                <h3 className="mt-6 text-sm font-bold text-slate-800">Identidade Visual</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed px-2">Anexe a logo para facilitar a identificação visual na dashboard.</p>
              </div>

              {/* Formulário Principal (2/3) */}
              <div className="md:col-span-8 bg-white p-8 rounded-[24px] border border-slate-200/60 shadow-sm space-y-6">
                <div className="space-y-5">
                  <div>
                    <label className={labelClass}>Nome do Projeto <span className="text-red-500">*</span></label>
                    <input name="name" type="text" value={form.name} onChange={handleChange} placeholder="Ex: App de Logística v2" className={inputClass} />
                  </div>

                  <div>
                    <label className={labelClass}>Slogan / Visão</label>
                    <input name="slogan" type="text" value={form.slogan} onChange={handleChange} placeholder="A frase que define o propósito deste projeto..." className={inputClass} />
                  </div>

                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <label className={labelClass}>Data de Início</label>
                      <DateInputBR value={form.startDate} onChange={(iso) => setForm(prev => ({ ...prev, startDate: iso }))} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Data Prevista (Fim)</label>
                      <DateInputBR value={form.endDate} onChange={(iso) => setForm(prev => ({ ...prev, endDate: iso }))} className={inputClass} />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Localização</label>
                    <input name="location" type="text" value={form.location} onChange={handleChange} placeholder="Sede, Filial, Cliente X..." className={inputClass} />
                  </div>

                  <div>
                    <label className={labelClass}>Departamentos</label>
                    <fieldset disabled={!permissions.has('cadastros:gerenciar')} className="min-w-0">
                    <MultiCreatableSelect
                      values={form.departamentos}
                      onChange={(v) => setForm(f => ({ ...f, departamentos: v }))}
                      options={departamentosExistentes}
                      placeholder="Adicionar departamento..."
                      disabled={isPending}
                    />
                    </fieldset>
                  </div>

                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <label className={labelClass}>Período</label>
                      <div className="relative">
                        <select name="semestre" value={form.semestre} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer pr-10`}>
                          <option value="">Selecione</option>
                          <option value="1">1º Semestre</option>
                          <option value="2">2º Semestre</option>
                          <option value="ano">Ano</option>
                        </select>
                        <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Ano</label>
                      <input
                        name="ano"
                        type="number"
                        min={currentYear - 20}
                        max={currentYear + 5}
                        list="anos-sugeridos"
                        value={form.ano}
                        onChange={handleChange}
                        placeholder="Digite ou selecione o ano"
                        className={inputClass}
                      />
                      <datalist id="anos-sugeridos">
                        {[...new Set([...years, ...(form.ano ? [Number(form.ano)] : [])])].sort((a, b) => a - b).map(y => <option key={y} value={String(y)}>{y}</option>)}
                      </datalist>
                    </div>
                  </div>

                  <div className="pt-5 border-t border-slate-100">
                    <label className={labelClass}>Gerente do Projeto (Responsável)</label>
                    <div className="relative">
                      <select disabled={!canAssignRoles} name="initialMemberId" value={form.initialMemberId} onChange={handleChange} className={`${inputClass} appearance-none cursor-pointer pr-10`}>
                        <option value="">Ainda não definido (Designar depois)</option>
                        {usuarios.filter(u => u.isActive !== false).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ================= ABA 2: DADOS COMPLEMENTARES ================= */}
          <div className={`transition-all duration-500 ${activeTab === 'estrategico' ? 'block animate-in fade-in slide-in-from-bottom-4' : 'hidden'}`}>
            <div className="bg-white p-8 md:p-10 rounded-[24px] border border-slate-200/60 shadow-sm">
              <div className="mb-8">
                <h2 className="text-xl font-bold text-slate-900">Diretrizes e Escopo</h2>
                <p className="text-sm text-slate-500 mt-1.5 font-medium">{editId ? 'As alterações serão registradas em uma nova versão do Termo de Abertura.' : 'Detalhe as justificativas, metodologia e limites para aprovação deste projeto.'}</p>
              </div>

              <div className="space-y-6">
                {[
                  { name: 'justificativa', label: 'Justificativa do Projeto', placeholder: 'Qual problema este projeto resolve? Por que é necessário?' },
                  { name: 'objetivos', label: 'Objetivo(s) Principal(is)', placeholder: 'O que caracteriza o sucesso deste projeto?' },
                  { name: 'descricaoProduto', label: 'Descrição do Produto/Serviço', placeholder: 'Detalhe técnico ou funcional do que será entregue...' },
                  { name: 'metodologia', label: 'Metodologia / Abordagem', placeholder: 'Ex: Desenvolvimento Ágil usando Scrum quinzenal.' },
                  { name: 'premissas', label: 'Premissas', placeholder: 'Cenários assumidos como verdadeiros para o planejamento...' },
                  { name: 'restricoes', label: 'Restrições', placeholder: 'Limites de orçamento, tempo ou recursos obrigatórios...' },
                  { name: 'limitesAutoridade', label: 'Limites de Autoridade do Gerente', placeholder: 'Até que ponto o gerente pode tomar decisões financeiras e de escopo sem aprovação extra?' },
                ].map(field => (
                  <div key={field.name}>
                    <label className={labelClass}>{field.label}</label>

                    <ExpandableTextarea readOnly={!canEditPublished}
                      name={field.name}
                      value={(form[field.name as keyof typeof form] as string) || ''}
                      onChange={handleChange}
                      placeholder={field.placeholder}
                      className={`${inputClass} resize-none leading-relaxed rounded-xl pb-10`}
                    />

                  </div>
                ))}
              </div>
            </div>
          </div>

          <fieldset disabled={!canEditCosts} className="min-w-0">
          {/* ================= ABA 3: TABELA DE FASES ================= */}
          <div className={`transition-all duration-500 ${activeTab === 'fases' ? 'block animate-in fade-in slide-in-from-bottom-4' : 'hidden'}`}>
            <div className="bg-white p-8 md:p-10 rounded-[24px] border border-slate-200/60 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Cronograma Financeiro</h2>
                  <p className="text-sm text-slate-500 mt-1.5 font-medium">Estime as entregas macro e o orçamento dedicado a cada etapa.</p>
                </div>
                <button type="button" onClick={addMacroFase} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-900 text-white hover:bg-slate-800 font-bold text-sm rounded-xl transition-all shadow-sm active:scale-95">
                  <IconPlus /> Adicionar Fase
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200/80 overflow-hidden bg-white shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200/80">
                    <tr>
                      <th className="py-4 px-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest">Descrição da Fase</th>
                      <th className="py-4 px-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest w-40">Data Limite</th>
                      <th className="py-4 px-5 text-[11px] font-bold text-slate-500 uppercase tracking-widest w-48 text-right">Custo Previsto</th>
                      <th className="py-4 px-4 w-14"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {macroFases.map((fase, idx) => (
                      <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="p-3">
                          <span className="text-sm text-slate-500">1.{idx + 1}</span><input aria-label={`Fase 1.${idx + 1}`} type="text" value={fase.fase} onChange={e => updateMacroFase(idx, 'fase', e.target.value)} placeholder={`Ex: Fase ${idx + 1}...`} className="w-full px-3 py-2.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg text-sm font-semibold text-slate-800 transition-all outline-none" />
                        </td>
                        <td className="p-3">
                          <DateInputBR
                            value={fase.dataLimite}
                            onChange={(v) => updateMacroFase(idx, 'dataLimite', v)}
                            className="w-full px-3 py-2.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg text-sm text-slate-600 font-medium transition-all outline-none"
                          />
                        </td>
                        <td className="p-3">
                          <div className="relative flex items-center">
                            <span className="absolute left-3 text-slate-400 text-sm font-bold">R$</span>
                            <input
                              type="text"
                              value={fase.custo}
                              // 👇 A MÁGICA ACONTECE AQUI
                              onChange={e => updateMacroFase(idx, 'custo', formatCurrency(e.target.value))}
                              placeholder="0,00"
                              className="w-full pl-9 pr-3 py-2.5 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 rounded-lg text-sm text-right font-bold text-slate-800 transition-all outline-none"
                            />
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button type="button" onClick={() => removeMacroFase(idx)} disabled={macroFases.length === 1} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed">
                            <IconTrash />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200/80">
                    <tr>
                      <td colSpan={2} className="py-5 px-5 text-xs font-bold text-slate-500 text-right uppercase tracking-widest">Orçamento Total</td>
                      <td className="py-5 px-5 text-xl font-black text-slate-900 text-right tracking-tight">{calculateTotal()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          </fieldset>

        </form>
      </main>
    </div>
  )
}
