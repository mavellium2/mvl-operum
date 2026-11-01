'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Plus } from 'lucide-react'
import Select from '@/components/ui/Select'
import type { StakeholderUnificado } from '@/components/projetos/ProjetoStakeholdersClient'

const CadastroMembroLateral = dynamic(() => import('@/components/projetos/cadastro/CadastroMembroLateral'), { ssr: false })

export interface MembroEquipeOption {
  id: string
  name: string
  setor: string | null
  pendente?: boolean
}

interface Props {
  membros: MembroEquipeOption[]
  projetoId: string
  value?: string | null
  onChange?: (membro: MembroEquipeOption | null) => void
  onCriarMembro?: (membro: MembroEquipeOption) => void
  placeholder?: string
  className?: string
  name?: string
  id?: string
  disabled?: boolean
  ariaLabel?: string
  semBotaoCriar?: boolean
  /** Dentro da folha do documento: segue a fonte e a altura da linha. */
  naFolha?: boolean
}

/** Seleção de pessoas comum ao sistema; criar usa o cadastro interno lateral de Stakeholders. */
export default function MembroEquipeSelect({ membros, projetoId, value, onChange, onCriarMembro, placeholder = 'Selecionar pessoa', className, name, id, disabled, semBotaoCriar = false, ariaLabel, naFolha = false }: Props) {
  const [criando, setCriando] = useState(false)
  const [adicionados, setAdicionados] = useState<MembroEquipeOption[]>([])
  const opcoes = [...membros, ...adicionados.filter(p => !membros.some(m => m.id === p.id))]

  function selecionarCriado(pessoa: StakeholderUnificado) {
    if (pessoa.tipo !== 'interno') return
    const membro: MembroEquipeOption = { id: pessoa.userId || pessoa.id, name: pessoa.name, setor: pessoa.cargos?.join(', ') || pessoa.departamento?.join(', ') || null, pendente: pessoa.forcePasswordChange }
    setAdicionados(prev => [...prev.filter(p => p.id !== membro.id), membro])
    onCriarMembro?.(membro)
    onChange?.(membro)
    window.dispatchEvent(new CustomEvent('operum:project-members-updated', { detail: { projetoId } }))
  }

  return <>
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Select
        id={id}
        name={name}
        value={opcoes.some(m => m.id === value) ? value : ''}
        onChange={v => onChange?.(opcoes.find(m => m.id === v) ?? null)}
        options={[{ value: '', label: 'Nenhuma pessoa selecionada' }, ...opcoes.map(m => ({ value: m.id, label: m.name, description: [m.setor, m.pendente ? 'Cadastro pendente' : null].filter(Boolean).join(' · ') || undefined }))]}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        disabled={disabled}
        compact={semBotaoCriar && !naFolha}
        inline={naFolha}
        className={className}
        onCreate={projetoId ? () => setCriando(true) : undefined}
        createLabel="Criar novo membro"
      />
      {!semBotaoCriar && projetoId && <OperumButton variant="custom" type="button" onClick={() => setCriando(true)} disabled={disabled} aria-label="Criar novo membro da equipe" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-40"><Plus className="h-4 w-4" /></OperumButton>}
    </div>
    {criando && <CadastroMembroLateral projetoId={projetoId} onClose={() => setCriando(false)} onSelecionado={selecionarCriado} />}
  </>
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