'use server'

import { verifySession } from '@/lib/dal'
import { requireProjectPermission } from '@/services/projectAccess'
import { carregarStakeholdersDoProjeto } from '@/services/stakeholdersDoProjeto'

/** Mesmos diretórios e formulário do cadastro Stakeholders, carregados sob demanda. */
export async function carregarCadastroStakeholdersAction(projetoId: string) {
  try {
    const session = await verifySession()
    await requireProjectPermission(session, projetoId, 'projeto:equipe')
    const dados = await carregarStakeholdersDoProjeto(session.tenantId, projetoId)
    if (!dados) return { error: 'Projeto não encontrado' }
    return { dados: { ...dados, userRole: session.role === 'admin' ? 'admin' as const : 'gerente' as const } }
  } catch {
    return { error: 'Não foi possível abrir o cadastro de membros. Confira sua permissão para gerenciar a equipe e tente novamente.' }
  }
}
