'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import KPICard from './KPICard'
import UserAvatar from '@/components/user/UserAvatar'
import OverdueCardsList from './OverdueCardsList'
import { updateSprintMetaAction } from '@/app/actions/sprintBoard'
import { sprintPath } from '@/lib/sprintPath'

interface Sprint {
  id: string
  name: string
  status: string
  startDate: Date | string | null
  endDate: Date | string | null
  qualidade: number | null
  dificuldade: number | null
  projectId?: string | null
}

interface SprintMetrics {
  horasTotais: number
  custoTotal: number
  cardsTotal: number
  cardsConcluidos: number
  cardsAtrasados: number
}

interface UserMetric {
  id: string
  name: string
  cargo: string | null
  avatarUrl: string | null
  horas: number
  custo: number
}

interface CardsByColumn {
  name: string
  count: number
}

interface Feedback {
  id: string
  userName: string
  avatarUrl: string | null
  qualidade: number
  dificuldade: number
  tarefasRealizadas: string | null
  dificuldades: string | null
}

interface SprintDashboardProps {
  sprint: Sprint
  metrics: SprintMetrics
  userMetrics?: UserMetric[]
  cardsByColumn?: CardsByColumn[]
  overdueCards?: { id: string; title: string; color: string; endDate: Date | string | null; sprint: { id: string; name: string } | null; sprintColumn: { title: string } | null; responsibles: { user: { id: string; name: string; avatarUrl: string | null } }[] }[]
  feedbacks?: Feedback[]
  avgQualidade?: number | null
  avgDificuldade?: number | null
}

