'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput, Textarea as OperumTextarea } from '@/components/ui/Field'
import Select from '@/components/ui/Select'
import MoedaInput from '@/components/ui/MoedaInput'
import { erroMoeda, parseMoeda } from '@/lib/dinheiro'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import PermissoesUsuario from '@/components/permissoes/PermissoesUsuario'

import { Fragment, useState, useTransition, useEffect, useRef } from 'react'
import {
  Plus,
  Pencil,
  UserMinus,
  UserPlus,
  X,
  Building2,
  Mail,
  Phone,
  BookUser,
  ChevronDown,
  Users,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Power,
} from 'lucide-react'
import AvatarUpload from '@/components/profile/AvatarUpload'
import AddressFields, { type AddressValues, emptyAddress } from '@/components/ui/AddressFields'
import { useToast } from '@/components/ui/Toast'
import {
  createStakeholderAction,
  updateStakeholderAction,
  bindStakeholderAction,
  unbindStakeholderAction,
  reorderStakeholdersAction,
  reorderMembersAction,
  uploadMemberSignatureAction,
  setStakeholderAtivoAction,
} from '@/app/actions/stakeholders'
import { addMemberAction, removeMemberAction } from '@/app/actions/projects'
import { EmailInput, TelefoneInput } from '@/components/ui/ContatoInputs'
import { erroEmail, erroTelefone } from '@/lib/contato'
import { updateProjetoMemberAction, setMembroAtivoAction } from '@/app/actions/projetos'
import { adminCreateUserAction } from '@/app/actions/admin'
import { parseHoras, formatHoras } from '@/lib/validation/horas'
import PasswordInput from '@/components/ui/PasswordInput'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import styles from './ProjetoStakeholdersClient.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StakeholderUnificado = {
  id: string
  tipo: 'interno' | 'externo'
  name: string
  email: string | null
  avatarUrl: string | null
  phone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  notes: string | null
  // Interno (UserProject + User)
  userId?: string
  cargos?: string[]
  departamento?: string[]
  isGerente?: boolean
  hourlyRate?: number | null
  remuneracao?: number | null
  horasDiarias?: number | null
  startDate?: string
  userRole?: string
  forcePasswordChange?: boolean
  signatureUrl?: string | null
  // Externo (Stakeholder)
  stakeholderId?: string
  tenantId?: string
  company?: string | null
  competence?: string | null
  /** Interno: inativo no projeto (sem acesso). Externo: inativo no cadastro global. */
  isActive?: boolean
  /** Motivo informado ao inativar; só existe com isActive === false. */
  inactiveReason?: string | null
  inactivatedAt?: string | null
}

export type UsuarioDisponivel = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
}

export type StakeholderExterno = {
  id: string
  tenantId: string
  name: string
  logoUrl: string | null
  company: string | null
  competence: string | null
  email: string | null
  phone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  notes: string | null
  isActive: boolean
}

interface Props {
  projetoId: string
  stakeholders: StakeholderUnificado[]
  stakeholdersDisponiveis: StakeholderExterno[]
  usuariosDisponiveis: UsuarioDisponivel[]
  funcoesExistentes?: string[]
  departamentosExistentes?: string[]
  userRole: 'admin' | 'gerente'
  /**
   * Modo painel: só o diretório e o formulário do cadastro, abertos à direita
   * (usado pelo "Adicionar parte interessada" do documento). `onAlterado` avisa
   * quando alguém foi vinculado/criado/salvo; `onFechar` fecha o painel.
   */
  painel?: { modo: 'interno' | 'externo'; onFechar: () => void; onAlterado: () => void; iniciarCriacao?: boolean; onSelecionado?: (pessoa: StakeholderUnificado) => void }
}

type FormState = {
  avatarUrl: string
  name: string
  company: string
  competence: string
  email: string
  phone: string
  address: AddressValues
  notes: string
  cargos: string[]
  departamento: string[]
  isGerente: boolean
  remuneracao: string
  horasDiarias: string
  password: string
  forcePasswordChange: boolean
}

/** Formato mínimo retornado pela criação de um stakeholder externo (POST /stakeholders) */
type StakeholderCriado = {
  id: string
  tenantId: string
  name: string
  logoUrl?: string | null
  company?: string | null
  competence?: string | null
  email?: string | null
  phone?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  notes?: string | null
  isActive?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const emptyForm: FormState = {
  avatarUrl: '',
  name: '',
  company: '',
  competence: '',
  email: '',
  phone: '',
  address: emptyAddress,
  notes: '',
  cargos: [],
  departamento: [],
  isGerente: false,
  remuneracao: '',
  horasDiarias: '',
  password: '',
  forcePasswordChange: true,
}

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow'
const disabledCls =
  'disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
}

const avatarColors = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
]

function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

/** Valor em reais do formulário ("1.234,56" ou o salvo "1234.56") → número; null se vazio/inválido. */
function parseBRLFloat(value: string): number | null {
  const n = parseMoeda(value)
  return n === null || Number.isNaN(n) ? null : n
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, url, size = 'md' }: { name: string; url: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-11 h-11 text-sm' : 'w-9 h-9 text-xs'
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className={`${dims} rounded-full object-cover shrink-0 border border-gray-100 shadow-sm`}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div className={`${dims} ${colorForName(name)} rounded-full shrink-0 flex items-center justify-center font-semibold text-white shadow-sm`}>
      {getInitials(name)}
    </div>
  )
}

function Spinner() {
  return <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
}

// ─── MultiCreatableSelect ─────────────────────────────────────────────────────

