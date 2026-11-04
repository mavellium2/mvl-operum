'use client'


import GlassCloseButton from '@/components/ui/GlassCloseButton'
import Select from '@/components/ui/Select'
import { useState, useEffect } from 'react'
import UserAvatar from '@/components/user/UserAvatar'
import { addResponsibleAction, removeResponsibleAction, getResponsiblesAction } from '@/app/actions/cardResponsible'

interface User {
  id: string
  name: string
  avatarUrl?: string | null
  cargo?: string | null
}

interface MultiUserSelectorProps {
  cardId: string
  users: User[]
  onResponsiblesChange?: (responsibles: Responsible[]) => void
  /** Modo de criação: ainda não existe card — só seleção local, sem chamadas à API. */
  pending?: boolean
  selection?: { ids: string[]; onChange: (ids: string[]) => void }
  selectLabel?: string
  compact?: boolean
}

interface Responsible {
  userId: string
  user: { id: string; name: string; cargo: string | null; avatarUrl: string | null }
}

export default function MultiUserSelector({ cardId, users, onResponsiblesChange, pending = false, selection, selectLabel = 'Adicionar responsável', compact = false }: MultiUserSelectorProps) {
  const [storedResponsibles, setResponsibles] = useState<Responsible[]>([])
  const local = pending || !!selection
  const [loading, setLoading] = useState(!local)
  const responsibles = selection ? selection.ids.map(userId => {
    const user = users.find(option => option.id === userId)
    return { userId, user: { id: userId, name: user?.name ?? 'Usuário indisponível', cargo: user?.cargo ?? null, avatarUrl: user?.avatarUrl ?? null } }
  }) : storedResponsibles
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (local) return
    getResponsiblesAction(cardId).then(result => {
      if (cancelled) return
      if ('responsibles' in result && result.responsibles) {
        const valid = result.responsibles.filter((r: Responsible) => r.user != null)
        setResponsibles(valid)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [cardId, local])

  async function handleToggle(userId: string) {
    const isSelected = responsibles.some(r => r.userId === userId)

    if (selection) {
      selection.onChange(isSelected ? selection.ids.filter(id => id !== userId) : [...selection.ids, userId])
      return
    }

    if (pending) {
      if (isSelected) {
        const next = responsibles.filter(r => r.userId !== userId)
        setResponsibles(next)
        onResponsiblesChange?.(next)
      } else {
        const user = users.find(u => u.id === userId)
        if (!user) return
        const next = [...responsibles, {
          userId,
          user: { id: user.id, name: user.name, cargo: user.cargo ?? null, avatarUrl: user.avatarUrl ?? null },
        }]
        setResponsibles(next)
        onResponsiblesChange?.(next)
      }
      return
    }

    setErro(null)
    if (isSelected) {
      const result = await removeResponsibleAction(cardId, userId)
      // Ex.: último responsável de card em "Em andamento" ou depois (ADR-045).
      if ('error' in result) { setErro(result.error ?? 'Não foi possível remover o responsável.'); return }
      const next = responsibles.filter(r => r.userId !== userId)
      setResponsibles(next)
      onResponsiblesChange?.(next)
    } else {
      const user = users.find(u => u.id === userId)
      if (!user) return
      const result = await addResponsibleAction(cardId, userId)
      if ('error' in result) { setErro(result.error ?? 'Não foi possível adicionar o responsável.'); return }
      const next = [...responsibles, {
        userId,
        user: { id: user.id, name: user.name, cargo: user.cargo ?? null, avatarUrl: user.avatarUrl ?? null },
      }]
      setResponsibles(next)
      onResponsiblesChange?.(next)
    }
  }

  if (loading) return <div className="text-xs text-gray-400">Carregando...</div>

  return (
    <div className={compact ? "flex min-w-0 items-center gap-1" : "space-y-2"}>
      {erro && <p role="alert" className="w-full text-xs text-red-600">{erro}</p>}
      {responsibles.length > 0 && (
        <div className={compact ? "flex min-w-0 items-center gap-1 overflow-x-auto p-0.5 [scrollbar-width:thin]" : "mb-2 flex flex-wrap gap-2"}>
          {responsibles.filter(r => r.user != null).map(r => (
            <div
              key={r.userId}
              className={compact ? "flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-blue-50 py-0.5 pl-1 pr-0.5" : "flex items-center gap-1.5 bg-blue-50 rounded-full pl-1 pr-2 py-0.5"}
            >
              <UserAvatar name={r.user?.name ?? ''} avatarUrl={r.user?.avatarUrl} size={compact ? "xs" : "sm"} />
              <span title={compact ? r.user?.name : undefined} className={compact ? "truncate text-xs font-medium text-blue-800" : "text-xs text-blue-800 font-medium"}>{r.user?.name}</span>
              {r.user?.cargo && <span className="text-xs text-blue-500">({r.user.cargo})</span>}
              <GlassCloseButton type="button" onClick={() => handleToggle(r.userId)} className="ml-1   transition-colors" aria-label={`Remover ${r.user?.name ?? r.userId}`} />
            </div>
          ))}
        </div>
      )}
      <Select
        compact={compact}
        className={compact ? "shrink-0" : undefined}
        ariaLabel={selectLabel}
        value=""
        onChange={v => { if (v) handleToggle(v) }}
        placeholder={compact ? "+ Adicionar" : `${selectLabel}...`}
        options={users
          .filter(u => !responsibles.some(r => r.userId === u.id))
          .map(u => ({ value: u.id, label: u.name, description: u.cargo ?? undefined }))}
      />
    </div>
  )
}
