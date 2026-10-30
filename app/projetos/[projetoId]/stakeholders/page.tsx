import { canProjectPermission } from '@/services/projectAccess'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import ProjetoStakeholdersClient from '@/components/projetos/ProjetoStakeholdersClient'
import { carregarStakeholdersDoProjeto } from '@/services/stakeholdersDoProjeto'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Stakeholders' }

export default async function ProjetoStakeholdersPage({ params }: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await params
  const { tenantId, role, userId } = await verifySession()

  const isManager = await canProjectPermission({ tenantId, role, userId }, projetoId, 'projeto:equipe')
  if (!isManager) notFound()

  const userRole: 'admin' | 'gerente' = role === 'admin' ? 'admin' : 'gerente'

  const dados = await carregarStakeholdersDoProjeto(tenantId, projetoId)
  if (!dados) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <ProjetoStakeholdersClient
          projetoId={projetoId}
          stakeholders={dados.stakeholders}
          stakeholdersDisponiveis={dados.stakeholdersDisponiveis}
          usuariosDisponiveis={dados.usuariosDisponiveis}
          funcoesExistentes={dados.funcoesExistentes}
          departamentosExistentes={dados.departamentosExistentes}
          userRole={userRole}
        />
      </main>
    </div>
  )
}
