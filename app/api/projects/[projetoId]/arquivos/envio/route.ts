import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifySession } from '@/lib/dal'
import { urlDeEnvio } from '@/services/arquivosProjetoService'
import { erroArquivos } from '../erros'

/**
 * URL assinada para o navegador enviar o arquivo direto ao storage. Vídeos
 * grandes não passam pelo app; o registro vem depois, conferido pelo servidor.
 */
export async function POST(req: Request, { params }: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await params
  const { tenantId, role, userId } = await verifySession()
  try {
    const d = z.object({
      categoria: z.enum(['FOTOS_VIDEOS', 'APRESENTACAO']),
      nome: z.string().min(1).max(255),
      tipo: z.string().min(1).max(150),
      tamanho: z.number().int().positive(),
    }).strict().parse(await req.json())
    return NextResponse.json(await urlDeEnvio({ tenantId, role, userId }, projetoId, d.categoria, d.nome, d.tipo, d.tamanho))
  } catch (e) { return erroArquivos(e) }
}
