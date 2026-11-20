import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import { definirFavorito } from '@/services/arquivosProjetoService'
import { erroArquivos } from '../../erros'

type Ctx = { params: Promise<{ projetoId: string; arquivoId: string }> }

/** Estrela pessoal do arquivo: PUT marca, DELETE tira (ambos idempotentes). */
async function definir(favorito: boolean, { params }: Ctx) {
  const { projetoId, arquivoId } = await params
  const { tenantId, role, userId } = await verifySession()
  try {
    await definirFavorito({ tenantId, role, userId }, projetoId, arquivoId, favorito)
    return new NextResponse(null, { status: 204 })
  } catch (e) { return erroArquivos(e) }
}

export const PUT = (_: Request, ctx: Ctx) => definir(true, ctx)
export const DELETE = (_: Request, ctx: Ctx) => definir(false, ctx)
