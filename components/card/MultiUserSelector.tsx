'use client'

import Select from '@/components/ui/Select'
import { useState, useEffect } from 'react'
import UserAvatar from '@/components/user/UserAvatar'
import { addResponsibleAction, removeResponsibleAction, getResponsiblesAction } from '@/app/actions/cardResponsible'

interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  cargo?: string | null
}

interface MultiUserSelectorProps {
  cardId: string
  users: User[]
  onResponsiblesChange?: (responsibles: Responsible[]) => void
  /** Modo de criação: ainda não existe card — só seleção local, sem chamadas à API. */
  pending?: boolean
}

interface Responsible {
  userId: string
  user: { id: string; name: string; cargo: string | null; avatarUrl: string | null }
}

export default function MultiUserSelector({ cardId, users, onResponsiblesChange, pending = false }: MultiUserSelectorProps) {
  const [responsibles, setResponsibles] = useState<Responsible[]>([])
  const [loading, setLoading] = useState(!pending)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (pending) return
    getResponsiblesAction(cardId).then(result => {
      if (cancelled) return
      if ('responsibles' in result && result.responsibles) {
        const valid = result.responsibles.filter((r: Responsible) => r.user != null)
        setResponsibles(valid)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [cardId, pending])

  async function handleToggle(userId: string) {
    const isSelected = responsibles.some(r => r.userId === userId)

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
    <div className="space-y-2">
      {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
      {responsibles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {responsibles.filter(r => r.user != null).map(r => (
            <div
              key={r.userId}
              className="flex items-center gap-1.5 bg-blue-50 rounded-full pl-1 pr-2 py-0.5"
            >
              <UserAvatar name={r.user?.name ?? ''} avatarUrl={r.user?.avatarUrl} size="sm" />
              <span className="text-xs text-blue-800 font-medium">{r.user?.name}</span>
              {r.user?.cargo && <span className="text-xs text-blue-500">({r.user.cargo})</span>}
              <button
                onClick={() => handleToggle(r.userId)}
                className="ml-1 text-blue-400 hover:text-red-500 transition-colors"
                aria-label={`Remover ${r.user?.name ?? r.userId}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <Select
        ariaLabel="Adicionar responsável"
        value=""
        onChange={v => { if (v) handleToggle(v) }}
        placeholder="Adicionar responsável..."
        options={users
          .filter(u => !responsibles.some(r => r.userId === u.id))
          .map(u => ({ value: u.id, label: u.name, description: u.cargo ?? undefined }))}
      />
    </div>
  )
}
