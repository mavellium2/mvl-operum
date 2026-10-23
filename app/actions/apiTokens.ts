'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { apiTokensApi } from '@/lib/api-client'

export async function listApiTokensAction() {
  try {
    await verifySession()
    const tokens = await apiTokensApi.list()
    return { tokens }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao listar tokens' }
  }
}

export type CreateApiTokenState = { error?: string; created?: { id: string; token: string; prefix: string; expiresAt: string | null } }

export async function createApiTokenAction(prevState: CreateApiTokenState, formData: FormData): Promise<CreateApiTokenState> {
  try {
    await verifySession()

    const name = (formData.get('name') as string)?.trim()
    if (!name) return { error: 'Nome é obrigatório' }

    const scopes: ('read' | 'write')[] = ['read']
    if (formData.get('write') === 'on') scopes.push('write')

    const expiresInDaysRaw = formData.get('expiresInDays') as string
    const expiresInDaysParsed = expiresInDaysRaw ? Number(expiresInDaysRaw) : undefined
    if (expiresInDaysParsed !== undefined && (!Number.isInteger(expiresInDaysParsed) || expiresInDaysParsed < 1 || expiresInDaysParsed > 365)) {
      return { error: 'Validade inválida' }
    }
    const expiresInDays = expiresInDaysParsed

    const created = await apiTokensApi.create({ name, scopes, expiresInDays })
    revalidatePath('/configuracoes/integracoes')
    return { created }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar token' }
  }
}

export async function revokeApiTokenAction(id: string) {
  try {
    await verifySession()
    await apiTokensApi.revoke(id)
    revalidatePath('/configuracoes/integracoes')
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao revogar token' }
  }
}
