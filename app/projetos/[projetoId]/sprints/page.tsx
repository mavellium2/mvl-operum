import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { findById } from '@/services/projectAccess'
import { canProjectPermission } from '@/services/projectAccess'
import { findAllByProjeto } from '@/services/sprintService'
import { planilhaDoProjeto } from '@/services/planilhaService'
import { getTree } from '@/services/wbsService'
import { getSprintMetrics } from '@/services/dashboardService'
import EmptyState from '@/components/ui/EmptyState'
import DeleteSprintButton from '@/components/sprint/DeleteSprintButton'
import HistoricoSprints from '@/components/sprint/HistoricoSprints'
import { historicoDasSprints } from '@/services/sprintHistoricoService'
import Link from 'next/link'
import type { Metadata } from 'next'
import { sprintPath } from '@/lib/sprintPath'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Sprints' }

const SPRINT_STATUS: Record<string, { label: string; cls: string }> = {
  PLANNED:   { label: 'Planejada',  cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  ACTIVE:    { label: 'Ativa',      cls: 'bg-green-50 text-green-700 border-green-200' },
  COMPLETED: { label: 'Concluída',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
}

// Funções utilitárias de formatação importadas do seu design favorito
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

// Barra de progresso atualizada com o design premium
function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-9 text-right">{pct}%</span>
    </div>
  )
}

export default async function ProjetoSprintsPage({
  params,
}: {
  params: Promise<{ projetoId: string }>
}) {
  const { projetoId } = await params
  const { role, userId, tenantId } = await verifySession()
  if (!(await canProjectPermission({ tenantId, role, userId }, projetoId, 'quadro:ver'))) notFound()
  const canEdit = await canProjectPermission({ tenantId, role, userId }, projetoId, 'quadro:sprints')

  const [projeto, sprints, historico] = await Promise.all([
    findById(projetoId),
    findAllByProjeto(projetoId),
    historicoDasSprints(tenantId, projetoId).catch(() => []),
  ])

  if (!projeto) notFound()

  const canViewSheet = await canProjectPermission({ tenantId, role, userId }, projetoId, 'planilha:ver')
  const [planilha, tree] = canViewSheet ? await Promise.all([planilhaDoProjeto(projetoId, tenantId), getTree(projetoId, tenantId)]) : [null, null]
  const porSprint = new Map(planilha?.macrofases.flatMap(f => {
    const id = tree?.nodes[f.nodeId]?.properties.sprintId
    return id ? [[id, f] as const] : []
  }) ?? [])
  const sprintsWithMetrics = await Promise.all(
    sprints.map(async s => ({ sprint: s, metrics: await getSprintMetrics(s.id), linhaPlanilha: porSprint.get(s.id) }))
  )

  return (
    // Fundo com gradiente suave igual ao do seu primeiro código
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">
      <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sprints</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Projeto: {projeto.name} • {sprintsWithMetrics.length} sprint{sprintsWithMetrics.length !== 1 ? 's' : ''}
            </p>
          </div>
          {canEdit && (
            <Link
              href={`/projetos/${projetoId}/sprints/nova`}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nova Sprint
            </Link>
          )}
        </div>

        {sprintsWithMetrics.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <EmptyState
              heading="Nenhuma sprint neste projeto"
              subtext="Crie a primeira sprint para começar a organizar o trabalho"
              size="md"
              action={canEdit ? { label: 'Criar sprint', href: `/projetos/${projetoId}/sprints/nova` } : undefined}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sprintsWithMetrics.map(({ sprint, metrics, linhaPlanilha }) => {
              const sc = SPRINT_STATUS[sprint.status] ?? SPRINT_STATUS.PLANNED
              const pct = metrics.cardsTotal > 0
                ? Math.round((metrics.cardsConcluidos / metrics.cardsTotal) * 100)
                : 0

              return (
                <div
                  key={sprint.id}
                  className="group/sprint relative bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all"
                >
                  <Link href={sprintPath(sprint.id, projetoId)} className="block p-5">
                  {/* Topo do Card: Título, Status e Datas */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-bold text-gray-900 text-lg leading-tight group-hover/sprint:text-blue-700 transition-colors truncate">
                          {sprint.name}
                        </h2>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${sc.cls}`}>
                          {sc.label}
                        </span>
                      </div>
                      {(sprint.startDate || sprint.endDate) && (
                        <p className="text-xs text-gray-400">
                          {formatDate(sprint.startDate) ?? '—'} → {formatDate(sprint.endDate) ?? '—'}
                        </p>
                      )}
                    </div>
                    {/* Ícone de seta que aparece no hover */}
                    <svg className="w-5 h-5 text-gray-300 group-hover/sprint:text-blue-400 transition-colors shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Barra de Progresso */}
                  {metrics.cardsTotal > 0 && (
                    <div className="mb-3">
                      <ProgressBar value={metrics.cardsConcluidos} total={metrics.cardsTotal} />
                    </div>
                  )}

                  {/* Grid de Métricas (Cards, Progresso, Horas, Custo) */}
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
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Horas registradas</p>
                      <p className="text-sm font-semibold text-gray-800">{formatHours(metrics.horasTotais)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Custo registrado</p>
                      <p className="text-sm font-semibold text-gray-800">{formatCurrency(metrics.custoTotal)}</p>
                    </div>
                  </div>

                  {linhaPlanilha && <div className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600">
                    <p className="mb-1 font-semibold text-gray-800">Planilha de Custos</p>
                    <p>Orçado: {formatHours(linhaPlanilha.minOrcado / 60)} · {formatCurrency(linhaPlanilha.totalOrcado)}</p>
                    <p>Realizado: {formatHours(linhaPlanilha.minReal / 60)} · {formatCurrency(linhaPlanilha.totalReal)}</p>
                  </div>}

                  {/* Rodapé: Qualidade, Dificuldade e Alertas de Atraso */}
                  {('qualidade' in sprint || 'dificuldade' in sprint || metrics.cardsAtrasados > 0) && (
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
                  {canEdit && (
                    <div className="absolute top-3.5 right-12">
                      <DeleteSprintButton sprintId={sprint.id} sprintName={sprint.name} projectId={projetoId} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <HistoricoSprints eventos={historico} />
      </main>
    </div>
  )
}