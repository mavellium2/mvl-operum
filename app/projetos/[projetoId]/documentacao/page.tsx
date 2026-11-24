import { notFound } from 'next/navigation'
import DocumentacaoLayout from '@/components/projetos/documentacao/DocumentacaoLayout'
import type { Metadata } from 'next'
import { verifySession } from '@/lib/dal'
import { findById } from '@/services/projectAccess'
import { canProjectPermission } from '@/services/projectAccess'
import { listarAtasPorProjeto } from '@/services/ataService'
import { listarRiscos, type RiscoListItem } from '@/services/documentRevisionService'
import { resumoDaAta } from '@/lib/atasLista'
import prisma from '@/lib/prisma'
import { FUNCOES_ORDENADAS, nomesDasFuncoes } from '@/services/funcoesDaPessoa'
import { carregarStakeholdersDoProjeto } from '@/services/stakeholdersDoProjeto'
import { podeAvaliarRh as podeAvaliarRhDoProjeto } from '@/services/gerenteProjeto'
import { lerRecursoAvaliacaoRh, MIN_RODADAS_RH, totalRodadasRh } from '@/lib/avaliacaoRh'
import type { AvaliacaoRh } from '@/lib/validation/formulariosGP'
import type { AvaliacaoRhItem } from '@/components/projetos/documentacao/formularios/AvaliacaoRh'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Documentação' }

export default async function DocumentacaoPage({ params, searchParams }: { params: Promise<{ projetoId: string }>; searchParams: Promise<{ doc?: string }> }) {
  const { projetoId } = await params
  const { doc } = await searchParams
  const { userId, role, tenantId } = await verifySession()

  const project = await findById(projetoId)
  if (!project) notFound()

  if (!(await canProjectPermission({ tenantId, role, userId }, projetoId, 'documentos:ver'))) notFound()

  let atas: Awaited<ReturnType<typeof listarAtasPorProjeto>> = []
  try {
    atas = await listarAtasPorProjeto(projetoId)
  } catch (err) {
    console.error('[DocumentacaoPage] falha ao listar atas:', err)
  }
  // Formulários de Riscos: só quando o documento aberto é o de riscos.
  let riscos: RiscoListItem[] = []
  if (doc === 'riscos') {
    try {
      riscos = await listarRiscos({ tenantId, role, userId }, projetoId)
    } catch (err) {
      console.error('[DocumentacaoPage] falha ao listar riscos:', err)
    }
  }
  const gerente = await canProjectPermission({ tenantId, role, userId }, projetoId, 'documentos:excluir')
  const podeAvaliarRh = await podeAvaliarRhDoProjeto({ role, userId }, projetoId)

  // "Adicionar parte interessada" reaproveita o cadastro da tela Stakeholders: só para quem
  // gerencia a equipe e só quando o documento aberto é o de Partes Interessadas.
  const abrindoPartes = !doc || doc === 'stakeholder'
  const podeCadastrar = abrindoPartes && await canProjectPermission({ tenantId, role, userId }, projetoId, 'projeto:equipe')
  const dadosCadastro = podeCadastrar ? await carregarStakeholdersDoProjeto(tenantId, projetoId) : null
  const cadastroStakeholders = dadosCadastro ? { ...dadosCadastro, userRole: (role === 'admin' ? 'admin' : 'gerente') as 'admin' | 'gerente' } : null

  // Membros da equipe (responsáveis/aprovadores dos documentos devem ser membros).
  // `pendente` indica cadastro iniciado de forma simples e ainda não concluído (1º acesso).
  const membros = (
    await prisma.userProject.findMany({
      where: { projectId: projetoId, active: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            signatureUrl: true,
            deletedAt: true,
            isActive: true,
            forcePasswordChange: true,
          },
        },
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
      return {
        id: up.userId,
        name: up.user.name,
        setor,
        pendente: up.user.forcePasswordChange || undefined,
      }
    })

  let avaliacoesRh: AvaliacaoRhItem[] = []
  let rodadasRh = MIN_RODADAS_RH
  if (doc === 'avaliacao-rh' && podeAvaliarRh) {
    const versoes = await prisma.documentVersion.findMany({
      where: { projectId: projetoId, documentType: 'AVALIACAO_RH' },
      select: { resourceId: true, status: true, payload: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }],
    })
    const vistos = new Set<string>()
    avaliacoesRh = versoes.flatMap(v => {
      if (vistos.has(v.resourceId)) return []
      vistos.add(v.resourceId)
      const p = v.payload as unknown as AvaliacaoRh
      const recurso = lerRecursoAvaliacaoRh(v.resourceId)
      return recurso && p?.integranteId === recurso.integranteId
        ? [{ integranteId: recurso.integranteId, integrante: p.integrante, rodada: recurso.rodada, status: v.status as AvaliacaoRhItem['status'], notaFinal: p.notaFinal ?? '' }]
        : []
    })
    rodadasRh = totalRodadasRh(project.avaliacaoRhRodadas, avaliacoesRh.map(a => a.rodada))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <DocumentacaoLayout
        projetoId={projetoId}
        atas={atas.map(a => resumoDaAta(a))}
        riscos={riscos}
        avaliacoesRh={avaliacoesRh}
        podeAvaliarRh={podeAvaliarRh}
        rodadasRh={rodadasRh}
        gerente={gerente}
        membros={membros}
        cadastroStakeholders={cadastroStakeholders}
      />
    </div>
  )
}
