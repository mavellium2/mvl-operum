'use client'

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import FormActions from '@/components/ui/FormActions'
import GlassButton from '@/components/ui/GlassButton'
import PasswordInput from '@/components/ui/PasswordInput'
import { Input } from '@/components/ui/Field'
import { EmailInput } from '@/components/ui/ContatoInputs'
import { erroEmail } from '@/lib/contato'
import { adminCreateUserAction } from '@/app/actions/admin'

export interface GerenteCriado {
  id: string
  name: string
  email?: string
  avatarUrl?: string | null
}

interface Props {
  /** Nome digitado na busca do campo Gerente. */
  nomeInicial?: string
  onClose: () => void
  onCriado: (usuario: GerenteCriado) => void
}

/**
 * Cadastro rápido do gerente dentro do formulário do projeto: cria o usuário da instituição
 * pelo mesmo serviço do cadastro de Stakeholders (adminCreateUserAction, só admin) e devolve
 * a pessoa para ser designada como gerente, sem sair da página.
 */
export default function CriarGerenteDialog({ nomeInicial = '', onClose, onCriado }: Props) {
  const [nome, setNome] = useState(nomeInicial)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [trocarSenha, setTrocarSenha] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    if (salvando) return
    if (!nome.trim() || !email.trim() || !senha.trim()) { setErro('Nome, e-mail e senha são obrigatórios.'); return }
    const erroContato = erroEmail(email, true)
    if (erroContato) { setErro(erroContato); return }
    setSalvando(true)
    setErro('')
    const result = await adminCreateUserAction({ name: nome.trim(), email: email.trim(), password: senha, forcePasswordChange: trocarSenha })
    setSalvando(false)
    if ('error' in result || !result.user) { setErro(('error' in result && result.error) || 'Erro ao criar usuário.'); return }
    const u = result.user as { id: string; name: string; email?: string; avatarUrl?: string | null }
    onCriado({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl ?? null })
  }

  return (
    <Modal isOpen title="Criar e designar como gerente" onClose={() => { if (!salvando) onClose() }}>
      <form onSubmit={criar} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="gerente-nome" className="mb-1 block text-xs font-medium text-gray-600">Nome <span className="text-red-400">*</span></label>
          <Input id="gerente-nome" autoFocus value={nome} onChange={e => setNome(e.target.value)} disabled={salvando} />
        </div>
        <div>
          <label htmlFor="gerente-email" className="mb-1 block text-xs font-medium text-gray-600">E-mail <span className="text-red-400">*</span></label>
          <EmailInput id="gerente-email" value={email} onValueChange={setEmail} required disabled={salvando} placeholder="gerente@instituicao.edu.br" />
        </div>
        <div>
          <label htmlFor="gerente-senha" className="mb-1 block text-xs font-medium text-gray-600">Senha inicial <span className="text-red-400">*</span></label>
          <PasswordInput id="gerente-senha" value={senha} onChange={e => setSenha(e.target.value)} disabled={salvando} placeholder="Mínimo 8 caracteres" />
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={trocarSenha} onChange={e => setTrocarSenha(e.target.checked)} disabled={salvando} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
          <span className="text-sm text-gray-700">Obrigar atualizar a senha no 1º acesso</span>
        </label>
        {erro && <p role="alert" className="text-sm text-rose-500">{erro}</p>}
        <FormActions className="flex justify-end gap-3">
          <GlassButton type="button" disabled={salvando} onClick={onClose}>Cancelar</GlassButton>
          <GlassButton type="submit" variant="primary" disabled={salvando}>{salvando ? 'Criando…' : 'Criar e designar'}</GlassButton>
        </FormActions>
      </form>
    </Modal>
  )
}