function formatDate(date: Date | string | null) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}min`
  return `${h.toFixed(1)}h`
}

const statusLabel: Record<string, string> = {
  PLANNED: 'Planejada',
  ACTIVE: 'Ativa',
  COMPLETED: 'Concluída',
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function SprintDashboard({
  sprint: initialSprint,
  metrics,
  userMetrics = [],
  cardsByColumn = [],
  overdueCards = [],
  feedbacks = [],
  avgQualidade,
  avgDificuldade,
}: SprintDashboardProps) {
  const [sprint, setSprint] = useState(initialSprint)
  const [qualidade, setQualidade] = useState(sprint.qualidade?.toString() ?? '')
  const [dificuldade, setDificuldade] = useState(sprint.dificuldade?.toString() ?? '')
  const [isPending, startTransition] = useTransition()

  const conclusaoPercent = metrics.cardsTotal > 0
    ? Math.round((metrics.cardsConcluidos / metrics.cardsTotal) * 100)
    : 0

  function handleSaveMeta() {
    startTransition(async () => {
      const result = await updateSprintMetaAction(sprint.id, {
        qualidade: qualidade ? Number(qualidade) : undefined,
        dificuldade: dificuldade ? Number(dificuldade) : undefined,
      })
      if ('sprint' in result && result.sprint) {
        setSprint(s => ({ ...s, qualidade: result.sprint.qualidade ?? null, dificuldade: result.sprint.dificuldade ?? null }))
      }
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/projetos" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-bold text-gray-900">{sprint.name}</h1>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              sprint.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
              sprint.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {statusLabel[sprint.status] ?? sprint.status}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-500">
              {formatDate(sprint.startDate)} — {formatDate(sprint.endDate)}
            </p>
            <Link
              href={sprintPath(sprint.id, sprint.projectId)}
              className="text-sm text-blue-600 hover:underline"
            >
              Abrir Board →
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Cards" value={metrics.cardsTotal} color="blue" />
          <KPICard label="Concluídos" value={`${conclusaoPercent}%`} color="green" sub={`${metrics.cardsConcluidos} de ${metrics.cardsTotal}`} />
          <KPICard label="Horas" value={formatHours(metrics.horasTotais)} color="purple" />
          <KPICard label="Custo" value={formatCurrency(metrics.custoTotal)} color="amber" sub="baseado em valor/hora" />
        </div>

        {/* Alerts */}
        {overdueCards.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium text-amber-800">{overdueCards.length} card{overdueCards.length !== 1 ? 's' : ''} atrasados</span>
            </div>
            <OverdueCardsList cards={overdueCards} />
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cards by column (pie) */}
          {cardsByColumn.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Cards por Coluna</h2>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={cardsByColumn}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {cardsByColumn.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Hours by user (bar) */}
          {userMetrics.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Horas por Usuário</h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={userMetrics} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(value) => [`${Number(value).toFixed(1)}h`, 'Horas']}
                  />
                  <Bar dataKey="horas" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* User ranking table */}
        {userMetrics.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Ranking de Membros</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left font-medium text-gray-500 pb-2">#</th>
                  <th className="text-left font-medium text-gray-500 pb-2">Usuário</th>
                  <th className="text-right font-medium text-gray-500 pb-2">Horas</th>
                  <th className="text-right font-medium text-gray-500 pb-2">Custo</th>
                </tr>
              </thead>
              <tbody>
                {userMetrics.map((u, i) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 text-gray-400 font-medium w-8">{i + 1}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <UserAvatar name={u.name} avatarUrl={u.avatarUrl} size="sm" />
                        <div>
                          <p className="font-medium text-gray-900">{u.name}</p>
                          {u.cargo && <p className="text-xs text-gray-400">{u.cargo}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-gray-700">{formatHours(u.horas)}</td>
                    <td className="py-2.5 text-right tabular-nums text-green-700 font-medium">{formatCurrency(u.custo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sprint Feedback */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Feedback da Sprint</h2>
            {avgQualidade != null && avgDificuldade != null && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Qualidade: <strong className="text-green-600">{avgQualidade.toFixed(1)}</strong>/5</span>
                <span className="text-gray-500">Dificuldade: <strong className="text-amber-600">{avgDificuldade.toFixed(1)}</strong>/5</span>
              </div>
            )}
          </div>

          {feedbacks.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Nenhum feedback registrado para esta sprint</p>
          ) : (
            <div className="space-y-3">
              {feedbacks.map(fb => (
                <div key={fb.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <UserAvatar name={fb.userName} avatarUrl={fb.avatarUrl} size="sm" />
                    <p className="text-sm font-medium text-gray-900">{fb.userName}</p>
                    <div className="flex items-center gap-2 ml-auto text-xs">
                      <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded-full">Qualidade: {fb.qualidade}</span>
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full">Dificuldade: {fb.dificuldade}</span>
                    </div>
                  </div>
                  {fb.tarefasRealizadas && (
                    <p className="text-sm text-gray-600 mb-1"><strong className="text-gray-700">Tarefas:</strong> {fb.tarefasRealizadas}</p>
                  )}
                  {fb.dificuldades && (
                    <p className="text-sm text-gray-600"><strong className="text-gray-700">Dificuldades:</strong> {fb.dificuldades}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Avaliação da Sprint (legacy form) */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Avaliação da Sprint</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="qualidade" className="block text-xs font-medium text-gray-600 mb-1">Qualidade (0–10)</label>
              <OperumInput
                id="qualidade"
                type="number"
                min={0}
                max={10}
                value={qualidade}
                onChange={e => setQualidade(e.target.value)}
                placeholder="0-10"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="dificuldade" className="block text-xs font-medium text-gray-600 mb-1">Dificuldade (0–10)</label>
              <OperumInput
                id="dificuldade"
                type="number"
                min={0}
                max={10}
                value={dificuldade}
                onChange={e => setDificuldade(e.target.value)}
                placeholder="0-10"
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <FormActions as="span" compact><OperumButton variant="primary" type="button"
            onClick={handleSaveMeta}
            disabled={isPending}
            className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Salvando…' : 'Salvar avaliação'}
          </OperumButton></FormActions>
        </div>
      </main>
    </div>
  )
}
