'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { verifySession } from '@/lib/dal'
import { criarRisco, excluirRisco } from '@/services/documentRevisionService'

const id = z.string().min(1).max(64)

/** Novo formulário de risco (Documentação > Formulários de Riscos): devolve o id para abrir o editor. */
export async function criarRiscoAction(projetoId: string) {
  try {
    const s = await verifySession()
    const risco = await criarRisco(s, id.parse(projetoId))
    revalidatePath(`/projetos/${projetoId}/documentacao`)
    return { success: true as const, id: risco.id, numero: risco.numero }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar o risco' }
  }
}

export async function excluirRiscoAction(riscoId: string, projetoId: string) {
  try {
    const s = await verifySession()
    await excluirRisco(s, id.parse(projetoId), id.parse(riscoId))
    revalidatePath(`/projetos/${projetoId}/documentacao`)
    return { success: true as const }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao excluir o risco' }
  }
}