function MultiCreatableSelect({
  values = [],
  onChange,
  options,
  placeholder,
  disabled = false,
}: {
  values: string[]
  onChange: (v: string[]) => void
  options: string[]
  placeholder: string
  disabled?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(search.toLowerCase()) && !values.includes(opt)
  )
  const isExactMatch = options.some(opt => opt.toLowerCase() === search.toLowerCase().trim())
  const showCreateOption = search.trim().length > 0 && !isExactMatch && !values.includes(search.trim())

  function handleSelect(val: string) {
    if (disabled) return
    if (!values.includes(val)) onChange([...values, val])
    setSearch('')
    setIsOpen(false)
    inputRef.current?.focus()
  }

  function handleRemove(val: string) {
    if (!disabled) onChange(values.filter(v => v !== val))
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <div
        className={`min-h-[42px] w-full px-2 py-1.5 border border-gray-200 rounded-xl text-sm flex flex-wrap gap-1.5 items-center ${
          disabled ? 'bg-gray-50 cursor-not-allowed' : 'bg-white focus-within:ring-2 focus-within:ring-blue-500 cursor-text'
        }`}
        onClick={() => { if (!disabled) { setIsOpen(true); inputRef.current?.focus() } }}
      >
        {values.map(val => (
          <span key={val} className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200">
            {val}
            {!disabled && (
              <OperumButton variant="custom" type="button" onClick={e => { e.stopPropagation(); handleRemove(val) }} className="hover:text-red-600">
                <X className="w-3 h-3" />
              </OperumButton>
            )}
          </span>
        ))}
        <OperumInput
          ref={inputRef}
          type="text"
          value={search}
          disabled={disabled}
          onChange={e => { setSearch(e.target.value); setIsOpen(true) }}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm disabled:cursor-not-allowed"
        />
      </div>
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-48 overflow-y-auto py-1">
          {filteredOptions.map(opt => (
            <OperumButton variant="default" type="button" key={opt} onClick={() => handleSelect(opt)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-slate-50 transition-colors">
              {opt}
            </OperumButton>
          ))}
          {showCreateOption && (
            <OperumButton variant="default" type="button" onClick={() => handleSelect(search.trim())} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-blue-700 font-medium bg-blue-50/50 hover:bg-blue-50 transition-colors border-t border-gray-50">
              <Plus className="w-3.5 h-3.5" /> Criar &quot;{search.trim()}&quot;
            </OperumButton>
          )}
          {filteredOptions.length === 0 && !showCreateOption && (
            <div className="px-4 py-3 text-sm text-gray-400 italic text-center">Sem opções</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MemberSignatureUpload ────────────────────────────────────────────────────

function MemberSignatureUpload({
  userId,
  initialUrl,
  onUpdate,
}: {
  userId: string
  initialUrl: string | null
  onUpdate: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(initialUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ALLOWED = ['image/png', 'image/jpeg', 'image/jpg']
    if (!ALLOWED.includes(file.type)) {
      setError('Apenas PNG e JPEG são aceitos')
      e.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Arquivo excede 2 MB')
      e.target.value = ''
      return
    }

    setUploading(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    const result = await uploadMemberSignatureAction(fd, userId)
    if ('signatureUrl' in result && result.signatureUrl) {
      setUrl(result.signatureUrl)
      onUpdate(result.signatureUrl)
    } else if ('error' in result) {
      setError(result.error ?? 'Erro ao enviar')
    }
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div data-testid="member-signature-upload" className="flex flex-col gap-2">
      <label className="block text-xs font-medium text-gray-600">Assinatura Digital</label>
      <p className="text-[11px] text-gray-400">
        Aparecerá na documentação do projeto. PNG ou JPEG, máx. 2 MB.
      </p>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Assinatura atual"
          className="max-h-12 max-w-[180px] object-contain border border-gray-100 rounded p-1 bg-gray-50"
        />
      )}
      <OperumButton variant="primary"
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="px-3 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors self-start"
      >
        {uploading ? 'Enviando…' : url ? 'Alterar assinatura' : 'Enviar assinatura'}
      </OperumButton>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={handleChange}
      />
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjetoStakeholdersClient({
  projetoId,
  stakeholders: initialStakeholders,
  stakeholdersDisponiveis: initialDispExterno,
  usuariosDisponiveis: initialDispInterno,
  funcoesExistentes = [],
  departamentosExistentes = [],
  userRole,
  painel,
}: Props) {
  const permissions = useProjectPermissions()
  const isAdmin = userRole === 'admin'
  const canManage = permissions.has('projeto:equipe')
  const { toast } = useToast()

  // Data state
  const [projeto, setProjeto] = useState<StakeholderUnificado[]>(initialStakeholders)
  const [dispExterno, setDispExterno] = useState<StakeholderExterno[]>(initialDispExterno)
  const [dispInterno, setDispInterno] = useState<UsuarioDisponivel[]>(initialDispInterno)

  // UI state
  const [addMode, setAddMode] = useState<null | 'interno' | 'externo'>(painel?.modo ?? null)
  const avisarAlteracao = () => painel?.onAlterado()
  /**
   * Modo painel: depois de salvar, avisa o documento, mostra o sucesso e fecha
   * o painel. Fora dele não faz nada (a tela Stakeholders segue como antes).
   */
  function concluirNoPainel(mensagem?: string, pessoa?: StakeholderUnificado): boolean {
    if (!painel) return false
    if (mensagem) toast(mensagem, 'success')
    painel.onAlterado()
    const salva = pessoa ?? (selected ? { ...selected, name: formState.name.trim() || selected.name, cargos: formState.cargos, departamento: formState.departamento } : null)
    if (salva) painel.onSelecionado?.(salva)
    painel.onFechar()
    return true
  }
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [selected, setSelected] = useState<StakeholderUnificado | null>(null)
  const [isCreating, setIsCreating] = useState(!!painel?.iniciarCriacao)

  const [formState, setFormState] = useState<FormState>(painel?.iniciarCriacao ? { ...emptyForm, forcePasswordChange: true } : emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const [searchProjeto, setSearchProjeto] = useState('')
  const [vinculo, setVinculo] = useState('')
  const [area, setArea] = useState('')
  const [reorderMode, setReorderMode] = useState(false)
  const [searchDir, setSearchDir] = useState('')
  /** Criação/vínculo rápida a partir das buscas (Col 1 projeto / Col 2 diretório externo) */
  const [quickLoading, setQuickLoading] = useState<null | 'col1' | 'dir'>(null)

  const [, startTransition] = useTransition()
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  const [reorderError, setReorderError] = useState<string | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Layout
  const showCol3 = selected !== null || isCreating
  const col2Active = addMode !== null && canManage
  const col1Width = col2Active || showCol3 ? 'xl:w-1/3' : 'w-full'
  const col3Width = col2Active ? 'xl:w-1/3' : 'xl:flex-1'

  // ── Filtered lists
  const normalizarBusca = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const areas = [...new Set(projeto.flatMap(s => s.tipo === 'interno' ? s.departamento ?? [] : s.company ? [s.company] : []))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const hasFilters = Boolean(searchProjeto.trim() || vinculo || area)
  const canReorder = canManage && reorderMode && !hasFilters && !isReordering
  const filteredProjeto = projeto.filter(s => {
    const q = normalizarBusca(searchProjeto)
    return (!vinculo || s.tipo === vinculo)
      && (!area || (s.tipo === 'interno' ? s.departamento?.includes(area) : s.company === area))
      && [s.name, s.email ?? '', s.company ?? ''].some(value => normalizarBusca(value).includes(q))
  })

  function clearFilters() {
    setSearchProjeto('')
    setVinculo('')
    setArea('')
  }

  // Equipe primeiro, externos depois, cada grupo com o seu cabeçalho. A ordem de cada
  // grupo é salva separadamente (reorderMembers / reorderStakeholders), então misturar
  // os dois na lista não tinha significado.
  const exibidos = [...filteredProjeto].sort((a, b) => Number(a.tipo === 'externo') - Number(b.tipo === 'externo'))
  const totalEquipe = exibidos.filter(s => s.tipo === 'interno').length
  const totalExternos = exibidos.length - totalEquipe

  const filteredDispExterno = dispExterno.filter(s => {
    const q = searchDir.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.company ?? '').toLowerCase().includes(q)
  })

  const filteredDispInterno = dispInterno.filter(u => {
    const q = searchDir.toLowerCase()
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  // Stakeholder externo do diretório que casa exatamente com a busca do Col 1
  // (para vincular em vez de duplicar ao criar pela busca do projeto).
  const candidatoDiretorio =
    searchProjeto.trim().length > 0
      ? dispExterno.find(s => s.name.toLowerCase() === searchProjeto.trim().toLowerCase())
      : undefined

  // Ao digitar na busca do projeto, sugere também quem ainda NÃO está no
  // projeto: stakeholders do diretório global e usuários da instituição.
  const termoProjeto = searchProjeto.trim().toLowerCase()
  const MAX_SUGESTOES = 5
  const sugestoesExternos = termoProjeto
    ? dispExterno
        .filter(s =>
          s.name.toLowerCase().includes(termoProjeto) ||
          (s.company ?? '').toLowerCase().includes(termoProjeto) ||
          (s.email ?? '').toLowerCase().includes(termoProjeto),
        )
        .slice(0, MAX_SUGESTOES)
    : []
  const sugestoesInternos = termoProjeto
    ? dispInterno
        .filter(u => u.name.toLowerCase().includes(termoProjeto) || u.email.toLowerCase().includes(termoProjeto))
        .slice(0, MAX_SUGESTOES)
    : []

  // ── Form helpers
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState(f => ({ ...f, [key]: value }))
  }

  function populateFromExterno(s: StakeholderUnificado) {
    setFormState({
      avatarUrl: s.avatarUrl ?? '',
      name: s.name,
      company: s.company ?? '',
      competence: s.competence ?? '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      address: {
        cep: s.cep ?? '',
        logradouro: s.logradouro ?? '',
        numero: s.numero ?? '',
        complemento: s.complemento ?? '',
        bairro: s.bairro ?? '',
        cidade: s.cidade ?? '',
        estado: s.estado ?? '',
      },
      notes: s.notes ?? '',
      cargos: [],
      departamento: [],
      isGerente: false,
      remuneracao: '',
      horasDiarias: '',
      password: '',
      forcePasswordChange: false,
    })
  }

  function populateFromInterno(s: StakeholderUnificado) {
    setFormState({
      avatarUrl: s.avatarUrl ?? '',
      name: s.name,
      company: '',
      competence: '',
      email: s.email ?? '',
      phone: s.phone ?? '',
      address: {
        cep: s.cep ?? '',
        logradouro: s.logradouro ?? '',
        numero: s.numero ?? '',
        complemento: s.complemento ?? '',
        bairro: s.bairro ?? '',
        cidade: s.cidade ?? '',
        estado: s.estado ?? '',
      },
      notes: s.notes ?? '',
      cargos: s.cargos ?? [],
      departamento: s.departamento ?? [],
      isGerente: s.isGerente ?? false,
      remuneracao:
        s.remuneracao != null
          ? s.remuneracao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '',
      horasDiarias: s.horasDiarias != null ? formatHoras(s.horasDiarias) : '',
      password: '',
      forcePasswordChange: false,
    })
  }

  function handleClearSelection() {
    setSelected(null)
    setIsCreating(false)
    setFormError(null)
  }

  function handleOpenEdit(s: StakeholderUnificado) {
    setIsCreating(false)
    setFormError(null)
    if (s.tipo === 'interno') populateFromInterno(s)
    else populateFromExterno(s)
    setSelected(s)
  }

  function handleOpenCreateExterno() {
    if (!isAdmin) return
    setSelected(null)
    setIsCreating(true)
    setFormError(null)
    setFormState(emptyForm)
  }

  function handleOpenCreateInterno() {
    if (!isAdmin) return
    setSelected(null)
    setIsCreating(true)
    setFormError(null)
    setFormState({ ...emptyForm, forcePasswordChange: true })
  }

  function handleOpenAddMode(mode: 'interno' | 'externo') {
    if (!canManage) return
    setAddMode(mode)
    setShowAddMenu(false)
    setSearchDir('')
  }

  function handleCloseAddMode() {
    if (painel) { painel.onFechar(); return }
    setAddMode(null)
    setSearchDir('')
  }

  // ── Criação como MEMBRO DA EQUIPE a partir das buscas ──
  // Abre o fluxo de criação de usuário interno (Col 2 interno + Col 3) com o
  // nome preenchido — o usuário informa e-mail/senha e o membro fica PENDENTE
  // (troca de senha no 1º acesso), igual ao "Criar e adicionar" do modo interno.
  function handleCreateMembroDaBusca() {
    if (!isAdmin) return
    const name = searchProjeto.trim()
    if (!name) return
    handleOpenAddMode('interno')
    handleOpenCreateInterno()
    setFormState(f => ({ ...f, name }))
  }

  function handleCreateMembroDoDiretorio() {
    if (!isAdmin) return
    const name = searchDir.trim()
    if (!name) return
    handleOpenAddMode('interno')
    handleOpenCreateInterno()
    setFormState(f => ({ ...f, name }))
  }

  // ── Quick-create a partir das buscas (cria o stakeholder se não existir)
  // Col 1 — "Stakeholders do Projeto": cria externo + vincula ao projeto.
  function handleQuickCreateProjeto() {
    if (!canManage) return
    const name = searchProjeto.trim()
    if (!name) return
    // Se já existe no diretório disponível, apenas vincula (evita duplicata).
    if (candidatoDiretorio) {
      handleBindExterno(candidatoDiretorio)
      setSearchProjeto('')
      return
    }
    setQuickLoading('col1')
    startTransition(async () => {
      const result = await createStakeholderAction({ name }, projetoId)
      setQuickLoading(null)
      if ('error' in result) {
        toast(result.error ?? 'Erro ao criar stakeholder.', 'error')
        return
      }
      const raw = result.stakeholder as StakeholderCriado
      const unified: StakeholderUnificado = {
        id: raw.id,
        tipo: 'externo',
        stakeholderId: raw.id,
        tenantId: raw.tenantId,
        name: raw.name,
        email: raw.email ?? null,
        avatarUrl: raw.logoUrl ?? null,
        phone: raw.phone ?? null,
        cep: raw.cep ?? null,
        logradouro: raw.logradouro ?? null,
        numero: raw.numero ?? null,
        complemento: raw.complemento ?? null,
        bairro: raw.bairro ?? null,
        cidade: raw.cidade ?? null,
        estado: raw.estado ?? null,
        notes: raw.notes ?? null,
        company: raw.company ?? null,
        competence: raw.competence ?? null,
        isActive: raw.isActive ?? true,
      }
      setProjeto(prev => (prev.some(x => x.id === unified.id) ? prev : [...prev, unified]))
      setSearchProjeto('')
      toast(`Stakeholder "${raw.name}" criado e adicionado ao projeto!`, 'success')
      // Criado só com o nome: abre o cadastro para completar os dados (SDD 4.4).
      handleOpenEdit(unified)
    })
  }

  // Col 2 — Diretório externo: cria no diretório do tenant (sem auto-vínculo).
  function handleQuickCreateExterno() {
    if (!isAdmin) return
    const name = searchDir.trim()
    if (!name) return
    setQuickLoading('dir')
    startTransition(async () => {
      const result = await createStakeholderAction({ name })
      setQuickLoading(null)
      if ('error' in result) {
        toast(result.error ?? 'Erro ao criar stakeholder.', 'error')
        return
      }
      const raw = result.stakeholder as StakeholderCriado
      const novoExterno: StakeholderExterno = {
        id: raw.id,
        tenantId: raw.tenantId,
        name: raw.name,
        logoUrl: raw.logoUrl ?? null,
        company: raw.company ?? null,
        competence: raw.competence ?? null,
        email: raw.email ?? null,
        phone: raw.phone ?? null,
        cep: raw.cep ?? null,
        logradouro: raw.logradouro ?? null,
        numero: raw.numero ?? null,
        complemento: raw.complemento ?? null,
        bairro: raw.bairro ?? null,
        cidade: raw.cidade ?? null,
        estado: raw.estado ?? null,
        notes: raw.notes ?? null,
        isActive: raw.isActive ?? true,
      }
      setDispExterno(prev => (prev.some(x => x.id === novoExterno.id) ? prev : [novoExterno, ...prev]))
      setSearchDir('')
      toast(`Stakeholder "${raw.name}" criado no diretório!`, 'success')
    })
  }

  // ── Bind external stakeholder
  function handleBindExterno(s: StakeholderExterno) {
    if (!canManage) return
    const unified: StakeholderUnificado = {
      id: s.id,
      tipo: 'externo',
      stakeholderId: s.id,
      tenantId: s.tenantId,
      name: s.name,
      email: s.email,
      avatarUrl: s.logoUrl,
      phone: s.phone,
      cep: s.cep,
      logradouro: s.logradouro,
      numero: s.numero,
      complemento: s.complemento,
      bairro: s.bairro,
      cidade: s.cidade,
      estado: s.estado,
      notes: s.notes,
      company: s.company,
      competence: s.competence,
      isActive: s.isActive,
    }
    setDispExterno(prev => prev.filter(x => x.id !== s.id))
    setProjeto(prev => [...prev, unified])
    handleOpenEdit(unified)

    startTransition(async () => {
      setLoadingId(s.id)
      const result = await bindStakeholderAction(projetoId, s.id)
      setLoadingId(null)
      if ('error' in result) {
        setProjeto(prev => prev.filter(x => x.id !== s.id))
        setDispExterno(prev => [...prev, s])
        handleClearSelection()
        toast(result.error ?? 'Erro ao vincular stakeholder.', 'error')
      } else {
        toast(`Stakeholder "${s.name}" vinculado ao projeto!`, 'success')
        avisarAlteracao()
      }
    })
  }

  // ── Unbind external stakeholder
  function handleUnbindExterno(s: StakeholderUnificado) {
    if (!canManage || !s.stakeholderId) return
    const externo: StakeholderExterno = {
      id: s.stakeholderId,
      tenantId: s.tenantId!,
      name: s.name,
      logoUrl: s.avatarUrl,
      company: s.company ?? null,
      competence: s.competence ?? null,
      email: s.email,
      phone: s.phone,
      cep: s.cep,
      logradouro: s.logradouro,
      numero: s.numero,
      complemento: s.complemento,
      bairro: s.bairro,
      cidade: s.cidade,
      estado: s.estado,
      notes: s.notes,
      isActive: s.isActive ?? true,
    }
    setProjeto(prev => prev.filter(x => x.id !== s.id))
    setDispExterno(prev => [...prev, externo])
    if (selected?.id === s.id) handleClearSelection()

    startTransition(async () => {
      setLoadingId(s.id)
      const result = await unbindStakeholderAction(projetoId, s.stakeholderId!)
      setLoadingId(null)
      if ('error' in result) {
        setProjeto(prev => [...prev, s])
        setDispExterno(prev => prev.filter(x => x.id !== externo.id))
      }
    })
  }

  // ── Add internal member
  function handleAddInterno(u: UsuarioDisponivel) {
    if (!canManage) return
    const unified: StakeholderUnificado = {
      id: u.id,
      tipo: 'interno',
      userId: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      phone: null,
      cep: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: null,
      estado: null,
      notes: null,
      cargos: [],
      departamento: [],
      isGerente: false,
      hourlyRate: null,
      startDate: new Date().toISOString(),
      userRole: u.role,
    }
    setDispInterno(prev => prev.filter(x => x.id !== u.id))
    setProjeto(prev => [...prev, unified])
    handleOpenEdit(unified)

    startTransition(async () => {
      setLoadingId(u.id)
      const result = await addMemberAction(projetoId, u.id)
      setLoadingId(null)
      if ('error' in result) {
        setProjeto(prev => prev.filter(x => x.id !== u.id))
        setDispInterno(prev => [...prev, u])
        handleClearSelection()
      } else {
        avisarAlteracao()
      }
    })
  }

  // ── Remove internal member
  function handleRemoveInterno(s: StakeholderUnificado) {
    if (!canManage || !s.userId) return
    const usuario: UsuarioDisponivel = {
      id: s.userId,
      name: s.name,
      email: s.email ?? '',
      avatarUrl: s.avatarUrl,
      role: s.userRole ?? 'member',
    }
    setProjeto(prev => prev.filter(x => x.id !== s.id))
    setDispInterno(prev => [...prev, usuario])
    if (selected?.id === s.id) handleClearSelection()

    startTransition(async () => {
      setLoadingId(s.id)
      const result = await removeMemberAction(projetoId, s.userId!)
      setLoadingId(null)
      if ('error' in result) {
        setProjeto(prev => [...prev, s])
        setDispInterno(prev => prev.filter(x => x.id !== usuario.id))
      }
    })
  }

  // ── Inativar / reativar stakeholder (com motivo). Externo: cadastro global.
  // Membro da equipe: perde o acesso ao projeto, mas continua listado e nos cards.
  const [inativando, setInativando] = useState<StakeholderUnificado | null>(null)
  const [motivoInativo, setMotivoInativo] = useState('')
  const [erroInativo, setErroInativo] = useState<string | null>(null)

  function abrirInativacao(s: StakeholderUnificado) {
    setMotivoInativo('')
    setErroInativo(null)
    setInativando(s)
  }

  function aplicarSituacao(s: StakeholderUnificado, ativo: boolean, motivo: string | null) {
    const novo: StakeholderUnificado = {
      ...s,
      isActive: ativo,
      inactiveReason: ativo ? null : motivo,
      inactivatedAt: ativo ? null : new Date().toISOString(),
    }
    setProjeto(prev => prev.map(x => (x.id === s.id ? novo : x)))
    setSelected(prev => (prev && prev.id === s.id ? novo : prev))
  }

  function podeAlterarSituacao(s: StakeholderUnificado): boolean {
    return canManage && (s.tipo === 'externo' ? Boolean(s.stakeholderId) : Boolean(s.userId))
  }

  async function gravarSituacao(s: StakeholderUnificado, ativo: boolean, motivo?: string) {
    if (s.tipo === 'interno') {
      return ativo ? setMembroAtivoAction(projetoId, s.userId!, true) : setMembroAtivoAction(projetoId, s.userId!, false, motivo)
    }
    return ativo ? setStakeholderAtivoAction(projetoId, s.stakeholderId!, true) : setStakeholderAtivoAction(projetoId, s.stakeholderId!, false, motivo)
  }

  function confirmarInativacao() {
    const alvo = inativando
    if (!alvo || !podeAlterarSituacao(alvo)) return
    const motivo = motivoInativo.trim()
    if (motivo.length < 3) {
      setErroInativo('Informe o motivo da inativação.')
      return
    }
    startTransition(async () => {
      setLoadingId(alvo.id)
      const r = await gravarSituacao(alvo, false, motivo)
      setLoadingId(null)
      if ('error' in r) { setErroInativo(r.error ?? 'Erro ao inativar.'); return }
      aplicarSituacao(alvo, false, motivo)
      setInativando(null)
      const pendentes = 'pendentes' in r ? r.pendentes ?? 0 : 0
      toast(
        pendentes > 0
          ? `"${alvo.name}" foi inativado. ${pendentes} card(s) precisam de outro responsável; o gerente foi avisado.`
          : `"${alvo.name}" foi inativado.`,
        'success',
      )
    })
  }

  function reativar(s: StakeholderUnificado) {
    if (!podeAlterarSituacao(s)) return
    startTransition(async () => {
      setLoadingId(s.id)
      const r = await gravarSituacao(s, true)
      setLoadingId(null)
      if ('error' in r) { toast(r.error ?? 'Erro ao reativar.', 'error'); return }
      aplicarSituacao(s, true, null)
      toast(`"${s.name}" foi reativado.`, 'success')
    })
  }

  function handleUnlink(s: StakeholderUnificado) {
    if (s.tipo === 'interno') handleRemoveInterno(s)
    else handleUnbindExterno(s)
  }

  // A ordem é independente por vínculo. Filtros não podem salvar uma ordem parcial.
  function movePerson(from: number, to: number) {
    if (!canReorder || from === to || !projeto[from] || projeto[from].tipo !== projeto[to]?.tipo) return
    const previous = projeto
    const newOrder = [...projeto]
    const [moved] = newOrder.splice(from, 1)
    newOrder.splice(to, 0, moved)
    setProjeto(newOrder)
    setIsReordering(true)
    setReorderError(null)
    startTransition(async () => {
      try {
        const group = newOrder.filter(s => s.tipo === moved.tipo)
        const result = moved.tipo === 'interno'
          ? await reorderMembersAction(projetoId, group.map(s => s.userId!))
          : await reorderStakeholdersAction(projetoId, group.map(s => s.stakeholderId!))
        if ('error' in result) throw new Error('reorder failed')
      } catch {
        setProjeto(previous)
        setReorderError('Falha ao salvar a nova ordem. A ordenação foi revertida. Tente mover a pessoa novamente.')
      } finally {
        setIsReordering(false)
      }
    })
  }

  function handleDragStart(index: number) {
    if (canReorder) setDraggedIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (canReorder && draggedIndex !== null && projeto[draggedIndex]?.tipo === projeto[index]?.tipo) setDragOverIndex(index)
  }

  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault()
    if (draggedIndex !== null) movePerson(draggedIndex, dropIndex)
    handleDragEnd()
  }

  function handleDragEnd() {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  // ── Save
  async function handleSave() {
    setFormError(null)

    // Horas por dia inválidas nunca são descartadas em silêncio (SDD 4.5).
    const ehMembro = (isCreating && !selected && addMode === 'interno') || selected?.tipo === 'interno'
    if (ehMembro && horasCheck.erro) { setFormError(horasCheck.erro); return }

    // E-mail e telefone só são editáveis pelo admin; o servidor ignora o que não mudou.
    if (isAdmin) {
      const emailObrigatorio = isCreating && !selected && addMode === 'interno'
      const erroContato = erroEmail(formState.email, emailObrigatorio) ?? erroTelefone(formState.phone)
        ?? (ehMembro ? erroMoeda(formState.remuneracao, { rotulo: 'Remuneração mensal' }) : null)
      if (erroContato) { setFormError(erroContato); return }
    }

    // Create new internal user (tenant member)
    if (isCreating && !selected && addMode === 'interno') {
      if (!isAdmin) return
      if (!formState.name.trim() || !formState.email.trim() || !formState.password.trim()) {
        setFormError('Nome, e-mail e senha são obrigatórios.')
        return
      }
      setLoadingId('form')
      const result = await adminCreateUserAction({
        name: formState.name.trim(),
        email: formState.email.trim(),
        password: formState.password,
        avatarUrl: formState.avatarUrl || undefined,
        phone: formState.phone || undefined,
        cep: formState.address.cep || undefined,
        logradouro: formState.address.logradouro || undefined,
        numero: formState.address.numero || undefined,
        complemento: formState.address.complemento || undefined,
        bairro: formState.address.bairro || undefined,
        cidade: formState.address.cidade || undefined,
        estado: formState.address.estado || undefined,
        notes: formState.notes || undefined,
        forcePasswordChange: formState.forcePasswordChange,
      })
      setLoadingId(null)
      if ('error' in result) { setFormError(result.error ?? 'Erro ao criar usuário'); return }
      const novoUsuario: UsuarioDisponivel = {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        avatarUrl: result.user.avatarUrl ?? null,
        role: result.user.role,
      }
      setDispInterno(prev => [novoUsuario, ...prev])
      
      // Auto-vincular ao projeto
      setLoadingId('form')
      const addResult = await addMemberAction(projetoId, novoUsuario.id)
      setLoadingId(null)
      if ('error' in addResult) {
        toast(addResult.error ?? 'Erro ao vincular usuário ao projeto', 'error')
        handleClearSelection()
        return
      }

      // Dados do projeto preenchidos no formulário (cargos, departamento,
      // remuneração, horas/dia, gerente): antes eram descartados na criação e
      // era preciso editar de novo (SDD 4.4). Mesmo caminho da edição.
      const dadosProjeto = {
        remuneracao: parseBRLFloat(formState.remuneracao) ?? undefined,
        horasDiarias: parseHoras(formState.horasDiarias).valor ?? undefined,
        cargos: isAdmin ? formState.cargos : undefined,
        departamento: formState.departamento,
        isGerente: isAdmin ? formState.isGerente : undefined,
      }
      const temDadosProjeto =
        dadosProjeto.remuneracao !== undefined || dadosProjeto.horasDiarias !== undefined ||
        (dadosProjeto.cargos?.length ?? 0) > 0 || dadosProjeto.departamento.length > 0 || dadosProjeto.isGerente
      let dadosGravados = true
      if (temDadosProjeto) {
        setLoadingId('form')
        const upd = await updateProjetoMemberAction(novoUsuario.id, projetoId, dadosProjeto)
        setLoadingId(null)
        if ('error' in upd) {
          dadosGravados = false
          toast(`Membro criado, mas os dados do projeto não foram salvos: ${upd.error}`, 'error')
        }
      }

      const unified: StakeholderUnificado = {
        id: novoUsuario.id,
        tipo: 'interno',
        userId: novoUsuario.id,
        name: novoUsuario.name,
        email: novoUsuario.email,
        avatarUrl: novoUsuario.avatarUrl,
        phone: formState.phone || null,
        cep: formState.address.cep || null,
        logradouro: formState.address.logradouro || null,
        numero: formState.address.numero || null,
        complemento: formState.address.complemento || null,
        bairro: formState.address.bairro || null,
        cidade: formState.address.cidade || null,
        estado: formState.address.estado || null,
        notes: formState.notes || null,
        cargos: dadosGravados ? formState.cargos : [],
        departamento: dadosGravados ? formState.departamento : [],
        isGerente: dadosGravados ? formState.isGerente : false,
        remuneracao: dadosGravados ? (dadosProjeto.remuneracao ?? null) : null,
        horasDiarias: dadosGravados ? (dadosProjeto.horasDiarias ?? null) : null,
        hourlyRate: null,
        startDate: new Date().toISOString(),
        userRole: novoUsuario.role,
        forcePasswordChange: formState.forcePasswordChange,
      }
      setProjeto(prev => [...prev, unified])
      toast('Usuário criado e vinculado ao projeto!', 'success')
      if (concluirNoPainel(undefined, unified)) return
      // Já abre o cadastro do membro, com o que foi salvo, em vez de fechar o formulário.
      handleOpenEdit(unified)
      return
    }

    // Create new external stakeholder
    if (isCreating && !selected) {
      if (!isAdmin) return
      if (!formState.name.trim()) { setFormError('O nome é obrigatório.'); return }

      setLoadingId('form')
      // O formulário é aberto pelo "Adicionar ao projeto": cria já vinculado ao
      // projeto e abre o cadastro em edição (SDD 4.4). Antes criava só no
      // diretório e fechava, e era preciso achar, vincular e editar de novo.
      // Quem quiser só o diretório usa a criação rápida da busca do diretório.
      const result = await createStakeholderAction({
        name: formState.name.trim(),
        logoUrl: formState.avatarUrl || undefined,
        company: formState.company || undefined,
        competence: formState.competence || undefined,
        email: formState.email || undefined,
        phone: formState.phone || undefined,
        cep: formState.address.cep || undefined,
        logradouro: formState.address.logradouro || undefined,
        numero: formState.address.numero || undefined,
        complemento: formState.address.complemento || undefined,
        bairro: formState.address.bairro || undefined,
        cidade: formState.address.cidade || undefined,
        estado: formState.address.estado || undefined,
        notes: formState.notes || undefined,
      }, projetoId)
      setLoadingId(null)

      if ('error' in result) { setFormError(result.error ?? 'Erro ao criar stakeholder'); return }
      const raw = result.stakeholder as { id: string; tenantId: string }
      const unified: StakeholderUnificado = {
        id: raw.id,
        tipo: 'externo',
        stakeholderId: raw.id,
        tenantId: raw.tenantId,
        name: formState.name.trim(),
        avatarUrl: formState.avatarUrl || null,
        company: formState.company || null,
        competence: formState.competence || null,
        email: formState.email || null,
        phone: formState.phone || null,
        cep: formState.address.cep || null,
        logradouro: formState.address.logradouro || null,
        numero: formState.address.numero || null,
        complemento: formState.address.complemento || null,
        bairro: formState.address.bairro || null,
        cidade: formState.address.cidade || null,
        estado: formState.address.estado || null,
        notes: formState.notes || null,
        isActive: true,
      }
      setProjeto(prev => (prev.some(x => x.id === unified.id) ? prev : [...prev, unified]))
      toast(`Stakeholder "${unified.name}" criado e adicionado ao projeto!`, 'success')
      if (concluirNoPainel(undefined, unified)) return
      handleOpenEdit(unified)
      return
    }

    if (!selected) return

    // Update external stakeholder
    if (selected.tipo === 'externo') {
      if (!canManage) return
      if (!formState.name.trim()) { setFormError('O nome é obrigatório.'); return }

      const updated: StakeholderUnificado = {
        ...selected,
        avatarUrl: formState.avatarUrl || null,
        name: formState.name.trim(),
        company: formState.company || null,
        competence: formState.competence || null,
        email: formState.email || null,
        phone: formState.phone || null,
        cep: formState.address.cep || null,
        logradouro: formState.address.logradouro || null,
        numero: formState.address.numero || null,
        complemento: formState.address.complemento || null,
        bairro: formState.address.bairro || null,
        cidade: formState.address.cidade || null,
        estado: formState.address.estado || null,
        notes: formState.notes || null,
      }

      setLoadingId('form')
      const result = await updateStakeholderAction(selected.stakeholderId!, {
        name: formState.name.trim(),
        logoUrl: formState.avatarUrl || undefined,
        company: formState.company || undefined,
        competence: formState.competence || undefined,
        email: formState.email || undefined,
        phone: formState.phone || undefined,
        cep: formState.address.cep || undefined,
        logradouro: formState.address.logradouro || undefined,
        numero: formState.address.numero || undefined,
        complemento: formState.address.complemento || undefined,
        bairro: formState.address.bairro || undefined,
        cidade: formState.address.cidade || undefined,
        estado: formState.address.estado || undefined,
        notes: formState.notes || undefined,
      }, projetoId)
      setLoadingId(null)

      if ('error' in result) { setFormError(result.error ?? 'Erro ao atualizar stakeholder'); return }
      setProjeto(prev => prev.map(x => x.id === updated.id ? updated : x))
      if (concluirNoPainel(`Dados de "${updated.name}" salvos!`)) return
      handleClearSelection()
      return
    }

    // Update internal member
    if (selected.tipo === 'interno' && selected.userId) {
      setLoadingId('form')
      const result = await updateProjetoMemberAction(selected.userId, projetoId, {
        ...(isAdmin && formState.name.trim() && { name: formState.name.trim() }),
        ...(isAdmin && formState.email.trim() && { email: formState.email.trim() }),
        avatarUrl: formState.avatarUrl || undefined,
        phone: formState.phone || undefined,
        cep: formState.address.cep || undefined,
        logradouro: formState.address.logradouro || undefined,
        numero: formState.address.numero || undefined,
        complemento: formState.address.complemento || undefined,
        bairro: formState.address.bairro || undefined,
        cidade: formState.address.cidade || undefined,
        estado: formState.address.estado || undefined,
        notes: formState.notes || undefined,
        remuneracao: isAdmin ? (parseBRLFloat(formState.remuneracao) ?? undefined) : undefined,
        horasDiarias: isAdmin ? (parseHoras(formState.horasDiarias).valor ?? undefined) : undefined,
        cargos: isAdmin ? formState.cargos : undefined,
        departamento: formState.departamento,
        isGerente: isAdmin ? formState.isGerente : undefined,
      })
      setLoadingId(null)

      if ('error' in result) { setFormError(result.error ?? 'Erro ao salvar'); return }
      setProjeto(prev =>
        prev.map(x =>
          x.id === selected.id
            ? {
                ...x,
                ...(isAdmin && formState.name.trim() && { name: formState.name.trim() }),
                ...(isAdmin && formState.email.trim() && { email: formState.email.trim() }),
                avatarUrl: formState.avatarUrl || x.avatarUrl,
                phone: formState.phone || null,
                cep: formState.address.cep || null,
                logradouro: formState.address.logradouro || null,
                numero: formState.address.numero || null,
                complemento: formState.address.complemento || null,
                bairro: formState.address.bairro || null,
                cidade: formState.address.cidade || null,
                estado: formState.address.estado || null,
                notes: formState.notes || null,
                cargos: isAdmin ? formState.cargos : undefined,
                departamento: formState.departamento,
                isGerente: isAdmin ? formState.isGerente : undefined,
                remuneracao: isAdmin ? (parseBRLFloat(formState.remuneracao) ?? x.remuneracao) : x.remuneracao,
                horasDiarias: isAdmin ? (parseHoras(formState.horasDiarias).valor ?? x.horasDiarias) : x.horasDiarias,
              }
            : x,
        ),
      )
      if (concluirNoPainel(`Dados de "${selected.name}" salvos!`)) return
      handleClearSelection()
    }
  }

  const horasCheck = parseHoras(formState.horasDiarias)

  const col3Title = isCreating && addMode === 'interno'
    ? 'Novo Membro da Equipe'
    : isCreating
    ? 'Novo Stakeholder Externo'
    : selected?.tipo === 'interno'
    ? 'Editar Membro'
    : 'Editar Stakeholder'

  // Colunas 2 (diretório) e 3 (formulário): na tela de Stakeholders ficam ao lado
  // da lista; no modo painel (documento Partes Interessadas) abrem à direita.
  const coluna2 = (
    <>
      {/* ── COLUMN 2 — Diretório (addMode) ── */}
      {col2Active && (
        <div className="xl:w-1/3 w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in slide-in-from-left-4 duration-300">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {addMode === 'interno' ? 'Usuários do Sistema' : 'Diretório de Stakeholders'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {addMode === 'interno' ? `${dispInterno.length} disponíveis` : `${dispExterno.length} disponíveis`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {addMode === 'interno' && (
                <OperumButton variant="custom" type="button"
                  onClick={handleOpenCreateInterno}
                  title="Novo usuário"
                  className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </OperumButton>
              )}
              {addMode === 'externo' && (
                <OperumButton variant="custom" type="button"
                  onClick={handleOpenCreateExterno}
                  title="Novo stakeholder"
                  className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </OperumButton>
              )}
              <OperumButton variant="custom" type="button"
                onClick={handleCloseAddMode}
                className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </OperumButton>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
  <OperumInput
    type="search"
    placeholder={addMode === 'interno' ? 'Buscar usuário…' : 'Buscar no diretório…'}
    value={searchDir}
    autoFocus
    onChange={e => setSearchDir(e.target.value)}
    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
  />
</div>


          {/* Externo directory */}
          {addMode === 'externo' && (
            filteredDispExterno.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-gray-400">
                  {searchDir.trim().length > 0
                    ? 'Nenhum resultado no diretório.'
                    : dispExterno.length === 0
                    ? 'Todos os stakeholders já estão vinculados.'
                    : 'Nenhum resultado.'}
                </p>
                {searchDir.trim().length > 0 && (
                  <div className="mt-4 flex flex-col gap-2 items-stretch">
                    <OperumButton variant="default" type="button"
                      onClick={handleQuickCreateExterno}
                      disabled={quickLoading === 'dir'}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      {quickLoading === 'dir' ? <Spinner /> : <Building2 className="w-4 h-4" />}
                      Criar &quot;{searchDir.trim()}&quot; no diretório
                    </OperumButton>
                    <OperumButton variant="default" type="button"
                      onClick={handleCreateMembroDoDiretorio}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors"
                    >
                      <Users className="w-4 h-4" />
                      Criar &quot;{searchDir.trim()}&quot; como membro da equipe
                    </OperumButton>
                  </div>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-gray-50/80 p-2 space-y-1">
                {filteredDispExterno.map(s => (
                  <li key={s.id} className="group flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 hover:shadow-sm transition-all">
                    <Avatar name={s.name} url={s.logoUrl} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
                      {s.company && (
                        <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 shrink-0" />{s.company}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                      <OperumButton variant="default" type="button"
                        onClick={() => handleBindExterno(s)}
                        disabled={loadingId === s.id}
                        title="Vincular ao projeto"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-40 transition-colors"
                      >
                        {loadingId === s.id ? <Spinner /> : <UserPlus className="w-4 h-4" />}
                      </OperumButton>
                      <OperumButton variant="custom" type="button"
                        onClick={() => handleOpenEdit({
                          id: s.id, tipo: 'externo', stakeholderId: s.id, tenantId: s.tenantId,
                          name: s.name, email: s.email, avatarUrl: s.logoUrl, phone: s.phone,
                          cep: s.cep, logradouro: s.logradouro, numero: s.numero,
                          complemento: s.complemento, bairro: s.bairro, cidade: s.cidade,
                          estado: s.estado, notes: s.notes, company: s.company,
                          competence: s.competence, isActive: s.isActive,
                        })}
                        title="Editar dados"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </OperumButton>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}

          {/* Internal users list */}
          {addMode === 'interno' && (
            <>
              {filteredDispInterno.length > 0 && (
                <ul className="divide-y divide-gray-50/80 p-2 space-y-1">
                  {filteredDispInterno.map(u => (
                    <li key={u.id} className="group flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 hover:shadow-sm transition-all">
                      <Avatar name={u.name} url={u.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 shrink-0" />{u.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                        <OperumButton variant="default" type="button"
                          onClick={() => handleAddInterno(u)}
                          disabled={loadingId === u.id}
                          title="Adicionar ao projeto"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-40 transition-colors"
                        >
                          {loadingId === u.id ? <Spinner /> : <UserPlus className="w-4 h-4" />}
                        </OperumButton>
                    </div>
                  </li>
                ))}
              </ul>
              )}
              
              {/* Create & Add option when search has no results */}
              {searchDir.trim().length > 0 && filteredDispInterno.length === 0 && (
                <OperumButton variant="default" type="button"
                  onClick={() => {
                    setFormState(f => ({ ...f, name: searchDir.trim() }))
                    handleOpenCreateInterno()
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-sm text-blue-700 font-medium bg-blue-50/50 hover:bg-blue-50 transition-colors border-t border-gray-50 mx-2 rounded-xl"
                >
                  <UserPlus className="w-4 h-4" /> Criar e adicionar &quot;{searchDir.trim()}&quot;
                </OperumButton>
              )}
              
              {/* Empty state when no search term */}
              {searchDir.trim().length === 0 && filteredDispInterno.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-gray-400">
                    {dispInterno.length === 0 ? 'Todos os usuários já estão no projeto.' : 'Digite um nome para buscar ou criar.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </>
  )
  const coluna3 = (
    <>
      {/* ── COLUMN 3 — Formulário de Edição ── */}
      {showCol3 && (
        <div className={`${col3Width} w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in slide-in-from-right-4 duration-300 flex flex-col max-h-[calc(100vh-6rem)]`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
            <h2 className="text-sm font-semibold text-gray-900">{col3Title}</h2>
            <OperumButton variant="custom" type="button" onClick={handleClearSelection} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X className="w-4 h-4" />
            </OperumButton>
          </div>

          <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">

            {isAdmin && selected?.tipo === 'interno' && selected.userId && !isCreating && (
              <details className="rounded-xl border border-gray-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-blue-700">Permissões neste projeto</summary>
                <div className="pt-3"><PermissoesUsuario key={`${selected.userId}:${projetoId}`} userId={selected.userId} projectId={projetoId} /></div>
              </details>
            )}
            {/* Avatar */}
            <div className="flex justify-center pb-2">
              <AvatarUpload
                name={formState.name || 'S'}
                avatarUrl={formState.avatarUrl || null}
                onChange={url => setField('avatarUrl', url)}
                disabled={!isAdmin}
              />
            </div>

            {/* Nome */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Nome <span className="text-red-400">*</span>
              </label>
              <OperumInput
                type="text"
                autoFocus
                value={formState.name}
                onChange={e => setField('name', e.target.value)}
                disabled={!isAdmin}
                placeholder="Nome completo ou razão social"
                className={`${inputCls} ${disabledCls}`}
              />
            </div>

            {/* Campos específicos de criação de usuário interno */}
            {isCreating && addMode === 'interno' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    E-mail <span className="text-red-400">*</span>
                  </label>
                  <EmailInput
                    value={formState.email}
                    onValueChange={v => setField('email', v)}
                    required
                    placeholder="usuario@empresa.com.br"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Senha <span className="text-red-400">*</span>
                  </label>
                  <PasswordInput
                    value={formState.password}
                    onChange={e => setField('password', e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className={inputCls}
                  />
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.forcePasswordChange}
                    onChange={e => setField('forcePasswordChange', e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="text-sm text-gray-700">Obrigar atualizar a senha no 1º acesso</span>
                </label>
              </>
            )}

            {/* Campos específicos de Externo */}
            {((isCreating && addMode === 'externo') || selected?.tipo === 'externo') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Empresa / Instituição</label>
                  <OperumInput
                    type="text"
                    value={formState.company}
                    onChange={e => setField('company', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Ex: Universidade Federal"
                    className={`${inputCls} ${disabledCls}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Competência</label>
                  <OperumInput
                    type="text"
                    value={formState.competence}
                    onChange={e => setField('competence', e.target.value)}
                    disabled={!isAdmin}
                    placeholder="Ex: Educação, TI"
                    className={`${inputCls} ${disabledCls}`}
                  />
                </div>
              </div>
            )}

            {/* Campos específicos de Interno */}
            {/* Dados do projeto também na criação de membro (SDD 4.4): antes só apareciam
                em "Editar", e era preciso abrir o cadastro de novo para preencher. */}
            {(selected?.tipo === 'interno' || (isCreating && !selected && addMode === 'interno')) && (
              <>
                {/* Remuneração + Horas por dia */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="field-remuneracao" className="block text-xs font-medium text-gray-600 mb-1">Remuneração mensal</label>
                    <MoedaInput
                      id="field-remuneracao"
                      value={formState.remuneracao}
                      onValueChange={texto => setField('remuneracao', texto)}
                      disabled={!isAdmin}
                      rotulo="Remuneração mensal"
                      adorno={<span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm font-medium text-gray-500 pointer-events-none">R$</span>}
                      className={`${inputCls} pl-10 ${disabledCls}`}
                    />
                  </div>
                  <div>
                    <label htmlFor="field-horas-diarias" className="block text-xs font-medium text-gray-600 mb-1">Horas por dia</label>
                    {/* Texto, não type="number": no Firefox o number com vírgula ("8,5") chegava vazio. */}
                    <OperumInput
                      id="field-horas-diarias"
                      type="text"
                      inputMode="decimal"
                      value={formState.horasDiarias}
                      onChange={e => setField('horasDiarias', e.target.value)}
                      disabled={!isAdmin}
                      placeholder="ex.: 8, 8,5 ou 8:30"
                      aria-invalid={horasCheck.erro ? true : undefined}
                      aria-describedby="field-horas-diarias-ajuda"
                      className={`${inputCls} ${disabledCls} ${horasCheck.erro ? 'border-red-400 focus:ring-red-300' : ''}`}
                    />
                    <p id="field-horas-diarias-ajuda" className={`mt-1 text-[11px] ${horasCheck.erro ? 'text-red-600' : 'text-gray-400'}`}>
                      {horasCheck.erro
                        ?? (horasCheck.valor !== null && formState.horasDiarias.includes(':')
                          ? `= ${formatHoras(horasCheck.valor)} h`
                          : null)}
                    </p>
                  </div>
                </div>

                {/* Valores calculados */}
                {(() => {
                  const remNum = parseBRLFloat(formState.remuneracao) ?? 0
                  const horasNum = parseHoras(formState.horasDiarias).valor ?? 0
                  const valid = horasNum > 0
                  const fmtBRL = (v: number) =>
                    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  const valorDia = valid ? remNum / 30 : null
                  const valorHora = valid ? (remNum / 30) / horasNum : null
                  const valorMinuto = valid ? (remNum / 30) / horasNum / 60 : null
                  return (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Valor/dia</p>
                        <p data-testid="valor-dia" className="text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                          {valorDia !== null ? fmtBRL(valorDia) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Valor/hora</p>
                        <p data-testid="valor-hora" className="text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                          {valorHora !== null ? fmtBRL(valorHora) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Valor/minuto</p>
                        <p data-testid="valor-minuto" className="text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                          {valorMinuto !== null ? fmtBRL(valorMinuto) : '—'}
                        </p>
                      </div>
                    </div>
                  )
                })()}

                <div className="flex items-center justify-between py-1">
                    <div>
                      <span className="text-xs font-medium text-gray-600">Gerente do Projeto</span>
                      <p className="text-[10px] text-gray-400">Concede acesso de gerência</p>
                    </div>
                    <OperumButton variant="custom"
                      type="button"
                      onClick={() => {
                        if (!isAdmin) return
                        const GERENTE_LABEL = 'Gerente de Projeto'
                        setFormState(f => {
                          const next = !f.isGerente
                          const cargos = next
                            ? f.cargos.includes(GERENTE_LABEL) ? f.cargos : [...f.cargos, GERENTE_LABEL]
                            : f.cargos.filter(c => c !== GERENTE_LABEL)
                          return { ...f, isGerente: next, cargos }
                        })
                      }}
                      disabled={!isAdmin}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 shrink-0 ${formState.isGerente ? 'bg-blue-600' : 'bg-gray-200'} ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${formState.isGerente ? 'translate-x-6' : 'translate-x-1'}`} />
                    </OperumButton>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cargos / Funções</label>
                  <MultiCreatableSelect
                    values={formState.cargos}
                    onChange={v => setField('cargos', v)}
                    options={funcoesExistentes}
                    placeholder="Adicionar cargo..."
                    disabled={!isAdmin}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Departamentos</label>
                  <MultiCreatableSelect
                    values={formState.departamento}
                    onChange={v => setField('departamento', v)}
                    options={departamentosExistentes}
                    placeholder="Adicionar departamento..."
                    disabled={!isAdmin}
                  />
                </div>

                {selected?.isGerente && selected.userId && (
                  <MemberSignatureUpload
                    userId={selected.userId}
                    initialUrl={selected.signatureUrl ?? null}
                    onUpdate={url => {
                      setSelected(prev => prev ? { ...prev, signatureUrl: url } : prev)
                      setProjeto(prev =>
                        prev.map(x => x.id === selected.id ? { ...x, signatureUrl: url } : x),
                      )
                    }}
                  />
                )}
              </>
            )}

            <hr className="border-gray-100" />

            {/* E-mail — oculto ao criar usuário (já aparece no bloco de criação acima) */}
            {!(isCreating && addMode === 'interno') && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> E-mail
                </label>
                <EmailInput
                  value={formState.email}
                  onValueChange={v => setField('email', v)}
                  disabled={!isAdmin}
                  placeholder="contato@empresa.com.br"
                  className={`${inputCls} ${disabledCls}`}
                />
              </div>
            )}

            {/* Telefone */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> Telefone
              </label>
              <TelefoneInput
                value={formState.phone}
                onValueChange={v => setField('phone', v)}
                disabled={!isAdmin}
                className={`${inputCls} ${disabledCls}`}
              />
            </div>

            {/* Endereço */}
            <AddressFields
              values={formState.address}
              onChange={(field, value) => setFormState(f => ({ ...f, address: { ...f.address, [field]: value } }))}
              disabled={!isAdmin}
            />

            {/* Observações */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
              <OperumTextarea
                value={formState.notes}
                onChange={e => setField('notes', e.target.value)}
                disabled={!isAdmin}
                rows={3}
                placeholder="Anotações internas…"
                className={`${inputCls} ${disabledCls} resize-none`}
              />
            </div>

          </div>

          {/* Rodapé fixo — sempre visível, mesmo com o formulário rolando por dentro */}
          <div className="px-5 py-4 border-t border-gray-100 bg-white shrink-0 space-y-3">
            {!isAdmin && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                Você está em modo somente leitura. Apenas administradores podem editar.
              </p>
            )}

            {formError && (
              <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
            )}

            {selected && !isCreating && podeAlterarSituacao(selected) && (
              <div className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${selected.isActive === false ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
                <p className="text-xs text-gray-600 min-w-0">
                  {selected.isActive === false
                    ? <>Inativo{selected.inactiveReason ? <>: <span className="text-red-700">{selected.inactiveReason}</span></> : null}</>
                    : selected.tipo === 'interno' ? 'Ativo no projeto' : 'Stakeholder ativo'}
                </p>
                <SituacaoButton
                  ativo={selected.isActive !== false}
                  nome={selected.name}
                  disabled={loadingId === selected.id}
                  onClick={() => (selected.isActive === false ? reativar(selected) : abrirInativacao(selected))}
                />
              </div>
            )}

            <FormActions className="flex gap-2">
              <OperumButton variant="default"
                type="button"
                onClick={handleClearSelection}
                className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </OperumButton>
              {canManage && (
                <OperumButton variant="primary"
                  type="button"
                  onClick={handleSave}
                  disabled={loadingId === 'form' || Boolean(horasCheck.erro)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {loadingId === 'form' && <Spinner />}
                  {isCreating ? 'Criar Stakeholder' : 'Salvar Dados'}
                </OperumButton>
              )}
            </FormActions>
          </div>
        </div>
      )}
    </>
  )

  if (painel) {
    return (
      <aside
        role="dialog"
        aria-label={addMode === 'interno' ? 'Adicionar membro da equipe' : 'Adicionar stakeholder externo'}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-3 overflow-y-auto border-l border-gray-200 bg-gray-50 p-3 shadow-2xl animate-in slide-in-from-right duration-200 [&>*]:!w-full"
      >
        {inativando === null && (showCol3 ? coluna3 : coluna2)}
      </aside>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <Modal isOpen={inativando !== null} onClose={() => setInativando(null)} title="Inativar stakeholder">
        <p className="text-sm text-gray-600 mb-3">
          {inativando ? <>Informe por que <strong>{inativando.name}</strong> foi inativado. O motivo fica registrado e aparece no cadastro.</> : null}
        </p>
        {inativando?.tipo === 'interno' && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
            O membro perde o acesso ao projeto. Os cards em que ele é responsável continuam com ele, mas precisam de outro responsável para serem concluídos, e o gerente do projeto recebe essa pendência.
          </p>
        )}
        <label htmlFor="motivo-inativo" className="block text-xs font-medium text-gray-600 mb-1">Motivo da inativação</label>
        <OperumTextarea
          id="motivo-inativo"
          value={motivoInativo}
          onChange={e => { setMotivoInativo(e.target.value); setErroInativo(null) }}
          rows={3}
          maxLength={500}
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex.: saiu do projeto, empresa encerrou o contrato…"
        />
        {erroInativo && <p role="alert" className="mt-1 text-xs text-red-600">{erroInativo}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setInativando(null)}>Cancelar</Button>
          <Button variant="danger" onClick={confirmarInativacao}>Inativar</Button>
        </div>
      </Modal>

      {/* ── COLUMN 1 — Lista Unificada ── */}
      <div className={`${col1Width} w-full min-w-0 bg-white rounded-2xl border border-gray-200 ${styles.listPanel}`}>
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 border-b border-gray-100">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Stakeholders do Projeto</h1>
            <p className="text-sm text-gray-600 mt-1">
              {projeto.length} pessoa{projeto.length !== 1 ? 's' : ''}
            </p>
          </div>
          {canManage && (
            <div className="relative" ref={addMenuRef}>
              <OperumButton variant="custom" type="button"
                onClick={() => setShowAddMenu(v => !v)}
                title="Adicionar"
                aria-expanded={showAddMenu}
                aria-controls="stakeholder-add-menu"
                onKeyDown={e => { if (e.key === 'Escape') setShowAddMenu(false) }}
                className="inline-flex min-h-11 items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Adicionar pessoa
                <ChevronDown className="w-3 h-3" />
              </OperumButton>
              {showAddMenu && (
                <div id="stakeholder-add-menu" onKeyDown={e => { if (e.key === 'Escape') { setShowAddMenu(false); (addMenuRef.current?.querySelector('button') as HTMLButtonElement | null)?.focus() } }} className="absolute right-0 top-full mt-1 w-60 bg-white rounded-xl border border-gray-100 shadow-xl z-50 py-1 animate-in fade-in duration-150">
                  <OperumButton variant="default" type="button"
                    onClick={() => handleOpenAddMode('interno')}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    <Users className="w-4 h-4 text-blue-500" />
                    Vincular Membro da Equipe
                  </OperumButton>
                  <OperumButton variant="default" type="button"
                    onClick={() => handleOpenAddMode('externo')}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-slate-500" />
                    Stakeholder Externo
                  </OperumButton>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4 px-5 py-4 border-b border-gray-100">
          <label className="flex-1 min-w-0 basis-56 text-sm font-medium text-gray-700">
            Buscar pessoa
            <OperumInput
              type="search"
              placeholder="Buscar por nome, e-mail ou empresa…"
              value={searchProjeto}
              onChange={e => { setSearchProjeto(e.target.value); setReorderMode(false) }}
              className={`${inputCls} mt-2 text-base sm:text-sm`}
            />
          </label>
          <div className="flex-1 basis-28 min-w-0 text-sm font-medium text-gray-700">
            <span className="mb-2 block">Vínculo</span>
            <Select ariaLabel="Vínculo" searchable={false} placeholder="Todos os vínculos" value={vinculo} onChange={v => { setVinculo(v); setReorderMode(false) }}
              options={[{ value: '', label: 'Todos os vínculos' }, { value: 'interno', label: 'Equipe' }, { value: 'externo', label: 'Externos' }]} />
          </div>
          <div className="flex-1 basis-28 min-w-0 text-sm font-medium text-gray-700">
            <span className="mb-2 block">Área ou empresa</span>
            <Select ariaLabel="Área ou empresa" placeholder="Todas as áreas e empresas" value={area} onChange={v => { setArea(v); setReorderMode(false) }}
              options={[{ value: '', label: 'Todas as áreas e empresas' }, ...areas.map(value => ({ value, label: value }))]} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <p role="status" className="text-sm text-gray-600">{isReordering ? 'Salvando ordem…' : `${filteredProjeto.length} de ${projeto.length} pessoas`}</p>
          <div className="flex flex-wrap gap-2">
            {hasFilters && <Button variant="secondary" onClick={clearFilters}>Limpar filtros</Button>}
            {canManage && projeto.length > 1 && <Button variant="secondary" disabled={hasFilters || isReordering} aria-pressed={reorderMode} onClick={() => setReorderMode(v => !v)}>{reorderMode ? 'Finalizar ordenação' : 'Reordenar'}</Button>}
          </div>
        </div>
        {reorderMode && <p className="px-5 pb-3 text-sm text-gray-600">Arraste ou use as setas para mover pessoas dentro do mesmo grupo. Cada movimento é salvo automaticamente.</p>}

        {/* Reorder error feedback */}
        {reorderError && (
          <p role="alert" className="mx-4 mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{reorderError}</p>
        )}

        {/* List */}
        {filteredProjeto.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <BookUser className="w-5 h-5 text-gray-300" />
            </div>
            <p className="text-base font-medium text-gray-900">{projeto.length === 0 ? 'Este projeto ainda não tem pessoas' : 'Nenhuma pessoa encontrada'}</p>
            <p className="text-sm text-gray-600 mt-2">{projeto.length === 0 ? canManage ? 'Use Adicionar pessoa para vincular alguém da equipe ou um stakeholder externo.' : 'Peça ao gerente para vincular as pessoas do projeto.' : 'Tente outro termo ou limpe os filtros para ver todas as pessoas.'}</p>
            {hasFilters && <Button variant="secondary" className="mt-4" onClick={clearFilters}>Limpar filtros</Button>}
          </div>
        ) : (
          <ul aria-label="Pessoas do projeto" aria-busy={isReordering} className={isReordering ? 'opacity-70' : undefined}>
            {exibidos.map((s, posicao) => {
              // Índice real em `projeto`: o arrastar reordena essa lista, não a filtrada/agrupada.
              const index = projeto.indexOf(s)
              const novoGrupo = s.tipo !== exibidos[posicao - 1]?.tipo
              return (
              <Fragment key={s.id}>
              {novoGrupo && (
                <li
                  role="presentation"
                  data-testid={`grupo-${s.tipo}`}
                  className="flex items-center justify-between px-5 py-3 text-sm font-semibold text-gray-700 bg-gray-50 border-y border-gray-100"
                >
                  <span>{s.tipo === 'interno' ? 'Membros da equipe' : 'Stakeholders externos'}</span>
                  <span className="font-medium text-gray-600">{s.tipo === 'interno' ? totalEquipe : totalExternos}</span>
                </li>
              )}
              <li
                draggable={canReorder}
                onDragStart={() => handleDragStart(index)}
                onDragOver={e => handleDragOver(e, index)}
                onDrop={e => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`${styles.personRow} border-b border-gray-100 ${selected?.id === s.id ? 'bg-blue-50' : 'bg-white'} ${draggedIndex === index ? 'opacity-50' : ''} ${dragOverIndex === index && draggedIndex !== index ? 'ring-2 ring-inset ring-blue-500' : ''}`}
              >
                <div className={`${styles.identity} flex items-center gap-3 min-w-0`}>
                  {reorderMode && <GripVertical className="w-4 h-4 shrink-0 text-gray-500" aria-hidden="true" />}
                  <Avatar name={s.name} url={s.avatarUrl} />
                  <div className="min-w-0">
                    <p className={`text-base font-semibold break-words ${s.isActive === false ? 'text-red-700' : 'text-gray-900'}`}>{s.name}</p>
                    {s.email && <p className="text-sm text-gray-600 break-all mt-1">{s.email}</p>}
                    {s.isActive === false && <><p className="text-sm font-medium text-red-700 mt-1">Inativo</p>{s.inactiveReason && <p className="text-sm text-red-700 break-words mt-1">Motivo: {s.inactiveReason}</p>}</>}
                  </div>
                </div>
                <div className="min-w-0"><span className={styles.fieldLabel}>Função</span><p className="text-sm text-gray-700 break-words">{s.tipo === 'interno' ? s.cargos?.join(', ') || 'Não informada' : s.competence || 'Não informada'}</p></div>
                <div className="min-w-0"><span className={styles.fieldLabel}>Área / empresa</span><p className="text-sm text-gray-600 break-words">{s.tipo === 'interno' ? s.departamento?.join(', ') || 'Não informada' : s.company || 'Não informada'}</p></div>
                <div className="text-sm text-gray-700 tabular-nums"><span className={styles.fieldLabel}>Remuneração</span>{s.tipo === 'interno' && (s.remuneracao ?? s.hourlyRate) != null ? <>{(s.remuneracao ?? s.hourlyRate)!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<span className="block text-sm text-gray-600">{s.remuneracao != null ? 'por mês' : 'por hora'}</span></> : <span aria-label="Não informada">—</span>}</div>
                <div className={`${styles.rowActions} flex flex-wrap items-center gap-1`}>
                  {reorderMode ? <>
                    <OperumButton variant="custom" type="button" disabled={!canReorder || posicao === 0 || exibidos[posicao - 1]?.tipo !== s.tipo} onClick={() => movePerson(index, projeto.indexOf(exibidos[posicao - 1]))} aria-label={`Mover ${s.name} para cima`} className={styles.actionButton}><ArrowUp className="w-4 h-4" aria-hidden="true" /></OperumButton>
                    <OperumButton variant="custom" type="button" disabled={!canReorder || exibidos[posicao + 1]?.tipo !== s.tipo} onClick={() => movePerson(index, projeto.indexOf(exibidos[posicao + 1]))} aria-label={`Mover ${s.name} para baixo`} className={styles.actionButton}><ArrowDown className="w-4 h-4" aria-hidden="true" /></OperumButton>
                  </> : <>
                    <OperumButton variant="custom" type="button" onClick={() => handleOpenEdit(s)} title="Editar" aria-label={`Editar ${s.name}`} className={`${styles.actionButton} text-blue-700`}><Pencil className="w-4 h-4" aria-hidden="true" /><span>Editar</span></OperumButton>
                    {podeAlterarSituacao(s) && <SituacaoButton ativo={s.isActive !== false} nome={s.name} disabled={loadingId === s.id} onClick={() => (s.isActive === false ? reativar(s) : abrirInativacao(s))} />}
                    {canManage && <OperumButton variant="danger" type="button" onClick={() => handleUnlink(s)} disabled={loadingId === s.id} title="Desvincular do projeto" aria-label={`Desvincular ${s.name} do projeto`} className={`${styles.actionButton} text-gray-600 hover:text-red-700`}>{loadingId === s.id ? <Spinner /> : <UserMinus className="w-4 h-4" aria-hidden="true" />}</OperumButton>}
                  </>}
                </div>
              </li>
              </Fragment>
              )
            })}
          </ul>
        )}

        {/* Adicionar a partir da busca: diretório global, usuários e criação */}
        {isAdmin && termoProjeto && (
          <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-slate-50/50" aria-label="Adicionar ao projeto">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Adicionar ao projeto</p>

            {sugestoesExternos.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1">Diretório de stakeholders</p>
                <ul className="space-y-1">
                  {sugestoesExternos.map(s => (
                    <li key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-100">
                      <Avatar name={s.name} url={s.logoUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{s.name}</p>
                        {s.company && <p className="text-[11px] text-gray-400 truncate">{s.company}</p>}
                      </div>
                      <OperumButton variant="default" type="button"
                        onClick={() => { handleBindExterno(s); setSearchProjeto('') }}
                        disabled={loadingId === s.id}
                        aria-label={`Vincular "${s.name}" ao projeto`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                      >
                        {loadingId === s.id ? <Spinner /> : <UserPlus className="w-3.5 h-3.5" />}
                        Vincular
                      </OperumButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sugestoesInternos.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 mb-1">Usuários da instituição</p>
                <ul className="space-y-1">
                  {sugestoesInternos.map(u => (
                    <li key={u.id} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-100">
                      <Avatar name={u.name} url={u.avatarUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                        <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                      </div>
                      <OperumButton variant="default" type="button"
                        onClick={() => { handleAddInterno(u); setSearchProjeto('') }}
                        disabled={loadingId === u.id}
                        aria-label={`Adicionar "${u.name}" ao projeto`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                      >
                        {loadingId === u.id ? <Spinner /> : <UserPlus className="w-3.5 h-3.5" />}
                        Adicionar
                      </OperumButton>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Criar: só quando não há um externo com o mesmo nome (evita duplicata) */}
            {!candidatoDiretorio && (
              <div className="flex flex-col gap-2 items-stretch">
                <OperumButton variant="default" type="button"
                  onClick={handleCreateMembroDaBusca}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Criar &quot;{searchProjeto.trim()}&quot; como membro da equipe
                </OperumButton>
                <OperumButton variant="default" type="button"
                  onClick={handleQuickCreateProjeto}
                  disabled={quickLoading === 'col1'}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50"
                >
                  {quickLoading === 'col1' ? <Spinner /> : <Building2 className="w-4 h-4" />}
                  Criar &quot;{searchProjeto.trim()}&quot; como externo
                </OperumButton>
              </div>
            )}
          </div>
        )}
      </div>

      {coluna2}
      {coluna3}
    </div>
  )
}

/** Botão com texto para inativar/reativar: só o ícone não era encontrado. */
function SituacaoButton({ ativo, nome, disabled, onClick }: { ativo: boolean; nome: string; disabled?: boolean; onClick: () => void }) {
  return (
    <OperumButton variant="default"
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ativo ? `Inativar ${nome}` : `Reativar ${nome}`}
      title={ativo ? 'Inativar (com motivo)' : 'Reativar'}
      className={`inline-flex min-h-11 items-center gap-1 px-2 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${ativo
        ? 'text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100'
        : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'}`}
    >
      <Power className="w-3.5 h-3.5" aria-hidden="true" />
      {ativo ? 'Inativar' : 'Reativar'}
    </OperumButton>
  )
}
