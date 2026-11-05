import type { WbsNodeProperties } from '@/types/wbs'

/** Minutos digitados na planilha (ou na EAP) para o realizado da atividade. */
export function minutosDigitados(properties: WbsNodeProperties): number {
  return properties.tempoRealMinutos ?? 0
}

/** Minutos dos apontamentos encerrados do card ligado (timer e lançamentos do card). */
export function minutosApontados(properties: WbsNodeProperties): number {
  const seconds = properties.tempoRealApontadoSegundos
  return seconds !== undefined ? seconds / 60 : 0
}

/**
 * Realizado = manual + apontamentos + ajuste explícito, com piso zero (ADR-092).
 * Somar evita que o primeiro apontamento apague o que já foi digitado.
 */
export function minutosRealizados(properties: WbsNodeProperties): number {
  return Math.max(0, minutosDigitados(properties) + minutosApontados(properties) + (properties.tempoRealAjusteMinutos ?? 0))
}

/** Minutos para exibir: inteiros sem casas (200); quebrados com duas casas (0,10 · 1.640,18). */
export function formatarMinutos(minutos: number): string {
  const arredondado = Math.round(minutos * 100) / 100
  const casas = Number.isInteger(arredondado) ? 0 : 2
  return arredondado.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}
