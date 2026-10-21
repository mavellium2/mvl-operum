import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { canProjectPermission } from '@/services/projectAccess'
import { buscarAta, cabecalhoDaAta, funcoesNoProjeto } from '@/services/ataService'
import { Packer } from 'docx'
import { ataAssinantes, buildAtaDocx, type AtaExportData } from '@/lib/exports/ataDocx'
import { imagemDoStorage } from '@/lib/exports/imagemServidor'
import { CAIXA_ASSINATURA, CAIXA_LOGO_ATA } from '@/lib/exports/imagemDocx'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ataId: string }> },
) {
  const { ataId } = await params

  try {
    const session = await verifySession()
    const ata = await buscarAta(session.tenantId, ataId)
    if (!ata) {
      return NextResponse.json({ error: 'Ata não encontrada' }, { status: 404 })
    }

    if (!(await canProjectPermission(session, ata.projetoId, 'documentos:ver'))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const [cabecalho, funcoes] = await Promise.all([
      cabecalhoDaAta(session.tenantId, ata.projetoId),
      funcoesNoProjeto(ata.projetoId, [ata.elaboradoPorUserId, ata.aprovadoPorUserId]),
    ])
    // Layout do modelo, com a logo do projeto e as assinaturas cadastradas dos presentes.
    const data: AtaExportData = {
      logoUrl: cabecalho.logoUrl,
      instituicao: cabecalho.instituicao || ata.instituicao,
      elaboradoPorFuncao: ata.elaboradoPorUserId ? funcoes.get(ata.elaboradoPorUserId) ?? null : null,
      aprovadoPorFuncao: ata.aprovadoPorUserId ? funcoes.get(ata.aprovadoPorUserId) ?? null : null,
      numero: ata.numero,
      nomeProjeto: ata.nomeProjeto,
      local: ata.local,
      data: ata.data,
      elaboradoPor: ata.elaboradoPor,
      aprovadoPor: ata.aprovadoPor,
      assuntosTratados: ata.assuntosTratados,
      decisoesTomadas: ata.decisoesTomadas,
      observacoes: ata.observacoes,
      copiasPara: ata.copiasPara,
      presentes: ata.presentes.map(p => ({ nome: p.nome, setorEmpresa: p.setorEmpresa, assinaturaUrl: p.user?.signatureUrl ?? null })),
      acoes: ata.acoes.map(a => ({ acao: a.acao, prazo: a.prazo, responsavel: a.responsavel })),
      anexos: ata.anexos.map(a => ({ nome: a.nome, url: a.url })),
    }

    const [logo, ...assinaturas] = await Promise.all([
      imagemDoStorage(data.logoUrl, CAIXA_LOGO_ATA),
      ...ataAssinantes(data.presentes).map(p => imagemDoStorage(p.assinaturaUrl, CAIXA_ASSINATURA)),
    ])
    const buffer = await Packer.toBuffer(buildAtaDocx(data, logo, assinaturas))

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="ata-${String(ata.numero).padStart(2, '0')}-${ata.nomeProjeto.replace(/\s+/g, '-').toLowerCase()}.docx"`,
      },
    })
  } catch (err) {
    console.error('[atas export GET]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
