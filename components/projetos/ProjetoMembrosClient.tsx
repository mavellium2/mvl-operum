'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput, Textarea as OperumTextarea } from '@/components/ui/Field'
import MoedaInput from '@/components/ui/MoedaInput'
import { erroMoeda, formatReais, moedaParaCampo, parseMoeda } from '@/lib/dinheiro'
import { EmailInput, TelefoneInput } from '@/components/ui/ContatoInputs'
import { erroEmail, erroTelefone } from '@/lib/contato'
import { useState, useTransition, useEffect, useRef } from 'react'
import { addMemberAction, removeMemberAction } from '@/app/actions/projects'
import { adminCreateUserAction, adminUpdateUserAction, toggleUserActiveAction } from '@/app/actions/admin'
import { updateProjetoMemberAction } from '@/app/actions/projetos'
import UserAvatar from '@/components/user/UserAvatar'
import AvatarUpload from '@/components/profile/AvatarUpload'
import AddressFields, { type AddressValues, emptyAddress } from '@/components/ui/AddressFields'
import PasswordInput from '@/components/ui/PasswordInput'

interface Usuario {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  role: string
  phone?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  notes?: string | null
  cargo?: string | null
  departamento?: string | string[] | null
  hourlyRate?: number | null
}

interface Membro extends Usuario {
  userId: string
  cargos: string[]
  departamento: string[]
  isGerente: boolean
  hourlyRate: number | null
  startDate: string
}

type FormState = {
  name: string
  email: string
  password: string
  avatarUrl: string
  phone: string
  address: AddressValues
  notes: string
  cargos: string[]
  departamento: string[]
  isGerente: boolean
  hourlyRate: string
  isActive: boolean
  forcePasswordChange: boolean
}

interface Props {
  projetoId: string
  membros: Membro[]
  disponiveis: Usuario[]
  departamentosExistentes?: string[]
  funcoesExistentes?: string[]
  userRole: 'admin' | 'gerente'
}

const emptyForm: FormState = {
  name: '',
  email: '',
  password: '',
  avatarUrl: '',
  phone: '',
  address: emptyAddress,
  notes: '',
  cargos: [],
  departamento: [],
  isGerente: false,
  hourlyRate: '',
  isActive: true,
  forcePasswordChange: false,
}

// ==========================================
// ÍCONES SVG (Novos ícones adicionados para UI)
// ==========================================
const IconPlus = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
)
const IconEdit = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
)
const IconTrash = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
)
const IconClose = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
)
const IconUsers = () => (
  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
)
const IconSpinner = ({ cls = 'w-4 h-4' }: { cls?: string }) => (
  <div className={`${cls} border-2 border-current border-t-transparent rounded-full animate-spin`} />
)

const IconPhone = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
)
const IconWallet = () => (
  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5m-9 1v2m-3-11v2m6-2v2M7 7h10" /></svg>
)
// Novos Ícones Decorativos
const IconBriefcase = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
)
const IconMail = () => (
  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
)
const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow'
const disabledCls = 'disabled:bg-gray-100 disabled:text-gray-400 cursor-not-allowed'

/** Valor em reais do formulário ("1.234,56" ou o salvo "1234.56") → número; null se vazio/inválido. */
function parseBRLFloat(value: string): number | null {
  const n = parseMoeda(value)
  return n === null || Number.isNaN(n) ? null : n
}

