import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { findById } from '@/services/projectAccess'
import { canProjectPermission } from '@/services/projectAccess'
import { getTree, resetTree } from '@/services/wbsService'
import { podeSincronizar, sincronizarEapSprintSePermitido } from '@/services/eapSprintSyncService'
import { statusDaSincronizacao } from '@/services/sincronizacaoStatus'
import StatusSincronizacao from '@/components/sincronizacao/StatusSincronizacao'
import WbsCanvas from '@/components/wbs/WbsCanvas'
import prisma from '@/lib/prisma'
import { valorPorMinutoDoElaborador } from '@/lib/planilhaCustos'
import type { WbsViewMode } from '@/types/wbs'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'EAP / WBS' }

export default async function WbsPage({
  params, searchParams,
}: {
  params: Promise<{ projetoId: string }>
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const { projetoId } = await params
  const { userId, tenantId, role } = await verifySession()

  const projeto = await findById(projetoId)
  if (!projeto) notFound()

  const canEdit = (await canProjectPermission({ tenantId, role, userId }, projetoId, 'projeto:editar')) && (await canProjectPermission({ tenantId, role, userId }, projetoId, 'planilha:orcado')) && (await canProjectPermission({ tenantId, role, userId }, projetoId, 'planilha:realizado-todos'))
  const canViewCosts = await canProjectPermission({ tenantId, role, userId }, projetoId, 'planilha:ver')
  const members = await prisma.userProject.findMany({
    where: { projectId: projetoId, active: true, user: { tenantId, isActive: true, deletedAt: null } },
    select: { userId: true, user: { select: { name: true } }, ...(canViewCosts ? { remuneracao: true, horasDiarias: true } : {}) },
  })
  const owners = Object.fromEntries(members.map(m => [m.userId, m.user.name]))
  const rates = canViewCosts ? Object.fromEntries(members.map(m => [m.userId, valorPorMinutoDoElaborador({ userId: m.userId, name: m.user.name, remuneracao: m.remuneracao ?? null, horasDiarias: m.horasDiarias ?? null })])) : {}
  const requested = (await searchParams).view
  const initialView: WbsViewMode = requested === 'details' || requested === 'gantt' || (requested === 'costs' && canViewCosts) ? requested : 'chart'
  await sincronizarEapSprintSePermitido({ userId, tenantId, role }, projetoId)
  const [statusSync, sincroniza] = await Promise.all([statusDaSincronizacao(projetoId, tenantId), podeSincronizar({ userId, tenantId, role }, projetoId)])
  let initialTree = await getTree(projetoId, tenantId)

  // Auto-initialize on first access
  if (!initialTree.rootId && canEdit) {
    await resetTree({ projectId: projetoId, tenantId, rootTitle: projeto.name }, userId)
    initialTree = await getTree(projetoId, tenantId)
  }

  return (
    <>
    <StatusSincronizacao projectId={projetoId} inicial={statusSync} podeSincronizar={sincroniza} flutuante />
    <WbsCanvas
      projetoId={projetoId}
      tenantId={tenantId}
      userId={userId}
      canEdit={canEdit}
      initialTree={initialTree}
      initialView={initialView}
      canViewCosts={canViewCosts}
      rates={rates}
      owners={owners}
      today={new Date().toISOString().slice(0, 10)}
    />
    </>
  )
}
