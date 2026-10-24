'use server'

import { emailValido, formatEmail, MENSAGEM_EMAIL_INVALIDO } from '@/lib/contato'
import { verifySession } from '@/lib/dal'
import { isProjectManager } from '@/services/projectRoleService'
import { adminCreateUserAction } from './admin'
import { addMemberAction } from './projects'

export interface MembroCriado {
  id: string
  name: string
}

/**
 * Cria um membro da equipe de forma simples (nome/e-mail/senha) e o vincula ao projeto.
 *
 * O usuário é criado com `forcePasswordChange: true` — ou seja, fica PENDENTE:
 * ele precisa trocar a senha no primeiro acesso para concluir o cadastro. Isso
 * sinaliza que o membro foi criado de forma simplificada e ainda aguarda regularização.
 *
 * A criação de usuários é restrita a administradores (camada de auth); gerentes
 * recebem um erro claro em caso de falta de permissão.
 */
export async function criarMembroEquipeAction(input: {
  projetoId: string
  name: string
  email: string
  password: string
}): Promise<{ membro: MembroCriado } | { error: string }> {
  try {
    const name = input.name.trim()
    const email = formatEmail(input.email).toLowerCase()
    const password = input.password

    if (!name || !email || !password) {
      return { error: 'Preencha nome, e-mail e senha.' }
    }
    if (!emailValido(email)) {
      return { error: MENSAGEM_EMAIL_INVALIDO }
    }
    if (password.length < 8) {
      return { error: 'A senha deve ter pelo menos 8 caracteres.' }
    }

    const session = await verifySession()
    const canManage =
      session.role === 'admin' || (await isProjectManager(session.userId, input.projetoId))
    if (!canManage) {
      return { error: 'Acesso restrito a gerentes e administradores do projeto.' }
    }

    if (session.role !== 'admin') {
      return {
        error:
          'Somente administradores podem criar novos membros da equipe. Solicite a um administrador que crie o usuário.',
      }
    }

    const created = await adminCreateUserAction({
      name,
      email,
      password,
      forcePasswordChange: true,
    })
    if ('error' in created || !created.user) {
      return { error: created.error ?? 'Erro ao criar o membro.' }
    }

    const linked = await addMemberAction(input.projetoId, created.user.id)
    if ('error' in linked) {
      return { error: linked.error ?? 'Erro ao vincular o membro ao projeto.' }
    }

    return { membro: { id: created.user.id, name: created.user.name } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar o membro da equipe.' }
  }
}