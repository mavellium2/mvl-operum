import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { canProjectPermission } from '@/services/projectAccess'
import ProjetoFormPage from '@/components/projetos/ProjetoFormPage'

export default async function ConfiguracoesPage({ params }: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await params
  const session = await verifySession()
  if (!(await canProjectPermission(session, projetoId, 'projeto:editar'))) notFound()
  return <ProjetoFormPage canAssignRoles={session.role === 'admin'} />
}
