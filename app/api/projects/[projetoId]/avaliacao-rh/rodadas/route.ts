import { verifySession } from '@/lib/dal'
import { z } from 'zod'
import { adicionarRodadaAvaliacaoRh, removerRodadaAvaliacaoRh, renomearRodadaAvaliacaoRh } from '@/services/documentRevisionService'
import { documentRevisionErrorResponse } from '@/lib/documentRevisionHttp'
import { revalidatePath } from 'next/cache'

type Ctx = { params: Promise<{ projetoId: string }> }

/** Abre a próxima rodada de Avaliação de R.H. (somente gerente do projeto ou administrador). */
export async function POST(_req: Request, { params }: Ctx) {
  const session = await verifySession()
  try {
    const { projetoId } = await params
    const result = await adicionarRodadaAvaliacaoRh(session, projetoId)
    revalidatePath(`/projetos/${projetoId}`, 'layout')
    return Response.json(result, { status: 201 })
  } catch (error) {
    return documentRevisionErrorResponse(error)
  }
}

/** Exclui a última rodada (3ª em diante); os documentos dela ficam preservados no histórico. */
export async function DELETE(req: Request, { params }: Ctx) {
  const session = await verifySession()
  try {
    const { projetoId } = await params
    const { rodada } = z.object({ rodada: z.number().int().min(1).max(10) }).strict().parse(await req.json())
    const result = await removerRodadaAvaliacaoRh(session, projetoId, rodada)
    revalidatePath(`/projetos/${projetoId}`, 'layout')
    return Response.json(result)
  } catch (error) {
    return documentRevisionErrorResponse(error)
  }
}


/** Renomeia uma rodada (título vazio volta ao padrão). */
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await verifySession()
  try {
    const { projetoId } = await params
    const { rodada, titulo } = z.object({ rodada: z.number().int().min(1).max(10), titulo: z.string().max(60) }).strict().parse(await req.json())
    const result = await renomearRodadaAvaliacaoRh(session, projetoId, rodada, titulo)
    revalidatePath(`/projetos/${projetoId}`, 'layout')
    return Response.json(result)
  } catch (error) {
    return documentRevisionErrorResponse(error)
  }
}
