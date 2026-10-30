import { canProjectPermission } from '@/services/projectAccess'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { findById } from '@/services/projectAccess'
import prisma from '@/lib/prisma'
import AtaFormClient from '@/components/atas/AtaFormClient'
import { cabecalhoDaAta, emailsParaCopia, proximoNumero } from '@/services/ataService'
import type { MemberOption } from '@/components/atas/MemberSelect'
import type { Metadata } from 'next'
import { gerenteDoProjeto } from '@/services/gerenteProjeto'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Nova Ata' }

export default async function NovaAtaPage({ params }: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await params
  const { userId, role, tenantId } = await verifySession()

  if (!(await canProjectPermission({ tenantId, role, userId }, projetoId, 'documentos:editar'))) notFound()
  const project = await findById(projetoId)
  if (!project) notFound()

  if (!(await canProjectPermission({ tenantId, role, userId }, projetoId, 'documentos:ver'))) notFound()

  const [cabecalho, emailsSugeridos, numero, gerente] = await Promise.all([cabecalhoDaAta(tenantId, projetoId), emailsParaCopia(tenantId, projetoId), proximoNumero(projetoId), gerenteDoProjeto(projetoId)])
  const members: MemberOption[] = (
    await prisma.userProject.findMany({
      where: { projectId: projetoId, active: true },
      include: {
        user: { select: { id: true, name: true, signatureUrl: true, deletedAt: true, isActive: true } },
        department: { select: { name: true } },
      },
      orderBy: { order: 'asc' },
    })
  )
    .filter(up => up.user.deletedAt === null && up.user.isActive)
    .map(up => {
      const cargos = up.role
        ? up.role.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []
      const setor = cargos[0] ?? up.department?.name ?? null
      return { id: up.userId, name: up.user.name, setor, signatureUrl: up.user.signatureUrl }
    })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link href={`/projetos/${projetoId}/documentacao?doc=atas`} className="text-sm text-blue-600 hover:underline">
          ← Voltar às atas
        </Link>
        <h1 className="text-sm font-semibold text-gray-900">Nova Ata de Reunião</h1>
      </div>
      <main className="min-h-0 flex-1">
        <AtaFormClient gerenteProjeto={gerente.nome} assinaturaGerenteUrl={gerente.signatureUrl} projetoId={projetoId} mode="create" numero={numero} nomeProjeto={project.name} members={members} emailsSugeridos={emailsSugeridos} instituicaoProjeto={cabecalho.instituicao} logoUrl={cabecalho.logoUrl} />
      </main>
    </div>
  )
}
