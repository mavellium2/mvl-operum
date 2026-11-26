import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifySession } from '@/lib/dal'
import { isSafeStorageUrl } from '@/lib/storageUrl'
import { excluirArquivo, imagemParaPrevia, renomearArquivo, svgParaExibir, urlDeAcesso } from '@/services/arquivosProjetoService'
import { erroArquivos } from '../erros'

const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, max-age=300',
}

type Ctx = { params: Promise<{ projetoId: string; arquivoId: string }> }

/** Abre (ou baixa, com ?baixar=1) pela URL assinada do storage, depois de conferir a sessão. */
export async function GET(req: Request, { params }: Ctx) {
  const { projetoId, arquivoId } = await params
  const { tenantId, role, userId } = await verifySession()
  try {
    const busca = new URL(req.url).searchParams
    const baixar = busca.get('baixar') === '1'
    if (busca.get('previa') === '1') {
      // Miniatura de imagem: URL estável e cache privado no navegador (o conteúdo de um arquivo não muda; renomear
      // só troca o nome). Sem isso, a URL assinada nova a cada visita fazia baixar todas as fotos de novo.
      const imagem = await imagemParaPrevia({ tenantId, role, userId }, projetoId, arquivoId)
      if (imagem) {
        if (imagem.etag && req.headers.get('if-none-match') === imagem.etag) { void imagem.corpo.cancel(); return new Response(null, { status: 304, headers: { ETag: imagem.etag } }) }
        return new Response(imagem.corpo, {
          headers: {
            'Content-Type': imagem.tipo,
            'Cache-Control': 'private, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline',
            ...(imagem.tamanho ? { 'Content-Length': String(imagem.tamanho) } : {}),
            ...(imagem.etag ? { ETag: imagem.etag } : {}),
          },
        })
      }
    }
    if (!baixar) {
      // SVG sai pela origem do app: com CSP sandbox e default-src 'none', nada nele executa (ADR-042).
      const svg = await svgParaExibir({ tenantId, role, userId }, projetoId, arquivoId)
      if (svg !== null) return new Response(svg, { headers: SVG_HEADERS })
    }
    const url = await urlDeAcesso({ tenantId, role, userId }, projetoId, arquivoId, baixar)
    // Só redireciona para o host do storage (MINIO_PUBLIC_URL).
    if (!isSafeStorageUrl(url)) return NextResponse.json({ error: 'Armazenamento indisponível' }, { status: 502 })
    return NextResponse.redirect(url, 302)
  } catch (e) { return erroArquivos(e) }
}

/** Renomeia o arquivo (só o nome; o objeto no storage continua o mesmo). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { projetoId, arquivoId } = await params
  const { tenantId, role, userId } = await verifySession()
  try {
    const { nome } = z.object({ nome: z.string().min(1).max(255) }).strict().parse(await req.json())
    const a = await renomearArquivo({ tenantId, role, userId }, projetoId, arquivoId, nome)
    return NextResponse.json({ id: a.id, nome: a.nome })
  } catch (e) { return erroArquivos(e) }
}

export async function DELETE(_: Request, { params }: Ctx) {
  const { projetoId, arquivoId } = await params
  const { tenantId, role, userId } = await verifySession()
  try {
    await excluirArquivo({ tenantId, role, userId }, projetoId, arquivoId)
    return new NextResponse(null, { status: 204 })
  } catch (e) { return erroArquivos(e) }
}
