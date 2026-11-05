import type { Permissao } from './permissoes'
import { elaboradoresDe } from './elaboradores'

export const CAMPOS_REALIZADO = new Set(['tempoRealAjusteMinutos', 'tempoRealMinutos', 'materiaisReal', 'dataRealizacao', 'percentualConclusao'])
export const CAMPOS_ORCADO = new Set(['tempoMinutos', 'materiais', 'dataPrevista', 'elaboradoPorUserId', 'elaboradoPorUserIds', 'elaboradoPor', 'cost', 'durationDays', 'dataLimite', 'custo'])

/** Realizado próprio: o usuário é um dos elaboradores da linha (aceita a lista ou o id antigo). */
export function podeEditarRealizado(permissoes: ReadonlySet<Permissao>, userId: string, elaboradores: unknown) {
  if (permissoes.has('planilha:realizado-todos')) return true
  const ids = Array.isArray(elaboradores) ? elaboradores : typeof elaboradores === 'string' ? [elaboradores] : []
  return permissoes.has('planilha:realizado-proprio') && ids.includes(userId)
}

/** Usa o responsável persistido, nunca o enviado junto ao patch. */
export function validarCamposCustos(permissoes: ReadonlySet<Permissao>, userId: string, atuais: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const campo of Object.keys(patch)) {
    const permitido = CAMPOS_REALIZADO.has(campo)
      ? podeEditarRealizado(permissoes, userId, elaboradoresDe(atuais as Parameters<typeof elaboradoresDe>[0]))
      : CAMPOS_ORCADO.has(campo) ? permissoes.has('planilha:orcado') : permissoes.has('projeto:editar')
    if (!permitido) throw new Error(`Sem permissão para editar o campo ${campo}.`)
  }
}
