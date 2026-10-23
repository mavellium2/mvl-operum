import { z } from 'zod'

/**
 * Formatação e validação de telefone e e-mail, usadas nos formulários (máscara
 * enquanto digita) e nas actions (validação no servidor).
 *
 * Telefone brasileiro: (00) 0000-0000 (fixo) ou (00) 00000-0000 (celular).
 * Número que começa com "+" é tratado como internacional: "+" e até 15 dígitos;
 * com "+55", segue a máscara brasileira.
 */

const MAX_DIGITOS_INTERNACIONAL = 15

function mascaraBrasil(digitos: string): string {
  const d = digitos.slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const numero = d.slice(2)
  if (numero.length <= 4) return `(${ddd}) ${numero}`
  const corte = d.length === 11 ? 5 : 4
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
}

/** Aplica a máscara de telefone ao texto digitado ou salvo. */
export function formatTelefone(raw: string | null | undefined): string {
  const texto = (raw ?? '').trim()
  if (!texto) return ''
  const digitos = texto.replace(/\D/g, '')
  if (texto.startsWith('+')) {
    if (digitos.startsWith('55') && digitos.length > 2) return `+55 ${mascaraBrasil(digitos.slice(2))}`
    return `+${digitos.slice(0, MAX_DIGITOS_INTERNACIONAL)}`
  }
  return mascaraBrasil(digitos)
}

function telefoneBrasilValido(digitos: string): boolean {
  if (!/^[1-9]{2}/.test(digitos)) return false
  if (digitos.length === 11) return digitos[2] === '9'
  if (digitos.length === 10) return /[2-5]/.test(digitos[2])
  return false
}

/** Telefone completo: fixo ou celular brasileiro com DDD, ou internacional com "+". */
export function telefoneValido(valor: string | null | undefined): boolean {
  const texto = (valor ?? '').trim()
  const digitos = texto.replace(/\D/g, '')
  if (texto.startsWith('+')) {
    if (digitos.startsWith('55')) return telefoneBrasilValido(digitos.slice(2))
    return digitos.length >= 8 && digitos.length <= MAX_DIGITOS_INTERNACIONAL
  }
  return telefoneBrasilValido(digitos)
}

/** Remove espaços do e-mail (inclusive os colados no meio). Não muda maiúsculas: o login compara o e-mail exato. */
export function formatEmail(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '')
}

const EMAIL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/

export function emailValido(valor: string | null | undefined): boolean {
  const email = formatEmail(valor)
  return email.length <= 254 && EMAIL_RE.test(email)
}

export const MENSAGEM_TELEFONE_INVALIDO = 'Telefone inválido. Use (00) 0000-0000, (00) 00000-0000 ou +código do país.'
export const MENSAGEM_EMAIL_INVALIDO = 'E-mail inválido. Use o formato nome@dominio.com.'

/** Mensagem de erro do campo de telefone (vazio é aceito quando o campo é opcional). */
export function erroTelefone(valor: string | null | undefined, obrigatorio = false): string | null {
  if (!(valor ?? '').trim()) return obrigatorio ? 'Telefone é obrigatório.' : null
  return telefoneValido(valor) ? null : MENSAGEM_TELEFONE_INVALIDO
}

/** Mensagem de erro do campo de e-mail (vazio é aceito quando o campo é opcional). */
export function erroEmail(valor: string | null | undefined, obrigatorio = false): string | null {
  if (!formatEmail(valor)) return obrigatorio ? 'E-mail é obrigatório.' : null
  return emailValido(valor) ? null : MENSAGEM_EMAIL_INVALIDO
}

/** Telefone opcional para schemas zod: vazio vira undefined; preenchido é validado e salvo com máscara. */
export const telefoneOpcionalSchema = z
  .string()
  .trim()
  .optional()
  .transform(v => (v ? v : undefined))
  .refine(v => v === undefined || telefoneValido(v), MENSAGEM_TELEFONE_INVALIDO)
  .transform(v => (v === undefined ? undefined : formatTelefone(v)))

/** E-mail obrigatório para schemas zod, sem espaços. */
export const emailSchema = z
  .string()
  .transform(formatEmail)
  .refine(v => v.length > 0, 'E-mail é obrigatório.')
  .refine(emailValido, MENSAGEM_EMAIL_INVALIDO)

type ComContato = { email?: string | null; phone?: string | null }

/**
 * Valida e normaliza `email` e `phone` de um payload de action. Campos ausentes
 * não são tocados; telefone vazio é mantido (permite limpar o campo). Com `atual`,
 * valores iguais aos já salvos passam sem validar, para dados antigos fora do
 * padrão não bloquearem a edição de outros campos.
 */
export function normalizarContato<T extends ComContato>(
  data: T,
  opcoes: { emailObrigatorio?: boolean; atual?: ComContato | null } = {},
): { data: T; error?: undefined } | { data?: undefined; error: string } {
  const saida: T = { ...data }
  const mesmo = (campo: keyof ComContato) =>
    opcoes.atual != null && typeof data[campo] === 'string' && (data[campo] ?? '').trim() === (opcoes.atual[campo] ?? '').trim()
  if (mesmo('email')) delete saida.email
  if (mesmo('phone')) delete saida.phone
  if (typeof saida.email === 'string' || (opcoes.emailObrigatorio && !mesmo('email'))) {
    const erro = erroEmail(saida.email, opcoes.emailObrigatorio)
    if (erro) return { error: erro }
    if (typeof saida.email === 'string') saida.email = formatEmail(saida.email)
  }
  if (typeof saida.phone === 'string') {
    const erro = erroTelefone(saida.phone)
    if (erro) return { error: erro }
    saida.phone = saida.phone.trim() ? formatTelefone(saida.phone) : ''
  }
  return { data: saida }
}
