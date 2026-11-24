import { canProjectPermission } from '@/services/projectAccess'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import ProjetoStakeholdersClient from '@/components/projetos/ProjetoStakeholdersClient'
import { carregarStakeholdersDoProjeto } from '@/services/stakeholdersDoProjeto'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
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
    // Altura da janela: a lista e o painel de edição rolam por dentro (como nas telas de arquivos), com a aparência do projeto.
    <div className="arq-pagina h-full overflow-hidden">
      <ProjectAppearance enabled>
        <ProjetoStakeholdersClient
          projetoId={projetoId}
          stakeholders={dados.stakeholders}
          stakeholdersDisponiveis={dados.stakeholdersDisponiveis}
          usuariosDisponiveis={dados.usuariosDisponiveis}
          funcoesExistentes={dados.funcoesExistentes}
          departamentosExistentes={dados.departamentosExistentes}
          userRole={userRole}
        />
      </ProjectAppearance>
    </div>
  )
}
