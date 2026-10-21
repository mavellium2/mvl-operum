import type { WbsNodeClient } from '@/types/wbs'

/**
 * Largura de cada nó da EAP pelo texto "código título" (Canvas API, só no
 * navegador). Usada pela aba EAP e pelo documento EAP, para o documento ter os
 * mesmos blocos da aba. Fora do navegador, {} (o layout usa a largura padrão).
 */
export function measureNodeWidths(nodes: Record<string, WbsNodeClient>, fontFamily?: string): Record<string, number> {
  if (typeof document === 'undefined') return {}
  const PADDING_H = 32
  const MIN_W = 120
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return {}
  const familia = fontFamily ?? getComputedStyle(document.body).fontFamily
  const widths: Record<string, number> = {}
  for (const node of Object.values(nodes)) {
    ctx.font = `500 ${node.style.fontSize}px ${familia}`
    const textW = ctx.measureText(`${node.code} ${node.title}`).width
    widths[node.id] = Math.max(MIN_W, textW + PADDING_H)
  }
  return widths
}
