import type { WbsNodeGeometry, WbsViewport } from '@/types/wbs'

type CanvasSize = { width: number; height: number }

/** Ajusta todos os cards visíveis, incluindo layouts que avançam à esquerda da raiz. */
export function fitWbsViewport(canvas: CanvasSize, geometry: Record<string, WbsNodeGeometry>): WbsViewport | null {
  const cards = Object.values(geometry)
  if (!cards.length || canvas.width <= 0 || canvas.height <= 0) return null

  const minX = Math.min(...cards.map(card => card.x))
  const minY = Math.min(...cards.map(card => card.y))
  const maxX = Math.max(...cards.map(card => card.x + card.width))
  const maxY = Math.max(...cards.map(card => card.y + card.height))
  const contentWidth = maxX - minX
  const contentHeight = maxY - minY
  if (contentWidth <= 0 || contentHeight <= 0) return null

  const padding = 40
  const availableWidth = Math.max(1, canvas.width - padding * 2)
  const availableHeight = Math.max(1, canvas.height - padding * 2)
  const zoom = Math.min(1, availableWidth / contentWidth, availableHeight / contentHeight)
  return {
    zoom,
    panX: (canvas.width - contentWidth * zoom) / 2 - minX * zoom,
    panY: (canvas.height - contentHeight * zoom) / 2 - minY * zoom,
  }
}
