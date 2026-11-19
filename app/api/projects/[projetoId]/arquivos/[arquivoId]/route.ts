import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { isSafeStorageUrl } from '@/lib/storageUrl'
import { excluirArquivo, urlDeAcesso } from '@/services/arquivosProjetoService'
import { erroArquivos } from '../erros'

type Ctx = { params: Promise<{ projetoId: string; arquivoId: string }> }

/** Abre (ou baixa, com ?baixar=1) pela URL assinada do storage, depois de conferir a sessão. */
export async function GET(req: Request, { params }: Ctx) {
  const { projetoId, arquivoId } = await params
  const { tenantId, role, userId } = await verifySession()
  try {
    const url = await urlDeAcesso({ tenantId, role, userId }, projetoId, arquivoId, new URL(req.url).searchParams.get('baixar') === '1')
    // Só redireciona para o host do storage (MINIO_PUBLIC_URL).
    if (!isSafeStorageUrl(url)) return NextResponse.json({ error: 'Armazenamento indisponível' }, { status: 502 })
    return NextResponse.redirect(url, 302)
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
