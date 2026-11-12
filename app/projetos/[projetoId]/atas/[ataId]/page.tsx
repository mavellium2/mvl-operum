import { canProjectPermission } from '@/services/projectAccess'
import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { buscarAta, cabecalhoDaAta, emailsParaCopia } from '@/services/ataService'
import prisma from '@/lib/prisma'
import { FUNCOES_ORDENADAS, nomesDasFuncoes } from '@/services/funcoesDaPessoa'
import AtaFormClient from '@/components/atas/AtaFormClient'
import AtaWorkspace from '@/components/atas/AtaWorkspace'
import type { MemberOption } from '@/components/atas/MemberSelect'
import type { Metadata } from 'next'
import { gerenteDoProjeto } from '@/services/gerenteProjeto'

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

  const [cabecalho, emailsSugeridos, gerente] = await Promise.all([cabecalhoDaAta(tenantId, projetoId), emailsParaCopia(tenantId, projetoId), gerenteDoProjeto(projetoId)])
  const members: MemberOption[] = (
    await prisma.userProject.findMany({
      where: { projectId: projetoId, active: true },
      include: {
        user: { select: { id: true, name: true, signatureUrl: true, deletedAt: true, isActive: true } },
        department: { select: { name: true } },
        funcoes: FUNCOES_ORDENADAS,
      },
      orderBy: { order: 'asc' },
    })
  )
    .filter(up => up.user.deletedAt === null && up.user.isActive)
    .map(up => {
      const cargos = nomesDasFuncoes(up.funcoes)
      const setor = cargos[0] ?? up.department?.name ?? null
      return { id: up.userId, name: up.user.name, setor, signatureUrl: up.user.signatureUrl }
    })

  return (
    <AtaWorkspace projetoId={projetoId} titulo={`Ata ${String(ata.numero).padStart(2, '0')} — ${ata.nomeProjeto}`}>
        <AtaFormClient key={ata.updatedAt?.toISOString()}
          projetoId={projetoId}
          ataId={ata.id}
          nomeProjeto={cabecalho.nomeProjeto ?? ata.nomeProjeto}
          instituicaoProjeto={cabecalho.instituicao}
          logoUrl={cabecalho.logoUrl}
          gerenteProjeto={gerente.nome}
          assinaturaGerenteUrl={gerente.signatureUrl}
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
    </AtaWorkspace>
  )
}
