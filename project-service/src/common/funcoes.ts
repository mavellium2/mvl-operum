import type { Prisma } from '../../lib/generated/prisma'

/**
 * Funções de uma pessoa no projeto: lista de vínculos com o cadastro (Role), nunca
 * texto. Mesma regra de lib/funcoes.ts e services/funcoesDaPessoa.ts no monolito.
 */
const SEPARADORES = /\s*[|;,]\s*/

function singularizar(palavra: string): string {
  if (palavra.length <= 3) return palavra
  if (/[rz]es$/.test(palavra)) return palavra.slice(0, -2)
  if (palavra.endsWith('s') && !palavra.endsWith('ss')) return palavra.slice(0, -1)
  return palavra
}

/** Equivalência de nomes de função (acento, caixa, espaços e plural): igual a funcaoKey do monolito. */
export function funcaoKey(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/).filter(Boolean).map(singularizar).join(' ')
}

/** Nomes de funções distintos: aceita lista ou texto antigo ("A | B", "A, B"), sem repetidas. */
export function nomesDeFuncoes(entrada: string[] | string | null | undefined): string[] {
  const lista = Array.isArray(entrada) ? entrada : [entrada ?? '']
  const nomes: string[] = []
  for (const texto of lista) {
    for (const parte of (texto ?? '').split(SEPARADORES)) {
      const nome = parte.trim().replace(/\s+/g, ' ').slice(0, 120)
      if (nome && !nomes.some(n => funcaoKey(n) === funcaoKey(nome))) nomes.push(nome)
    }
  }
  return nomes
}

/** Nome de UMA função no cadastro: texto com separador é recusado. */
export function erroNomeDeFuncao(nome: string | undefined): string | null {
  if (nome === undefined) return null
  if (SEPARADORES.test(nome.trim())) {
    const partes = nome.split(SEPARADORES).map(p => p.trim()).filter(Boolean)
    return `Uma função por vez: "${nome.trim()}" tem mais de uma. Cadastre separadas (${partes.map(p => `"${p}"`).join(' e ')}).`
  }
  return null
}

const ehGerente = (nome: string) => funcaoKey(nome) === funcaoKey('Gerente de Projeto')

/**
 * Troca as funções do membro pelas informadas: cada nome vira um vínculo com a função
 * equivalente do cadastro (restaura excluída; cria só se faltar). "Gerente de Projeto"
 * não entra por aqui: acompanha o papel de gerente (UserProjectRole).
 */
export async function definirFuncoesDoMembro(tx: Prisma.TransactionClient, tenantId: string, userProjectId: string, entrada: string[] | string | null) {
  const catalogo = await tx.role.findMany({ where: { tenantId }, select: { id: true, name: true, deletedAt: true, nameKey: true, scope: true } })
  const ids: string[] = []
  for (const nome of nomesDeFuncoes(entrada).filter(n => !ehGerente(n))) {
    const iguais = catalogo.filter(r => funcaoKey(r.name) === funcaoKey(nome))
    let id = iguais.find(r => !r.deletedAt)?.id
    if (!id && iguais[0]) { await tx.role.update({ where: { id: iguais[0].id }, data: { deletedAt: null } }); id = iguais[0].id }
    if (!id) {
      const nameKey = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `funcao-${Date.now()}`
      id = (await tx.role.upsert({ where: { nameKey_tenantId_scope: { nameKey, tenantId, scope: 'TENANT' } }, create: { tenantId, name: nome, nameKey, scope: 'TENANT' }, update: { deletedAt: null } })).id
    }
    if (!ids.includes(id)) ids.push(id)
  }
  // Mantém a função de gerente, se houver (é do papel, não desta lista).
  const gerente = catalogo.find(r => r.nameKey === 'gerente' && r.scope === 'PROJETO')
  await tx.userProjectFuncao.deleteMany({ where: { userProjectId, roleId: { notIn: gerente ? [...ids, gerente.id] : ids } } })
  for (const [ordem, roleId] of ids.entries()) {
    await tx.userProjectFuncao.upsert({ where: { userProjectId_roleId: { userProjectId, roleId } }, create: { userProjectId, roleId, ordem }, update: { ordem } })
  }
  return ids
}

/** Para `include`: funções do membro na ordem, com o nome do cadastro. */
export const FUNCOES_ORDENADAS = { orderBy: { ordem: 'asc' as const }, select: { roleId: true, role: { select: { name: true } } } }
