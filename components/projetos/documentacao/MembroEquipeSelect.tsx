'use client'

import { EmailInput } from '@/components/ui/ContatoInputs'
import { erroEmail } from '@/lib/contato'
import { useCallback, useMemo, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { criarMembroEquipeAction } from '@/app/actions/membros'
import { Loader2, Plus } from 'lucide-react'
import PasswordInput from '@/components/ui/PasswordInput'

export interface MembroEquipeOption {
  id: string
  name: string
  setor: string | null
  /** Cadastro pendente (membro criado de forma simples — falta concluir o 1º acesso) */
  pendente?: boolean
}

interface Props {
  membros: MembroEquipeOption[]
  projetoId: string
  value?: string | null
  onChange?: (membro: MembroEquipeOption | null) => void
  /** Chamado quando um novo membro é criado pelo próprio seletor (criação simples + pendência) */
  onCriarMembro?: (membro: MembroEquipeOption) => void
  placeholder?: string
  className?: string
  name?: string
  id?: string
  disabled?: boolean
}

const CREATE_SENTINEL = '__criar_novo_membro__'
const fieldCls = 'block text-sm font-semibold text-slate-700 mb-1'
const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'

/**
 * Seletor de responsável/aprovador restrito a membros da equipe.
 * Inclui a opção "＋ Criar novo membro…" para criação simples: o membro é criado
 * e vinculado ao projeto com cadastro PENDENTE (troca de senha no 1º acesso),
 * com notificações de sucesso/falha.
 */
export default function MembroEquipeSelect({
  membros,
  projetoId,
  value,
  onChange,
  onCriarMembro,
  placeholder = 'Selecionar membro da equipe',
  className,
  name,
  id,
  disabled,
}: Props) {
  const { toast } = useToast()
  const selectRef = useRef<HTMLSelectElement>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  function openModal() {
    setFormError(null)
    setForm({ name: '', email: '', password: '' })
    setModalOpen(true)
  }

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value
    if (v === CREATE_SENTINEL) {
      openModal()
      // O option "+ Criar" é apenas um gatilho — volta a exibir o valor selecionado.
      requestAnimationFrame(() => {
        if (selectRef.current) selectRef.current.value = value ?? ''
      })
      return
    }
    onChange?.(membros.find(m => m.id === v) ?? null)
  }

  async function handleCreate() {
    const name = form.name.trim()
    const email = form.email.trim()
    if (!name || !email || !form.password) {
      setFormError('Preencha nome, e-mail e senha.')
      return
    }
    const erroDoEmail = erroEmail(email, true)
    if (erroDoEmail) {
      setFormError(erroDoEmail)
      return
    }
    setSaving(true)
    setFormError(null)
    const result = await criarMembroEquipeAction({
      projetoId,
      name,
      email,
      password: form.password,
    })
    setSaving(false)
    if (!('membro' in result)) {
      const msg = result.error ?? 'Erro ao criar o membro.'
      setFormError(msg)
      toast(msg, 'error')
      return
    }
    const novo: MembroEquipeOption = {
      id: result.membro.id,
      name: result.membro.name,
      setor: null,
      pendente: true,
    }
    setModalOpen(false)
    onCriarMembro?.(novo)
    onChange?.(novo)
    toast(`"${novo.name}" criado e vinculado ao projeto — cadastro pendente de 1º acesso.`, 'success')
  }

  return (
    <>
      <div className="flex gap-2 items-start">
        <select
          ref={selectRef}
          id={id}
          name={name}
          value={value ?? ''}
          onChange={handleSelectChange}
          disabled={disabled}
          className={`flex-1 min-w-0 ${className ?? inputCls}`}
        >
          <option value="">{placeholder}</option>
          {membros.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.pendente ? ' — Pendente' : ''}
            </option>
          ))}
          <option value={CREATE_SENTINEL}>＋ Criar novo membro…</option>
        </select>
        <button
          type="button"
          onClick={openModal}
          disabled={disabled}
          title="Criar novo membro da equipe (criação simples, com pendência de cadastro)"
          aria-label="Criar novo membro da equipe"
          className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg border border-slate-300 text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Criar novo membro da equipe" maxWidth="max-w-sm">
        <div className="flex flex-col gap-3 py-2">
          <p className="text-xs text-slate-500 leading-relaxed">
            Criação simples: o membro é vinculado ao projeto como <strong>pendente</strong> — ele
            precisará trocar a senha no primeiro acesso para concluir o cadastro.
          </p>
          <div>
            <label className={fieldCls}>Nome <span className="text-red-500">*</span></label>
            <input
              className={inputCls}
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nome completo"
              autoFocus
            />
          </div>
          <div>
            <label className={fieldCls}>E-mail <span className="text-red-500">*</span></label>
            <EmailInput
              className={inputCls}
              value={form.email}
              onValueChange={v => setForm(f => ({ ...f, email: v }))}
              required
              placeholder="email@exemplo.com"
            />
          </div>
          <div>
            <label className={fieldCls}>Senha provisória <span className="text-red-500">*</span></label>
            <PasswordInput
              className={inputCls}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Mínimo de 8 caracteres"
            />
          </div>

          {formError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 mt-1">
            <button
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? 'Criando…' : 'Criar membro'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

/**
 * Gerencia a lista de membros da equipe somada aos membros criados de forma simples
 * na sessão atual (pendência). Utilizado pelos documentos para alimentar o seletor
 * e identificar pêndencias nos responsáveis/aprovadores.
 */
export function useMembrosEquipe(membros: MembroEquipeOption[]) {
  const [criados, setCriados] = useState<MembroEquipeOption[]>([])
  const todos = useMemo(() => {
    const extras = criados.filter(c => !membros.some(m => m.id === c.id))
    return [...membros, ...extras]
  }, [membros, criados])
  const registrarCriado = useCallback((m: MembroEquipeOption) => {
    setCriados(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]))
  }, [])
  return { todos, registrarCriado }
}