// ==========================================
// COMPONENTE MULTI-CREATABLE (Mantido)
// ==========================================
function MultiCreatableSelect({ values = [], onChange, options, placeholder, disabled = false }: { values: string[]; onChange: (v: string[]) => void; options: string[]; placeholder: string; disabled?: boolean; }) {
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

  const filteredOptions = options.filter(opt => opt.toLowerCase().includes(search.toLowerCase()) && !values.includes(opt))
  const isExactMatch = options.some(opt => opt.toLowerCase() === search.toLowerCase().trim())
  const showCreateOption = search.trim().length > 0 && !isExactMatch && !values.includes(search.trim())

  const handleSelect = (val: string) => {
    if (disabled) return;
    if (!values.includes(val)) onChange([...values, val])
    setSearch('')
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleRemove = (val: string) => {
    if (disabled) return;
    onChange(values.filter(v => v !== val))
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <div className={`min-h-[42px] w-full px-2 py-1.5 border border-gray-200 rounded-xl text-sm transition-shadow flex flex-wrap gap-1.5 items-center ${disabled ? 'bg-gray-50 cursor-not-allowed' : 'bg-white focus-within:ring-2 focus-within:ring-blue-500 cursor-text'}`} onClick={() => { if (disabled) return; setIsOpen(true); inputRef.current?.focus() }}>
        {values.map(val => (
          <span key={val} className="flex items-center gap-1 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-medium border border-slate-200">
            {val}
            {!disabled && (
              <OperumButton variant="custom" type="button" onClick={(e) => { e.stopPropagation(); handleRemove(val); }} className="hover:text-red-600 focus:outline-none transition-colors"><IconClose /></OperumButton>
            )}
          </span>
        ))}
        <OperumInput ref={inputRef} type="text" value={search} disabled={disabled} onChange={(e) => { setSearch(e.target.value); setIsOpen(true) }} onFocus={() => !disabled && setIsOpen(true)} placeholder={values.length === 0 ? placeholder : ''} className="flex-1 min-w-[120px] outline-none bg-transparent text-sm disabled:cursor-not-allowed" />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-48 overflow-y-auto py-1">
          {filteredOptions.length > 0 && filteredOptions.map((opt) => (
            <OperumButton variant="default" type="button" key={opt} onClick={() => handleSelect(opt)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-slate-50 transition-colors">{opt}</OperumButton>
          ))}
          {showCreateOption && (
            <OperumButton variant="default" type="button" onClick={() => handleSelect(search.trim())} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-blue-700 font-medium bg-blue-50/50 hover:bg-blue-50 transition-colors border-t border-gray-50">
              <IconPlus /> Criar tag {'"'}{search.trim()}{'"'}
            </OperumButton>
          )}
          {filteredOptions.length === 0 && !showCreateOption && (
            <div className="px-4 py-3 text-sm text-gray-400 italic text-center">
              {values.length > 0 ? "Sem mais opções" : "Nenhuma opção encontrada"}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function ProjetoMembrosClient({
  projetoId,
  membros: initial,
  disponiveis: initialDisp,
  departamentosExistentes = [],
  funcoesExistentes = [],
  userRole,
}: Props) {
  const isAdmin = userRole === 'admin'

  const [membros, setMembros] = useState<Membro[]>(initial)
  const [disponiveis, setDisponiveis] = useState<Usuario[]>(initialDisp)
  const [showSystemUsers, setShowSystemUsers] = useState(false)

  const [selectedUser, setSelectedUser] = useState<Membro | Usuario | null>(null)
  const [editContext, setEditContext] = useState<'member' | 'system' | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [formState, setFormState] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  const [isPending, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const [searchMembros, setSearchMembros] = useState('')
  const [searchDisponiveis, setSearchDisponiveis] = useState('')

  const showCol3 = selectedUser !== null || isCreating
  const col2Active = showSystemUsers && isAdmin
  const col1Width = col2Active || showCol3 ? 'lg:w-1/3' : 'w-full'
  const col3Width = col2Active ? 'lg:w-1/3' : 'lg:flex-1'

  const filteredMembros = membros.filter(m => {
    const q = searchMembros.toLowerCase()
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  })

  const filteredDisponiveis = disponiveis.filter(u => {
    const q = searchDisponiveis.toLowerCase()
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFormState(f => ({ ...f, [key]: value }))
  }

  function handleOpenEdit(user: Membro | Usuario, context: 'member' | 'system') {
    setIsCreating(false)
    setEditContext(context)
    setFormError(null)

    if (context === 'member') {
      const m = user as Membro
      setFormState({
        name: m.name,
        email: m.email,
        password: '',
        avatarUrl: m.avatarUrl || '',
        phone: m.phone || '',
        address: {
          cep: m.cep || '',
          logradouro: m.logradouro || '',
          numero: m.numero || '',
          complemento: m.complemento || '',
          bairro: m.bairro || '',
          cidade: m.cidade || '',
          estado: m.estado || '',
        },
        notes: m.notes || '',
        cargos: m.cargos ?? [],
        departamento: Array.isArray(m.departamento) ? m.departamento : (m.departamento ? [m.departamento] : []),
        isGerente: m.isGerente ?? false,
        hourlyRate: moedaParaCampo(m.hourlyRate),
        isActive: true,
        forcePasswordChange: false,
      })
    } else {
      setFormState({
        ...emptyForm,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl || '',
        phone: user.phone || '',
        address: {
          cep: user.cep || '',
          logradouro: user.logradouro || '',
          numero: user.numero || '',
          complemento: user.complemento || '',
          bairro: user.bairro || '',
          cidade: user.cidade || '',
          estado: user.estado || '',
        },
        notes: user.notes || '',
        departamento: user.departamento
          ? (Array.isArray(user.departamento) ? user.departamento : [user.departamento])
          : [],
      })
    }
    setSelectedUser(user)
  }

  function handleOpenCreate() {
    if (!isAdmin) return
    setSelectedUser(null)
    setEditContext(null)
    setIsCreating(true)
    setFormError(null)
    setFormState({ ...emptyForm, forcePasswordChange: true })
  }

  function handleClearSelection() {
    setSelectedUser(null)
    setEditContext(null)
    setIsCreating(false)
    setFormError(null)
  }

  function handleAddMember(user: Usuario) {
    if (!isAdmin) return

    const u = user
    const novoMembro: Membro = {
      ...user,
      userId: user.id,
      cargos: u.cargo ? [u.cargo] : [],
      departamento: u.departamento ? (Array.isArray(u.departamento) ? u.departamento : [u.departamento]) : [],
      isGerente: false,
      hourlyRate: u.hourlyRate || null,
      startDate: new Date().toISOString(),
    }

    setMembros(prev => [...prev, novoMembro])
    setDisponiveis(prev => prev.filter(u => u.id !== user.id))
    handleOpenEdit(novoMembro, 'member')

    startTransition(async () => {
      setLoadingId(user.id)
      const result = await addMemberAction(projetoId, user.id)
      setLoadingId(null)
      if ('error' in result) {
        setMembros(prev => prev.filter(m => m.userId !== user.id))
        setDisponiveis(prev => [...prev, user])
        handleClearSelection()
      }
    })
  }

  function handleRemoveMember(membro: Membro) {
    if (!isAdmin) return
    setMembros(prev => prev.filter(m => m.userId !== membro.userId))
    setDisponiveis(prev => [
      ...prev,
      { id: membro.userId, name: membro.name, email: membro.email, avatarUrl: membro.avatarUrl, role: membro.role, phone: membro.phone, cep: membro.cep, logradouro: membro.logradouro, numero: membro.numero, complemento: membro.complemento, bairro: membro.bairro, cidade: membro.cidade, estado: membro.estado, notes: membro.notes },
    ])
    if (selectedUser && 'userId' in selectedUser && selectedUser.userId === membro.userId) {
      handleClearSelection()
    }
    startTransition(async () => {
      setLoadingId(membro.userId)
      const result = await removeMemberAction(projetoId, membro.userId)
      setLoadingId(null)
      if ('error' in result) {
        setMembros(prev => [...prev, membro])
        setDisponiveis(prev => prev.filter(u => u.id !== membro.userId))
      }
    })
  }

  async function handleSaveUser() {
    setFormError(null)
    // Os campos ficam desabilitados para quem não é admin; o servidor ignora o que não mudou.
    const erroContato = isAdmin ? (erroEmail(formState.email, true) ?? erroTelefone(formState.phone) ?? erroMoeda(formState.hourlyRate, { rotulo: 'Valor/hora' })) : null
    if (erroContato) {
      setFormError(erroContato)
      return
    }

    if (isCreating) {
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
        avatarUrl: formState.avatarUrl,
        phone: formState.phone,
        cep: formState.address.cep,
        logradouro: formState.address.logradouro,
        numero: formState.address.numero,
        complemento: formState.address.complemento,
        bairro: formState.address.bairro,
        cidade: formState.address.cidade,
        estado: formState.address.estado,
        notes: formState.notes,
        forcePasswordChange: formState.forcePasswordChange,
      })
      setLoadingId(null)
      if ('error' in result) {
        setFormError(result.error ?? 'Erro ao criar usuário')
        return
      }
      const newUser: Usuario = {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        avatarUrl: result.user.avatarUrl ?? null,
        role: result.user.role,
        phone: result.user.phone,
        cep: result.user.cep,
        logradouro: result.user.logradouro,
        numero: result.user.numero,
        complemento: result.user.complemento,
        bairro: result.user.bairro,
        cidade: result.user.cidade,
        estado: result.user.estado,
        notes: result.user.notes,
      }
      setDisponiveis(prev => [...prev, newUser])
      handleClearSelection()
      return
    }

    if (editContext === 'member' && selectedUser && 'userId' in selectedUser) {
      const m = selectedUser as Membro
      setLoadingId('form')

      const result = await updateProjetoMemberAction(m.userId, projetoId, {
        avatarUrl: formState.avatarUrl,
        phone: formState.phone,
        cep: formState.address.cep,
        logradouro: formState.address.logradouro,
        numero: formState.address.numero,
        complemento: formState.address.complemento,
        bairro: formState.address.bairro,
        cidade: formState.address.cidade,
        estado: formState.address.estado,
        notes: formState.notes,
        hourlyRate: isAdmin ? (parseBRLFloat(formState.hourlyRate) ?? undefined) : undefined,
        cargos: formState.cargos,
        departamento: formState.departamento,
        isGerente: formState.isGerente,
      })

      setLoadingId(null)
      if ('error' in result) {
        setFormError(result.error ?? 'Erro ao salvar')
        return
      }

      setMembros(prev =>
        prev.map(existing =>
          existing.userId === m.userId
            ? {
              ...existing,
              avatarUrl: formState.avatarUrl || existing.avatarUrl,
              phone: formState.phone,
              cep: formState.address.cep,
              logradouro: formState.address.logradouro,
              numero: formState.address.numero,
              complemento: formState.address.complemento,
              bairro: formState.address.bairro,
              cidade: formState.address.cidade,
              estado: formState.address.estado,
              notes: formState.notes,
              cargos: formState.cargos,
              departamento: formState.departamento,
              isGerente: formState.isGerente,
              role: formState.isGerente ? 'gerente' : 'member',
              hourlyRate: isAdmin ? (parseBRLFloat(formState.hourlyRate) ?? existing.hourlyRate) : existing.hourlyRate,
            }
            : existing,
        ),
      )
      handleClearSelection()
      return
    }

    if (editContext === 'system' && selectedUser && !('userId' in selectedUser)) {
      if (!isAdmin) return
      const u = selectedUser as Usuario
      setLoadingId('form')
      const [updateResult] = await Promise.all([
        adminUpdateUserAction(u.id, {
          name: formState.name,
          email: formState.email,
          avatarUrl: formState.avatarUrl,
          phone: formState.phone,
          cep: formState.address.cep,
          logradouro: formState.address.logradouro,
          numero: formState.address.numero,
          complemento: formState.address.complemento,
          bairro: formState.address.bairro,
          cidade: formState.address.cidade,
          estado: formState.address.estado,
          notes: formState.notes,
          cargo: formState.cargos.join(', '),
          departamento: formState.departamento.join(', '),
          ...(parseBRLFloat(formState.hourlyRate) !== null ? { hourlyRate: parseBRLFloat(formState.hourlyRate)! } : {}),
        }),
        toggleUserActiveAction(u.id, formState.isActive),
      ])
      setLoadingId(null)
      if ('error' in updateResult) {
        setFormError(updateResult.error ?? 'Erro ao salvar')
        return
      }
      setDisponiveis(prev =>
        prev.map(existing =>
          existing.id === u.id
            ? { ...existing, name: formState.name, email: formState.email, avatarUrl: formState.avatarUrl, phone: formState.phone, cep: formState.address.cep, logradouro: formState.address.logradouro, numero: formState.address.numero, complemento: formState.address.complemento, bairro: formState.address.bairro, cidade: formState.address.cidade, estado: formState.address.estado, notes: formState.notes }
            : existing
        ),
      )
      handleClearSelection()
    }
  }

  function handleDeleteUser(userId: string) {
    if (!isAdmin) return
    startTransition(async () => {
      setLoadingId(userId)
      const result = await toggleUserActiveAction(userId, false)
      setLoadingId(null)
      if (!('error' in result)) {
        setDisponiveis(prev => prev.filter(u => u.id !== userId))
        if (selectedUser && !('userId' in selectedUser) && selectedUser.id === userId) {
          handleClearSelection()
        }
      }
    })
  }

  const col3Title = isCreating ? 'Novo Usuário' : editContext === 'member' ? 'Editar Membro' : 'Editar Usuário'

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">

      {/* ── COLUMN 1 — Membros do Projeto ── */}
      <div className={`${col1Width} w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Membros do Projeto</h2>
            <p className="text-xs text-gray-400 mt-0.5">{membros.length} membro{membros.length !== 1 ? 's' : ''}</p>
          </div>
          {isAdmin && (
            <OperumButton variant="custom" type="button" onClick={() => setShowSystemUsers(true)} title="Adicionar membros" className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
              <IconPlus />
            </OperumButton>
          )}
        </div>

        <div className="px-4 py-3 border-b border-gray-100">
          <OperumInput type="search" placeholder="Buscar membro…" value={searchMembros} onChange={e => setSearchMembros(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {filteredMembros.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3"><IconUsers /></div>
            <p className="text-sm text-gray-500">{membros.length === 0 ? (isAdmin ? 'Nenhum membro. Clique em + para adicionar.' : 'Nenhum membro no projeto.') : 'Nenhum resultado para a busca.'}</p>
          </div>
        ) : (
          <ul className="divide-y-0 space-y-2 overflow-y-auto max-h-[600px] px-2 py-2">
  {filteredMembros.map(m => (
    <li
      key={m.userId}
      className={`
        group flex flex-col sm:flex-row sm:items-center justify-between gap-3
        p-3 transition-all duration-200 rounded-xl bg-white
        'border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'}
      `}
    >

      {/* ESQUERDA: Avatar e Info */}
      <div className="flex items-center gap-3.5 flex-1 min-w-0">

        {/* Avatar mantido grande, mas sem o container extra do ícone */}
        <div className={`rounded-full shrink-0 ${m.isGerente
          ? 'border-2 border-amber-500 shadow-sm'
          : 'border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'}`}>
          <UserAvatar name={m.name} avatarUrl={m.avatarUrl} size="lg" />
        </div>

        {/* Informações do Usuário (Mais compactas) */}
        <div className="flex flex-col gap-1 w-full min-w-0">

          {/* Nome Completo */}
          <span className="text-[15px] leading-none font-bold text-slate-800 tracking-tight truncate">
            {m.name}
          </span>

          {/* Badges: Função e Dinheiro */}
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {(m.cargos.length > 0 || m.departamento.length > 0) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100">
                <IconBriefcase />
                <span className="truncate max-w-[120px] sm:max-w-none">
                  {m.cargos[0] || m.departamento[0]}
                  {(m.cargos.length > 1 || m.departamento.length > 1 || (m.cargos[0] && m.departamento[0])) && ' +'}
                </span>
              </span>
            )}

            {m.hourlyRate !== null && m.hourlyRate !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100">
                <IconWallet />
                {formatReais(Number(m.hourlyRate))}/h
              </span>
            )}
          </div>

          {/* Contatos Menores na mesma linha ou bem próximos */}
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-medium text-slate-400 mt-0.5">
            <span className="flex items-center gap-1 truncate">
              <IconMail />
              {m.email}
            </span>

            {m.phone && (
              <span className="flex items-center gap-1 truncate">
                <IconPhone />
                {m.phone}
              </span>
            )}
          </div>

        </div>
      </div>

      {/* DIREITA: Botões de Ação */}
      <div className="flex items-center justify-end gap-1 w-full sm:w-auto pt-2 sm:pt-0 border-t border-slate-100 sm:border-0 shrink-0">
        <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <OperumButton variant="custom" type="button"
            onClick={() => handleOpenEdit(m, 'member')}
            title="Editar Detalhes"
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <IconEdit />
          </OperumButton>

          {isAdmin && (
            <OperumButton variant="danger" type="button"
              onClick={() => handleRemoveMember(m)}
              disabled={loadingId === m.userId || isPending}
              title="Remover do projeto"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
            >
              {loadingId === m.userId ? <IconSpinner /> : <IconTrash />}
            </OperumButton>
          )}
        </div>
      </div>

    </li>
  ))}
</ul>
        )}
      </div>

      {/* ── COLUMN 2 — Usuários do Sistema (admin only) ── */}
      {col2Active && (
        <div className="lg:w-1/3 w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-in slide-in-from-left-4 duration-300">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Usuários do Sistema</h2>
              <p className="text-xs text-gray-400 mt-0.5">{disponiveis.length} disponíveis</p>
            </div>
            <div className="flex items-center gap-1">
              <OperumButton variant="custom" type="button" onClick={handleOpenCreate} className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"><IconPlus /></OperumButton>
              <OperumButton variant="custom" type="button" onClick={() => setShowSystemUsers(false)} className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"><IconClose /></OperumButton>
            </div>
          </div>
          <div className="px-4 py-3 border-b border-gray-100">
            <OperumInput type="search" placeholder="Buscar usuário…" value={searchDisponiveis} onChange={e => setSearchDisponiveis(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {filteredDisponiveis.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-gray-400">{disponiveis.length === 0 ? 'Todos os usuários já estão no projeto.' : 'Nenhum resultado.'}</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50/80 p-2 space-y-1">
              {filteredDisponiveis.map(u => (
                <li key={u.id} className="group flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 hover:shadow-sm transition-all">
                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1.5 mt-0.5">
                      <IconMail /> {u.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                    <OperumButton variant="default" type="button" onClick={() => handleAddMember(u)} disabled={loadingId === u.id || isPending} className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-40">{loadingId === u.id ? <IconSpinner /> : <IconPlus />}</OperumButton>
                    <OperumButton variant="custom" type="button" onClick={() => handleOpenEdit(u, 'system')} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"><IconEdit /></OperumButton>
                    <OperumButton variant="danger" type="button" onClick={() => handleDeleteUser(u.id)} disabled={loadingId === u.id || isPending} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40">{loadingId === u.id ? <IconSpinner /> : <IconTrash />}</OperumButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── COLUMN 3 — Formulário de Edição ── */}
      {showCol3 && (
        <div className={`${col3Width} w-full bg-white rounded-2xl shadow-sm border border-gray-100 max-h-[calc(100vh-6rem)] flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
            <h2 className="text-sm font-semibold text-gray-900">{col3Title}</h2>
            <OperumButton variant="custom" type="button" onClick={handleClearSelection} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><IconClose /></OperumButton>
          </div>

          <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="flex justify-center mb-6">
              <AvatarUpload
                name={formState.name || 'Novo Usuário'}
                avatarUrl={formState.avatarUrl}
                onChange={(url: string) => setField('avatarUrl', url)}
                disabled={!isAdmin}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome</label>
              <OperumInput type="text" value={formState.name} onChange={e => setField('name', e.target.value)} disabled={!isAdmin} className={`${inputCls} ${disabledCls}`} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
              <EmailInput value={formState.email} onValueChange={v => setField('email', v)} disabled={!isAdmin} required={isAdmin} className={`${inputCls} ${disabledCls}`} />
            </div>

            {isCreating && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Senha *</label>
                <PasswordInput value={formState.password} onChange={e => setField('password', e.target.value)} disabled={!isAdmin} className={`${inputCls} ${disabledCls}`} />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Telefone</label>
                <TelefoneInput
                  value={formState.phone}
                  onValueChange={v => setField('phone', v)}
                  disabled={!isAdmin}
                  adorno={
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                  }
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>


              {/* Campo: Valor/hora */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Valor/hora</label>
                <MoedaInput
                  value={formState.hourlyRate}
                  onValueChange={texto => setField('hourlyRate', texto)}
                  disabled={!isAdmin}
                  rotulo="Valor/hora"
                  adorno={
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-sm font-medium text-gray-500">R$</span>
                    </div>
                  }
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

            </div>

            <AddressFields
              values={formState.address}
              onChange={(field, value) => setFormState(f => ({ ...f, address: { ...f.address, [field]: value } }))}
              disabled={!isAdmin}
            />

            <hr className="border-gray-100 my-2" />

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cargos / Funções</label>
              <MultiCreatableSelect
                values={formState.cargos}
                onChange={v => setField('cargos', v)}
                options={funcoesExistentes}
                placeholder="Adicionar cargo..."
                disabled={!isAdmin && editContext === 'system'}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Departamentos</label>
              <MultiCreatableSelect
                values={formState.departamento}
                onChange={(v) => setField('departamento', v)}
                options={departamentosExistentes}
                placeholder="Adicionar departamento..."
                disabled={!isAdmin && editContext === 'system'}
              />
            </div>

            {editContext === 'member' && (
              <div className="flex items-center justify-between py-2">
                <div>
                  <span className="text-xs font-medium text-gray-600">Gerente do Projeto</span>
                  <p className="text-[10px] text-gray-400 mt-0.5">Concede acesso de gerência neste projeto</p>
                </div>
                <OperumButton variant="custom"
                  type="button"
                  onClick={() => isAdmin && setField('isGerente', !formState.isGerente)}
                  disabled={!isAdmin}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${formState.isGerente ? 'bg-blue-600' : 'bg-gray-200'} ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${formState.isGerente ? 'translate-x-6' : 'translate-x-1'}`} />
                </OperumButton>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
              <OperumTextarea
                value={formState.notes}
                onChange={e => setField('notes', e.target.value)}
                disabled={!isAdmin}
                rows={3}
                placeholder="Anotações internas sobre o usuário..."
                className={`${inputCls} ${disabledCls} resize-none`}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-medium text-gray-600">Status</span>
              <OperumButton variant="custom" type="button" onClick={() => isAdmin && setField('isActive', !formState.isActive)} disabled={!isAdmin} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${formState.isActive ? 'bg-green-500' : 'bg-gray-200'} ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${formState.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
              </OperumButton>
            </div>

            {isCreating && (
              <label className={`flex items-start gap-3 mt-2 ${!isAdmin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={formState.forcePasswordChange} onChange={e => setField('forcePasswordChange', e.target.checked)} disabled={!isAdmin} className="mt-0.5 w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500" />
                <span className="text-sm text-gray-700">Obrigar atualizar a senha no 1º acesso</span>
              </label>
            )}

            {formError && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}

            <FormActions className="flex gap-2 pt-4">
              <OperumButton variant="default" type="button" onClick={handleClearSelection} className="flex-1 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</OperumButton>
              <OperumButton variant="primary" type="button" onClick={handleSaveUser} disabled={loadingId === 'form' || isPending} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {loadingId === 'form' && <IconSpinner cls="w-3.5 h-3.5" />}
                {isCreating ? 'Criar Usuário' : 'Salvar Dados'}
              </OperumButton>
            </FormActions>
          </div>
        </div>
      )}
    </div>
  )
}
