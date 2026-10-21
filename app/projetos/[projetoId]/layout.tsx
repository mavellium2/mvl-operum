import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { verifySession } from '@/lib/dal'
import { findById } from '@/services/projectAccess'
import { permissoesNoProjeto } from '@/services/authz'
import { ProjectPermissionsProvider } from '@/components/permissoes/ProjectPermissions'
import ProjectSidebar from '@/components/layout/ProjectSidebar'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projetoId: string }>
}): Promise<Metadata> {
  const { projetoId } = await params
  const projeto = await findById(projetoId)
  if (!projeto) return { title: 'Projeto' }
  return {
    title: {
      default: projeto.name,
      template: `%s - ${projeto.name}`,
    },
  }
}

export default async function ProjetoLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ projetoId: string }>
}) {
  const { projetoId } = await params
  const { role, userId, tenantId } = await verifySession()
  const projeto = await findById(projetoId)

  if (!projeto) notFound()

  const permissions = await permissoesNoProjeto(userId, tenantId, role, projetoId)
  const canManageMembers = permissions.has('projeto:equipe')

  return (
    <ProjectPermissionsProvider permissions={[...permissions]}>
    <div className="flex flex-1 overflow-hidden">
      <ProjectSidebar
        projetoId={projetoId}
        canManageMembers={canManageMembers}
        canManageGlobalCatalogs={role === 'admin'}
      />
      <main className="flex-1 min-w-0 h-full overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
    </ProjectPermissionsProvider>
  )
}
