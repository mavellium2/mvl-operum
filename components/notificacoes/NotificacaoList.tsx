'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { markNotificacaoAsReadAction, markAllAsReadAction, archiveNotificacaoAction } from '@/app/actions/notificacoes'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  reference: string | null
  referenceType: string | null
  status: string
  createdAt: string
  readAt: string | null
}

interface Props {
  initialNotificacoes: Notification[]
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  COMMENT: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  ASSIGNMENT: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  UPDATE: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  COMPLETION: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  MENTIONED: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
    </svg>
  ),
  INVITATION: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
}

const TYPE_COLORS: Record<string, string> = {
  COMMENT:    'bg-blue-100 text-blue-600',
  ASSIGNMENT: 'bg-purple-100 text-purple-600',
  UPDATE:     'bg-amber-100 text-amber-600',
  COMPLETION: 'bg-green-100 text-green-600',
  MENTIONED:  'bg-pink-100 text-pink-600',
  INVITATION: 'bg-indigo-100 text-indigo-600',
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR')
}

// O campo `reference` é usado como href do link "Ver". Só aceita rotas do
// próprio app (/...): nunca "//host" nem "/\host", que o navegador trata como
// outro site, nem caracteres de controle (o parser de URL descarta tab/CR/LF).
// Referências antigas que guardavam IDs crus não geram link quebrado.
const SAFE_REFERENCE_RE = /^\/(?![/\\])[^\u0000-\u001F\u007F\\]*$/
export function isSafeReference(ref: string) {
  return SAFE_REFERENCE_RE.test(ref)
}

export default function NotificacaoList({ initialNotificacoes }: Props) {
  const [notifications, setNotifications] = useState(initialNotificacoes)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [isPending, startTransition] = useTransition()

  const filtered = notifications.filter(n => {
    if (filterStatus && n.status !== filterStatus) return false
    if (filterType && n.type !== filterType) return false
    return true
  })

  const unreadCount = notifications.filter(n => n.status === 'UNREAD').length

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificacaoAsReadAction(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'READ', readAt: new Date().toISOString() } : n))
    })
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      await archiveNotificacaoAction(id)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'ARCHIVED' } : n))
    })
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllAsReadAction()
      const now = new Date().toISOString()
      setNotifications(prev => prev.map(n => n.status === 'UNREAD' ? { ...n, status: 'READ', readAt: now } : n))
    })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os status</option>
          <option value="UNREAD">Não lidas</option>
          <option value="READ">Lidas</option>
          <option value="ARCHIVED">Arquivadas</option>
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os tipos</option>
          <option value="COMMENT">Comentário</option>
          <option value="ASSIGNMENT">Atribuição</option>
          <option value="UPDATE">Atualização</option>
          <option value="COMPLETION">Conclusão</option>
          <option value="MENTIONED">Mencionado</option>
          <option value="INVITATION">Convite</option>
        </select>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={isPending}
            className="sm:ml-auto px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 disabled:opacity-50"
          >
            Marcar todas como lidas
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500">
        {filtered.length} notificaç{filtered.length !== 1 ? 'ões' : 'ão'}
        {(filterStatus || filterType) ? ' (filtrado)' : ''}
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-gray-400 text-sm">Nenhuma notificação encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const icon = TYPE_ICONS[n.type]
            const color = TYPE_COLORS[n.type] ?? 'bg-gray-100 text-gray-600'
            const isUnread = n.status === 'UNREAD'
            const link = n.reference && isSafeReference(n.reference) ? n.reference : null

            // Corpo da notificação (ícone + título + mensagem). Com link, o
            // corpo inteiro vira um <Link> para levar direto à tarefa no board.
            const content = (
              <>
                <div className={`p-2 rounded-xl shrink-0 ${color}`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm font-medium group-hover:text-blue-600 ${isUnread ? 'text-gray-900' : 'text-gray-700'}`}>
                      {n.title}
                    </p>
                    <span className="text-xs text-gray-400 shrink-0">{formatRelativeTime(n.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 group-hover:text-gray-700">{n.message}</p>
                </div>
              </>
            )

            return (
              <div
                key={n.id}
                className={`bg-white rounded-2xl border p-4 transition-all ${isUnread ? 'border-blue-100 bg-blue-50/30' : 'border-gray-100'}`}
              >
                <div className="flex items-start gap-3">
                  {link ? (
                    <Link href={link} className="flex items-start gap-3 flex-1 min-w-0 rounded-lg group hover:bg-gray-50">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {content}
                    </div>
                  )}
                  {isUnread && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {isUnread && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      disabled={isPending}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                    >
                      Marcar como lida
                    </button>
                  )}
                  {n.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => handleArchive(n.id)}
                      disabled={isPending}
                      className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    >
                      Arquivar
                    </button>
                  )}
                  {link && (
                    <Link href={link} className="text-xs text-blue-600 hover:underline ml-auto">
                      Ver →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
