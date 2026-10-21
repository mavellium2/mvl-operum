import { canProjectPermission } from '@/services/projectAccess'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { buscarAta, cabecalhoDaAta, emailsParaCopia } from '@/services/ataService'
import prisma from '@/lib/prisma'
import AtaFormClient from '@/components/atas/AtaFormClient'
import type { MemberOption } from '@/components/atas/MemberSelect'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Editar Ata' }

export default async function EditarAtaPage({
  params,
}: {
  params: Promise<{ projetoId: string; ataId: string }>
}) {
  const { projetoId, ataId } = await params
  const { userId, role, tenantId } = await verifySession()

  if (!(await canProjectPermission({ tenantId, role, userId }, projetoId, 'documentos:ver'))) notFound()

  const ata = await buscarAta(tenantId, ataId)
  if (!ata || ata.projetoId !== projetoId) notFound()

  const [cabecalho, emailsSugeridos] = await Promise.all([cabecalhoDaAta(tenantId, projetoId), emailsParaCopia(tenantId, projetoId)])
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
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between">
          <Link href={`/projetos/${projetoId}/documentacao?doc=atas`} className="text-sm text-blue-600 hover:underline">
            ← Voltar às atas
          </Link>
          <a
            href={`/api/atas/${ataId}/export`}
            download
            className="px-3 py-1.5 text-sm font-medium text-white bg-gray-800 hover:bg-gray-900 rounded-lg"
          >
            Exportar .docx
          </a>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mt-3 mb-1">
          Ata {String(ata.numero).padStart(2, '0')} — {ata.nomeProjeto}
        </h1>
        <p className="text-sm text-gray-500 mb-6">Edite os campos abaixo e salve as alterações.</p>
        <AtaFormClient key={ata.updatedAt?.toISOString()}
          projetoId={projetoId}
          ataId={ata.id}
          nomeProjeto={ata.nomeProjeto}
          instituicaoProjeto={cabecalho.instituicao}
          logoUrl={cabecalho.logoUrl}
          numero={ata.numero}
          mode="edit"
          members={members}
          emailsSugeridos={emailsSugeridos}
          initial={{
            instituicao: ata.instituicao,
            local: ata.local,
            data: ata.data ? ata.data.toISOString() : undefined,
            elaboradoPor: ata.elaboradoPor ?? '',
            elaboradoPorUserId: ata.elaboradoPorUserId,
            aprovadoPor: ata.aprovadoPor,
            aprovadoPorUserId: ata.aprovadoPorUserId,
            assuntosTratados: ata.assuntosTratados,
            decisoesTomadas: ata.decisoesTomadas,
            observacoes: ata.observacoes,
            copiasPara: ata.copiasPara,
            presentes: (ata.presentes ?? []).map(p => ({
              nome: p.nome,
              setorEmpresa: p.setorEmpresa ?? '',
              userId: p.userId ?? '',
            })),
            acoes: (ata.acoes ?? []).map(a => ({
              acao: a.acao,
              prazo: a.prazo ? a.prazo.toISOString() : '',
              responsavel: a.responsavel ?? '',
              responsavelUserId: a.responsavelUserId ?? '',
            })),
            anexos: (ata.anexos ?? []).map(a => ({ nome: a.nome, url: a.url ?? '' })),
          }}
        />
      </main>
    </div>
  )
}
