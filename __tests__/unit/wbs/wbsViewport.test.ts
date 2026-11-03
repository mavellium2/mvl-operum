import { describe, expect, it } from 'vitest'
import { fitWbsViewport } from '@/lib/wbsViewport'

const canvas = { width: 800, height: 600 }

function visibleArea(card: { x: number; y: number; width: number; height: number }, viewport: NonNullable<ReturnType<typeof fitWbsViewport>>) {
  return {
    left: card.x * viewport.zoom + viewport.panX,
    top: card.y * viewport.zoom + viewport.panY,
    right: (card.x + card.width) * viewport.zoom + viewport.panX,
    bottom: (card.y + card.height) * viewport.zoom + viewport.panY,
  }
}

describe('fitWbsViewport', () => {
  it('mostra a árvore inteira, mesmo quando a raiz não fica no centro e há cards à esquerda', () => {
    const root = { id: 'root', x: 1300, y: 0, width: 120, height: 70 }
    const left = { id: 'left', x: -300, y: 350, width: 180, height: 70 }
    const right = { id: 'right', x: 1800, y: 500, width: 180, height: 70 }
    const viewport = fitWbsViewport(canvas, { root, left, right })
    expect(viewport).not.toBeNull()
    for (const card of [root, left, right]) {
      const area = visibleArea(card, viewport!)
      expect(area.left).toBeGreaterThanOrEqual(39)
      expect(area.top).toBeGreaterThanOrEqual(39)
      expect(area.right).toBeLessThanOrEqual(761)
      expect(area.bottom).toBeLessThanOrEqual(561)
    }
  })

  it('mantém zoom de 100% quando a árvore pequena já cabe e ignora canvas vazio', () => {
    expect(fitWbsViewport(canvas, { one: { id: 'one', x: 0, y: 0, width: 120, height: 70 } })?.zoom).toBe(1)
    expect(fitWbsViewport(canvas, {})).toBeNull()
  })
})
