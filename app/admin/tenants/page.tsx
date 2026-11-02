import { verifySession } from '@/lib/dal'
import { listTenants } from '@/services/tenantService'
import { getMyTenantsAction } from '@/app/actions/auth'
import AdminTenantsClient from '@/components/admin/AdminTenantsClient'
import { redirect } from 'next/navigation'
import { ehOperadorDaPlataforma } from '@/lib/platformOperator'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import './tenants.css'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Instituições da plataforma' }

export default async function AdminTenantsPage() {
  const { userId, tenantId } = await verifySession()

  // Instituições é do operador da plataforma (ADR-060), não do admin de uma instituição.
  if (!(await ehOperadorDaPlataforma(userId))) {
    redirect('/projetos')
  }

  const [tenants, myTenants] = await Promise.all([
    listTenants(userId),
    getMyTenantsAction(),
  ])
  
  const myTenantIds = myTenants.map(t => t.tenantId)

  return <ProjectAppearance enabled>
    <div className="platform-tenants mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <AdminTenantsClient currentTenantId={tenantId} initialTenants={tenants as Parameters<typeof AdminTenantsClient>[0]['initialTenants']} myTenantIds={myTenantIds} />
    </div>
  </ProjectAppearance>
}
