import { z } from 'zod'

/**
 * Formatação e validação de valores em reais. Os campos usam máscara com os
 * centavos entrando pela direita (digitar 1, 2, 3 vira 0,01 → 0,12 → 1,23).
 */

/** Maior valor aceito: R$ 99.999.999.999,99 (13 dígitos). */
export const MOEDA_MAXIMO = 99_999_999_999.99
const MAX_DIGITOS = 13

const formatador = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1234.5 → "1.234,50". */
export function moedaParaTexto(valor: number): string {
  return formatador.format(valor)
}

/** 1234.5 → "R$ 1.234,50" (para exibir valores). */
export function formatReais(valor: number): string {
  return `R$ ${moedaParaTexto(valor)}`
}

/** Máscara do que foi digitado: só os dígitos contam, os dois últimos são os centavos. Vazio sem dígitos. */
export function formatMoeda(raw: string | null | undefined, comSimbolo = false): string {
  const digitos = (raw ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITOS)
  if (!digitos) return ''
  const texto = moedaParaTexto(Number(digitos) / 100)
  return comSimbolo ? `R$ ${texto}` : texto
}

/**
 * Lê um valor salvo ou digitado: "R$ 1.234,56", "1234,56", "1234.56" ou número.
 * Vazio vira null; texto que não é número vira NaN.
 */
export function parseMoeda(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : NaN
  let t = valor.replace(/R\$|\s/g, '')
  if (t === '') return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return NaN
  return Math.round(Number(t) * 100) / 100
}

/** Valor salvo (texto em qualquer formato aceito ou número) → texto com máscara; vazio se não houver valor. */
export function moedaParaCampo(valor: string | number | null | undefined, comSimbolo = false): string {
  const n = parseMoeda(valor)
  if (n === null || Number.isNaN(n)) return typeof valor === 'string' ? valor : ''
  const texto = moedaParaTexto(n)
  return comSimbolo ? `R$ ${texto}` : texto
}

export const MENSAGEM_MOEDA_INVALIDA = 'Valor inválido. Use o formato 1.234,56.'

/** Mensagem de erro de um valor em reais (vazio é aceito quando o campo é opcional). */
export function erroMoeda(valor: string | number | null | undefined, opcoes: { obrigatorio?: boolean; rotulo?: string } = {}): string | null {
  const rotulo = opcoes.rotulo ?? 'Valor'
  const n = parseMoeda(valor)
  if (n === null) return opcoes.obrigatorio ? `${rotulo} é obrigatório.` : null
  if (Number.isNaN(n)) return opcoes.rotulo ? `${rotulo}: ${MENSAGEM_MOEDA_INVALIDA}` : MENSAGEM_MOEDA_INVALIDA
  if (n < 0) return `${rotulo} não pode ser negativo.`
  if (n > MOEDA_MAXIMO) return `${rotulo} acima do limite de R$ ${moedaParaTexto(MOEDA_MAXIMO)}.`
  return null
}

/** Valor opcional em texto (ex.: custo de macrofase): vazio passa; preenchido precisa ser um valor válido. */
export const moedaTextoOpcionalSchema = z
  .string()
  .optional()
  .refine(v => erroMoeda(v) === null, MENSAGEM_MOEDA_INVALIDA)

/** Primeiro erro entre os custos das macrofases (ex.: "Fase 2 — Custo: Valor inválido..."), ou null. */
export function erroCustosMacroFases(fases: Array<{ custo?: string | null }> | undefined): string | null {
  for (const [i, fase] of (fases ?? []).entries()) {
    const erro = erroMoeda(fase.custo, { rotulo: 'Custo' })
    if (erro) return `Fase ${i + 1} — ${erro}`
  }
  return null
}
