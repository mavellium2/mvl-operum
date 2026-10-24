import { prisma } from '../prisma'

/**
 * Contas da mesma pessoa em instituições diferentes (ADR-061).
 *
 * Antes, as contas eram unidas só pelo e-mail: quem tivesse uma conta com o
 * e-mail E em qualquer instituição (por exemplo, criada pelo admin de outra
 * instituição) trocava para as contas de E em todas as outras. Agora a união
 * é explícita (`identityId`) e só nasce de fluxos que comprovam a posse:
 * provisionar/entrar numa instituição a partir da conta atual, ou confirmar a
 * senha da conta de destino.
 */

type Conta = { id: string; identityId: string | null }

export const identidade = (conta: Conta) => conta.identityId ?? conta.id

export function mesmaIdentidade(a: Conta, b: Conta): boolean {
  return identidade(a) === identidade(b)
}

/** Filtro Prisma das contas vinculadas a `conta` (inclui ela mesma). */
export function contasVinculadas(conta: Conta) {
  const id = identidade(conta)
  return { OR: [{ id: conta.id }, { id }, { identityId: id }] }
}

/**
 * Une as identidades de `a` e `b`. Se `b` já pertencia a outro grupo
 * (comprovado agora pela senha), o grupo inteiro passa para o de `a`.
 */
export async function vincularContas(a: Conta, b: Conta): Promise<string> {
  const grupo = identidade(a)
  const anterior = identidade(b)
  await prisma.$transaction([
    prisma.user.updateMany({ where: { OR: [{ id: anterior }, { identityId: anterior }] }, data: { identityId: grupo } }),
    prisma.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { identityId: grupo } }),
  ])
  return grupo
}
