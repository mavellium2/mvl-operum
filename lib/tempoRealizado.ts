import type { WbsNodeProperties } from '@/types/wbs'

/** Apontamentos do card substituem o tempo manual; nunca são somados a ele. */
export function minutosRealizados(properties: WbsNodeProperties): number {
  const seconds = properties.tempoRealApontadoSegundos
  return seconds !== undefined ? seconds / 60 : properties.tempoRealMinutos ?? 0
}
