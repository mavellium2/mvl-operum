import { verifySession } from '@/lib/dal'
import { adicionarRodadaAvaliacaoRh } from '@/services/documentRevisionService'
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
