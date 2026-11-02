import { listAllUsers } from '@/services/adminService'
import AdminUsersClient from '@/components/admin/AdminUsersClient'
import { verifySession } from '@/lib/dal'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import type { Metadata } from 'next'
import './users.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Usuários' }
export default async function AdminUsersPage() {
  const { tenantId } = await verifySession()
  const users = await listAllUsers(tenantId)
  return <ProjectAppearance enabled><div className="admin-users-page"><AdminUsersClient initialUsers={users} /></div></ProjectAppearance>
}
