'use client'

import Select from '@/components/ui/Select'
import { useState } from 'react'
import { UserX } from 'lucide-react'
import Modal from '@/components/ui/Modal'

export interface CardPendente {
  id: string
  title: string
  coluna: string
  /** 'sem': nenhum responsável; 'inativo': só responsáveis inativos no projeto. */
  motivo: 'sem' | 'inativo'
}

interface Props {
  pendentes: CardPendente[]
  users: { id: string; name: string }[]
  onAtribuir: (cardId: string, userId: string) => Promise<{ error?: string } | void>
  onAbrirCard: (cardId: string) => void
}

/**
 * Aviso ao gerente (e a quem pode editar cards): cards em "Em andamento" ou depois
 * sem responsável ativo, com atribuição rápida (ADR-045). Some quando não há nenhum.
 */
export default function CardsSemResponsavel({ pendentes, users, onAtribuir, onAbrirCard }: Props) {
  const [aberto, setAberto] = useState(false)
  const [escolha, setEscolha] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<Record<string, string>>({})

  if (pendentes.length === 0) return null

  async function atribuir(cardId: string) {
    const userId = escolha[cardId]
    if (!userId) return
    setSalvando(cardId)
    const r = await onAtribuir(cardId, userId)
    setSalvando(null)
    if (r && r.error) setErro(prev => ({ ...prev, [cardId]: r.error! }))
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mx-6 mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-100"
      >
        <UserX className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong>{pendentes.length} {pendentes.length === 1 ? 'card está' : 'cards estão'} sem responsável ativo</strong>{' '}
          em &quot;Em andamento&quot; ou depois. Defina quem é o responsável.
        </span>
      </button>

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title="Cards sem responsável">
        <p className="mb-3 text-sm text-gray-600">
          A partir de &quot;Em andamento&quot;, todo card precisa de um responsável ativo. Escolha alguém para cada card abaixo.
        </p>
        <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
          {pendentes.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => { setAberto(false); onAbrirCard(c.id) }} className="block truncate text-left text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline">
                  {c.title}
                </button>
                <span className="text-xs text-gray-500">
                  {c.coluna} · {c.motivo === 'sem' ? 'sem responsável' : 'responsável inativo'}
                </span>
                {erro[c.id] && <p role="alert" className="text-xs text-red-600">{erro[c.id]}</p>}
              </div>
              <Select
                ariaLabel={`Responsável para ${c.title}`}
                className="w-56"
                value={escolha[c.id] ?? ''}
                onChange={v => setEscolha(prev => ({ ...prev, [c.id]: v }))}
                placeholder="Escolher…"
                options={users.map(u => ({ value: u.id, label: u.name }))}
              />
              <button
                type="button"
                disabled={!escolha[c.id] || salvando === c.id}
                onClick={() => atribuir(c.id)}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {salvando === c.id ? 'Salvando…' : 'Atribuir'}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  )
}
