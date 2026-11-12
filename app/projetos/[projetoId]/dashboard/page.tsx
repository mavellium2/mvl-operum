import { verifySession } from '@/lib/dal'
import { canProjectPermission } from '@/services/projectAccess'
import { notFound } from 'next/navigation'
import { findById } from '@/services/projectAccess'
import { findAllByProjeto } from '@/services/sprintService'
import { getSprintMetrics } from '@/services/dashboardService'
import prisma from '@/lib/prisma'
import { FUNCOES_ORDENADAS, nomesDasFuncoes } from '@/services/funcoesDaPessoa'
import KPICard from '@/components/dashboard/KPICard'
import SprintCostChart from '@/components/dashboard/SprintCostChart'
import UserHoursChart from '@/components/dashboard/UserHoursChart'
import UserRankingTable from '@/components/dashboard/UserRankingTable'
import { cargoNoProjeto } from '@/lib/cargos'
import OverdueCardsList from '@/components/dashboard/OverdueCardsList'
import Link from 'next/link'
import type { Metadata } from 'next'
import { sprintPath } from '@/lib/sprintPath'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Dashboard' }

function formatHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}min`
  return `${h.toFixed(1)}h`
}

function formatCurrency(v: number) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function getProjetoDashboardData(projetoId: string) {
  const [projeto, sprints] = await Promise.all([
    findById(projetoId),
    findAllByProjeto(projetoId),
  ])

  if (!projeto) return null

  const sprintMetricsRaw = await Promise.all(sprints.map(s => getSprintMetrics(s.id)))

  const sprintMetrics = sprints.map((sprint, i) => ({
    id: sprint.id,
    name: sprint.name,
    status: sprint.status,
    ...sprintMetricsRaw[i],
  }))

  const totalHoras = sprintMetrics.reduce((sum, s) => sum + s.horasTotais, 0)
  const totalCusto = sprintMetrics.reduce((sum, s) => sum + s.custoTotal, 0)
  const totalCards = sprintMetrics.reduce((sum, s) => sum + s.cardsTotal, 0)
  const totalConcluidos = sprintMetrics.reduce((sum, s) => sum + s.cardsConcluidos, 0)
  const totalAtrasados = sprintMetrics.reduce((sum, s) => sum + s.cardsAtrasados, 0)

  // User metrics for this project
  const membros = await prisma.userProject.findMany({
    where: { projectId: projetoId, active: true },
    include: { user: { select: { id: true, name: true, cargo: true, avatarUrl: true, hourlyRate: true } }, funcoes: FUNCOES_ORDENADAS },
  })

  const userMetrics = await Promise.all(
    membros.map(async m => {
      const entries = await prisma.timeEntry.findMany({
        where: {
          userId: m.userId,
          card: { sprintId: { in: sprints.map(s => s.id) }, deletedAt: null },
          deletedAt: null,
        },
        select: { duration: true },
      })
      const horasTotais = entries.reduce((sum, e) => sum + e.duration / 3600, 0)
      const custoTotal = horasTotais * m.user.hourlyRate
      return {
        id: m.userId,
        name: m.user.name,
        // Função no projeto (a mesma de Stakeholders); o cargo global do
        // usuário quase nunca é preenchido e fica só como fallback.
        cargo: cargoNoProjeto(nomesDasFuncoes(m.funcoes), m.user.cargo),
        avatarUrl: m.user.avatarUrl,
        horasTotais,
        custoTotal,
      }
    }),
  )

  const now = new Date()
  const overdueCards = await prisma.card.findMany({
    where: {
      sprintId: { in: sprints.map(s => s.id) },
      endDate: { lt: now },
      deletedAt: null,
    },
    include: {
      sprint: { select: { id: true, name: true } },
      sprintColumn: { select: { title: true } },
      responsibles: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
    },
    orderBy: { endDate: 'asc' },
    take: 20,
  })
  const overdueFiltered = overdueCards.filter(c => !/conclu/i.test(c.sprintColumn?.title ?? ''))

  return {
    projeto,
    sprintMetrics,
    totalHoras,
    totalCusto,
    totalCards,
    totalConcluidos,
    totalAtrasados,
    userMetrics,
    overdueFiltered,
  }
}

export default async function ProjetoDashboardPage({ params }: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await params
  if (!(await canProjectPermission(await verifySession(), projetoId, 'quadro:ver'))) notFound()
  const data = await getProjetoDashboardData(projetoId)

  if (!data) notFound()

  const { sprintMetrics, totalHoras, totalCusto, totalCards, totalConcluidos, totalAtrasados, userMetrics, overdueFiltered } = data
  const percentConcluidos = totalCards > 0 ? Math.round((totalConcluidos / totalCards) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Sprints" value={sprintMetrics.length} color="blue" />
          <KPICard label="Cards" value={totalCards} color="purple" sub={`${percentConcluidos}% concluídos`} />
          <KPICard label="Horas" value={formatHours(totalHoras)} color="amber" />
          <KPICard label="Custo total" value={formatCurrency(totalCusto)} color="green" sub="baseado em valor/hora" />
        </div>

        {/* Alerts */}
        {(totalAtrasados > 0 || overdueFiltered.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium text-amber-800">{overdueFiltered.length} card{overdueFiltered.length !== 1 ? 's' : ''} com prazo vencido</span>
            </div>
            {overdueFiltered.length > 0 && <OverdueCardsList cards={overdueFiltered.slice(0, 5)} />}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Custo por Sprint</h2>
            <SprintCostChart data={sprintMetrics} />
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Horas por Membro</h2>
            <UserHoursChart data={userMetrics} />
          </div>
        </div>

        {/* Sprint summary table */}
        {sprintMetrics.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Resumo por Sprint</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left font-medium text-gray-500 pb-2">Sprint</th>
                    <th className="text-center font-medium text-gray-500 pb-2">Status</th>
                    <th className="text-right font-medium text-gray-500 pb-2">Cards</th>
                    <th className="text-right font-medium text-gray-500 pb-2">Concluídos</th>
                    <th className="text-right font-medium text-gray-500 pb-2">Horas</th>
                    <th className="text-right font-medium text-gray-500 pb-2">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {sprintMetrics.map(s => {
                    const pct = s.cardsTotal > 0 ? Math.round((s.cardsConcluidos / s.cardsTotal) * 100) : 0
                    return (
                      <tr key={s.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5">
                          <Link href={sprintPath(s.id, projetoId)} className="font-medium text-gray-900 hover:text-blue-600">
                            {s.name}
                          </Link>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                            s.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {s.status === 'ACTIVE' ? 'Ativa' : s.status === 'COMPLETED' ? 'Concluída' : 'Planejada'}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-gray-600">{s.cardsTotal}</td>
                        <td className="py-2.5 text-right text-green-600">{s.cardsConcluidos} ({pct}%)</td>
                        <td className="py-2.5 text-right text-gray-600">{formatHours(s.horasTotais)}</td>
                        <td className="py-2.5 text-right font-medium text-green-700">{formatCurrency(s.custoTotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* User ranking */}
        {userMetrics.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Ranking de Membros</h2>
            <UserRankingTable users={userMetrics} />
          </div>
        )}
      </main>
    </div>
  )
}
