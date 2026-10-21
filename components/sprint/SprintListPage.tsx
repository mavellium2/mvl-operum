'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { SprintBadge } from './SprintBadge'
import { SprintManager } from './SprintManager'
import { logoutAction } from '@/app/actions/auth'
import GlobalSearch from '@/components/search/GlobalSearch'
import BoardActionMenu from '@/components/board/BoardActionMenu'
import UserAvatar from '@/components/user/UserAvatar'
import Modal from '@/components/ui/Modal'
import { CsvImportModal } from '@/components/csv/CsvImportModal'
import { TagManager } from '@/components/tag/TagManager'
import { sprintPath } from '@/lib/sprintPath'
import { progressoSprint } from '@/lib/sprintProgresso'

interface Sprint {
  id: string
  name: string
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED'
  startDate: Date | string | null | undefined
  endDate: Date | string | null | undefined
  qualidade: number | null | undefined
  dificuldade: number | null | undefined
  projectId?: string | null
}

interface SprintMetrics {
  horasTotais: number
  custoTotal: number
  cardsTotal: number
  cardsConcluidos: number
  cardsAtrasados: number
}

interface SprintWithMetrics {
  sprint: Sprint
  metrics: SprintMetrics
}

interface CurrentUser {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
}

interface Tag {
  id: string
  name: string
  color: string
}

interface SprintListPageProps {
  sprintsWithMetrics: SprintWithMetrics[]
  currentUser?: CurrentUser | null
  tags?: Tag[]
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return null
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatHours(h: number) {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}h ${mm.toString().padStart(2, '0')}m`
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ProgressBar({ pct, barStyle }: { pct: number; barStyle: { width: string; background: string } }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cards concluídos">
        <div className="h-full rounded-full transition-all" style={barStyle} />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-9 text-right">{pct}%</span>
    </div>
  )
}

export default function SprintListPage({
  sprintsWithMetrics: initial,
  currentUser,
  tags = [],
}: SprintListPageProps) {
  const [sprintsWithMetrics, setSprintsWithMetrics] = useState(initial)
  const [showCreate, setShowCreate] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Pick the first sprint id to use for CSV import (or empty if none)
  const firstSprintId = sprintsWithMetrics[0]?.sprint.id ?? ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">

      <header className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <span className="text-xl font-bold text-gray-900">Sprints</span>
        </div>

        <div className="flex items-center gap-2">
          <GlobalSearch />

          {currentUser && (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-gray-100 transition-colors"
                aria-label="Menu do usuário"
              >
                <UserAvatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} size="sm" />
                <span className="text-sm text-gray-600 hidden sm:block">{currentUser.name}</span>
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20">
                  <Link
                    href="/perfil"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Meu Perfil
                  </Link>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <div className="border-t border-gray-100 my-1" />
                  <form action={logoutAction}>
                    <button
                      type="submit"
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Sair
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}

          <BoardActionMenu
            onImportCsv={() => setCsvOpen(true)}
            onCreateSprint={() => setShowCreate(true)}
            onManageTags={() => setTagOpen(true)}
          />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 pb-24">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sprints</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {sprintsWithMetrics.length} sprint{sprintsWithMetrics.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Sprint
          </button>
        </div>

        {showCreate && (
          <div className="mb-4 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <SprintManager
              sprints={sprintsWithMetrics.map(i => i.sprint)}
              onSprintCreated={(sprint) => {
                setSprintsWithMetrics(prev => [...prev, {
                  sprint: {
                    ...sprint,
                    startDate: sprint.startDate ?? null,
                    endDate: sprint.endDate ?? null,
                    qualidade: null,
                    dificuldade: null,
                  },
                  metrics: { horasTotais: 0, custoTotal: 0, cardsTotal: 0, cardsConcluidos: 0, cardsAtrasados: 0 },
                }])
                setShowCreate(false)
              }}
            />
            <button onClick={() => setShowCreate(false)} className="mt-3 text-xs text-gray-400 hover:text-gray-600">
              Cancelar
            </button>
          </div>
        )}

        {sprintsWithMetrics.length === 0 && !showCreate ? (
          <div className="text-center py-20">
            <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-gray-400 text-sm">Nenhuma sprint criada ainda</p>
            <button onClick={() => setShowCreate(true)} className="mt-2 text-blue-600 text-sm hover:underline">
              Criar a primeira sprint
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sprintsWithMetrics.map(({ sprint, metrics }) => {
              const progresso = progressoSprint(sprint.status, metrics.cardsConcluidos, metrics.cardsTotal)
              const pct = progresso.pct

              return (
                <Link
                  key={sprint.id}
                  href={sprintPath(sprint.id, sprint.projectId)}
                  className={`block rounded-xl shadow-sm border p-5 hover:shadow-md transition-all group ${progresso.concluida ? 'hover:border-green-300' : 'border-gray-100 hover:border-blue-200'}`}
                  style={progresso.cardStyle}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-blue-700 transition-colors truncate">
                          {sprint.name}
                        </h2>
                        <SprintBadge name="" status={sprint.status} />
                      </div>
                      {(sprint.startDate || sprint.endDate) && (
                        <p className="text-xs text-gray-400">
                          {formatDate(sprint.startDate) ?? '—'} → {formatDate(sprint.endDate) ?? '—'}
                        </p>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-400 transition-colors shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {metrics.cardsTotal > 0 && (
                    <div className="mb-3">
                      <ProgressBar pct={pct} barStyle={progresso.barStyle} />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Cards</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {metrics.cardsConcluidos}/{metrics.cardsTotal}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Progresso</p>
                      <p className="text-sm font-semibold text-gray-800">{pct}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Horas</p>
                      <p className="text-sm font-semibold text-gray-800">{formatHours(metrics.horasTotais)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Custo</p>
                      <p className="text-sm font-semibold text-gray-800">{formatCurrency(metrics.custoTotal)}</p>
                    </div>
                  </div>

                  {(sprint.qualidade != null || sprint.dificuldade != null) && (
                    <div className="flex gap-4 mt-3 pt-3 border-t border-gray-50">
                      {sprint.qualidade != null && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs text-gray-500">Qualidade</span>
                          <span className="text-xs font-bold text-gray-700">{sprint.qualidade}/10</span>
                        </div>
                      )}
                      {sprint.dificuldade != null && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-xs text-gray-500">Dificuldade</span>
                          <span className="text-xs font-bold text-gray-700">{sprint.dificuldade}/10</span>
                        </div>
                      )}
                      {metrics.cardsAtrasados > 0 && (
                        <div className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs text-red-600 font-medium">{metrics.cardsAtrasados} atrasado{metrics.cardsAtrasados !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {firstSprintId && (
        <CsvImportModal
          isOpen={csvOpen}
          onClose={() => setCsvOpen(false)}
          sprintId={firstSprintId}
        />
      )}

      <Modal isOpen={tagOpen} onClose={() => setTagOpen(false)} title="Tags">
        <TagManager tags={tags} />
      </Modal>
    </div>
  )
}
