import type {
  WbsNodeClient,
  WbsLayoutResult,
  WbsNodeGeometry,
  WbsConnector,
  DropPosition,
} from '@/types/wbs'

export const NODE_W = 160
export const NODE_H = 60
export const GAP_X = 40
export const GAP_Y = 60
/** Área da pílula de colapso que fica meio para fora (~10px abaixo do card). */
export const PILL_OVERHANG = 12

/**
 * Resolve a posição de drop sobre (ou logo abaixo de) um card:
 * - borda esquerda  → BEFORE (irmão antes)
 * - borda direita   → AFTER  (irmão depois)
 * - corpo/abaixo    → INSIDE (filho)
 * Retorna null quando o cursor não está em nenhuma zona do card.
 */
export function resolveDropPosition(
  cx: number,
  cy: number,
  g: Pick<WbsNodeGeometry, 'x' | 'y' | 'width' | 'height'>
): DropPosition | null {
  const SIDE_W = Math.max(18, g.width * 0.2)
  const BELOW_H = 24

  const withinCard =
    cx >= g.x && cx <= g.x + g.width &&
    cy >= g.y && cy <= g.y + g.height
  if (withinCard) {
    if (cx < g.x + SIDE_W) return 'BEFORE'
    if (cx > g.x + g.width - SIDE_W) return 'AFTER'
    return 'INSIDE'
  }

  const inBelowBand =
    cy > g.y + g.height && cy <= g.y + g.height + BELOW_H &&
    cx >= g.x && cx <= g.x + g.width
  if (inBelowBand) return 'INSIDE'

  return null
}

interface SubtreeSize {
  width: number
  height: number
  /** Posição do card do nó dentro da caixa da subárvore. */
  rootX: number
  rootY: number
}

/**
 * Recuo dos filhos em relação à linha vertical (Direita/Esquerda), na proporção do
 * organizar-direita.svg: linha no centro do pai (x 9 de 3–15) e filho em x 14, ou
 * seja, 5/12 da largura do pai depois da linha.
 */
export function indentDe(parentWidth: number): number {
  return Math.round((parentWidth * 5) / 12)
}
/** Espaço vertical entre filhos empilhados (Direita, Esquerda, Padrão e Horizontal). */
export const GAP_STACK = 24
/** Padrão, item com filhos só folhas: a linha desce perto da borda esquerda do pai (modelo do Churrasco). */
export const PADRAO_INSET = 16
/** Padrão: distância da linha até a borda esquerda dos filhos empilhados. */
export const PADRAO_GAP = 16

/** Formato da EAP inteira, guardado no layout da raiz (menu Organizar). */
export type FormatoEap = 'LADO_A_LADO' | 'ESQUERDA' | 'DIREITA' | 'HORIZONTAL'
/** Formato próprio de uma fase (1º nível), guardado no layout dela. */
export type FormatoFase = 'ESQUERDA' | 'DIREITA'
/** Como os filhos de um nó são dispostos. */
type Arranjo = 'LADO' | 'PILHA_PADRAO' | 'DIREITA' | 'ESQUERDA' | 'HORIZONTAL'

/**
 * Formato da EAP a partir do layout da raiz. "Horizontal (topo/base)" foram removidos em
 * 1.31.0 e viram Horizontal; valores desconhecidos viram Padrão.
 */
export function formatoDaEap(layout: string | undefined): FormatoEap {
  if (layout === 'ESQUERDA' || layout === 'DIREITA') return layout
  if (layout === 'HORIZONTAL' || layout === 'HORIZONTAL_TOPO' || layout === 'HORIZONTAL_BASE') return 'HORIZONTAL'
  // "Abaixo" (anterior a 1.25.0) era desenhado como Direita.
  if (layout === 'ABAIXO' || layout === 'ABAIXO_L') return 'DIREITA'
  return 'LADO_A_LADO'
}

/** Formato próprio da fase, ou null quando ela segue a EAP. No Horizontal, toda fase segue a EAP. */
export function formatoDaFase(layout: string | undefined, eap: FormatoEap): FormatoFase | null {
  if (eap === 'HORIZONTAL') return null
  return layout === 'ESQUERDA' || layout === 'DIREITA' ? layout : null
}

function visibleChildren(
  node: WbsNodeClient,
  nodes: Record<string, WbsNodeClient>
): WbsNodeClient[] {
  if (node.collapsed) return []
  return node.childrenIds
    .map(id => nodes[id])
    .filter((n): n is WbsNodeClient => Boolean(n))
    .sort((a, b) => a.order - b.order)
}

/** Topo de cada filho numa coluna empilhada, a partir de 0. */
function stackTops(heights: number[]): number[] {
  const tops: number[] = []
  let y = 0
  for (const h of heights) { tops.push(y); y += h + GAP_STACK }
  return tops
}

interface Plano {
  /** Ordem de visita (pré-ordem) dos nós visíveis. */
  preOrder: string[]
  arranjo: Record<string, Arranjo>
  /** Tamanho do card; a raiz do Horizontal fica em pé. */
  card: Record<string, { w: number; h: number; vertical: boolean }>
}

/**
 * Decide o arranjo dos filhos de cada nó (ADR-047):
 * - Padrão: filhos lado a lado em todos os níveis, independente do colapso ou da profundidade.
 * - Esquerda/Direita: fases lado a lado embaixo da raiz; abaixo delas, filhos empilhados à esquerda/direita.
 * - Horizontal: a raiz em pé à esquerda e cada nível numa coluna à direita do anterior.
 * Uma fase com formato próprio (Esquerda/Direita) aplica esse formato a ela e a tudo abaixo dela.
 */
function planejar(
  rootId: string,
  nodes: Record<string, WbsNodeClient>,
  nodeWidths: Record<string, number>,
  nodeHeight: number,
  raizEmPe: boolean,
): Plano {
  const eap = formatoDaEap(nodes[rootId].layout)
  const preOrder: string[] = []
  const arranjo: Record<string, Arranjo> = {}
  const card: Plano['card'] = {}
  const seen = new Set<string>()
  const q: Array<{ id: string; depth: number; formato: FormatoEap }> = [{ id: rootId, depth: 0, formato: eap }]

  for (let cursor = 0; cursor < q.length; cursor++) {
    const { id, depth } = q[cursor]
    const node = nodes[id]
    if (!node || seen.has(id)) continue
    seen.add(id)
    preOrder.push(id)
    const formato = depth === 1 ? (formatoDaFase(node.layout, eap) ?? eap) : q[cursor].formato
    const ch = visibleChildren(node, nodes)

    if (formato === 'HORIZONTAL') arranjo[id] = 'HORIZONTAL'
    else if (formato === 'LADO_A_LADO') {
      arranjo[id] = 'LADO'
    } else arranjo[id] = depth === 0 ? 'LADO' : formato

    const w = nodeWidths[id] ?? NODE_W
    const emPe = raizEmPe && depth === 0 && eap === 'HORIZONTAL' && ch.length > 0
    // Em pé: a largura medida do texto vira a altura do card.
    card[id] = emPe ? { w: nodeHeight, h: Math.max(nodeHeight, w), vertical: true } : { w, h: nodeHeight, vertical: false }

    ch.forEach(c => q.push({ id: c.id, depth: depth + 1, formato }))
  }

  // Horizontal: blocos e fases com o mesmo tamanho (a largura do maior texto),
  // para as colunas de cada nível ficarem alinhadas. A raiz mantém o próprio tamanho.
  if (eap === 'HORIZONTAL') {
    const demais = preOrder.filter(id => id !== rootId)
    const largura = Math.max(0, ...demais.map(id => card[id].w))
    for (const id of demais) card[id] = { ...card[id], w: largura }
  }
  return { preOrder, arranjo, card }
}

/** Calcula o bounding-box de cada subárvore em pós-ordem. */
function buildSubtreeSizes(nodes: Record<string, WbsNodeClient>, plano: Plano): Record<string, SubtreeSize> {
  const sizes: Record<string, SubtreeSize> = {}
  const { preOrder, arranjo, card } = plano

  for (let i = preOrder.length - 1; i >= 0; i--) {
    const id = preOrder[i]
    const node = nodes[id]
    const ids = visibleChildren(node, nodes).map(c => c.id)
    const ch = ids.map(c => sizes[c])
    const { w: nw, h: H } = card[id]

    if (ch.length === 0) {
      sizes[id] = { width: nw, height: H, rootX: 0, rootY: 0 }
      continue
    }

    const stackH = ch.reduce((sum, c) => sum + c.height, 0) + GAP_STACK * (ch.length - 1)
    const maxChildW = Math.max(...ch.map(c => c.width))
    const a = arranjo[id]

    if (a === 'LADO') {
      const totalW = ch.reduce((sum, c) => sum + c.width, 0) + GAP_X * (ch.length - 1)
      const width = Math.max(nw, totalW)
      sizes[id] = { width, rootX: (width - nw) / 2, rootY: 0, height: H + GAP_Y + Math.max(...ch.map(c => c.height)) }
    } else if (a === 'PILHA_PADRAO') {
      sizes[id] = { width: Math.max(nw, PADRAO_INSET + PADRAO_GAP + maxChildW), rootX: 0, rootY: 0, height: H + GAP_Y / 2 + stackH }
    } else if (a === 'DIREITA' || a === 'ESQUERDA') {
      // Linha vertical no centro do pai; filhos a indentDe(nw) dela.
      const width = Math.max(nw, nw / 2 + indentDe(nw) + maxChildW)
      sizes[id] = { width, rootX: a === 'DIREITA' ? 0 : width - nw, rootY: 0, height: H + GAP_Y / 2 + stackH }
    } else {
      // Horizontal: pai à esquerda, com o centro dele no meio do primeiro e do último filho.
      const tops = stackTops(ch.map(c => c.height))
      const centers = ch.map((c, k) => tops[k] + c.rootY + card[ids[k]].h / 2)
      const rootY = Math.max(0, (centers[0] + centers[centers.length - 1]) / 2 - H / 2)
      const shift = rootY - ((centers[0] + centers[centers.length - 1]) / 2 - H / 2)
      sizes[id] = { width: nw + GAP_X + maxChildW, rootX: 0, rootY, height: Math.max(stackH + shift, rootY + H) }
    }
  }

  return sizes
}

export interface LayoutOptions {
  /** Raiz em pé no Horizontal (modelo "Pintar uma sala"). Só na visão gráfica; padrão true. */
  raizEmPe?: boolean
}

/**
 * Calcula geometria (x, y, width, height) e conectores SVG para todos os nós.
 * nodeWidths: mapa de larguras reais por nodeId (medidas por texto). Fallback = NODE_W.
 */
export function computeLayout(
  nodes: Record<string, WbsNodeClient>,
  rootId: string | null,
  nodeWidths: Record<string, number> = {},
  nodeHeight: number = NODE_H,
  options: LayoutOptions = {},
): WbsLayoutResult {
  if (!rootId || !nodes[rootId]) {
    return { geometry: {}, connectors: [], bounds: { width: 0, height: 0 } }
  }

  const plano = planejar(rootId, nodes, nodeWidths, nodeHeight, options.raizEmPe ?? true)
  const sizes = buildSubtreeSizes(nodes, plano)
  const geometry: Record<string, WbsNodeGeometry> = {}
  const connectors: WbsConnector[] = []
  const cardOf = (cid: string) => plano.card[cid]

  // Cada item é a caixa da subárvore (canto superior esquerdo).
  const stack: Array<{ id: string; left: number; top: number }> = [{ id: rootId, left: 0, top: 0 }]

  while (stack.length > 0) {
    const { id, left, top } = stack.pop()!
    const node = nodes[id]
    if (!node || geometry[id]) continue

    const size = sizes[id]
    const { w: nw, h: H, vertical } = cardOf(id)
    const x = left + size.rootX
    const y = top + size.rootY
    geometry[id] = { id, x, y, width: nw, height: H, ...(vertical ? { vertical: true } : {}) }

    const ch = visibleChildren(node, nodes)
    if (ch.length === 0) continue
    const a = plano.arranjo[id]

    if (a === 'LADO') {
      const totalW = ch.reduce((s, c) => s + sizes[c.id].width, 0) + GAP_X * (ch.length - 1)
      const childTop = y + H + GAP_Y
      const pCx = x + nw / 2
      const midY = y + H + GAP_Y / 2
      let subtreeLeft = left + (size.width - totalW) / 2

      for (const c of ch) {
        const cs = sizes[c.id]
        stack.push({ id: c.id, left: subtreeLeft, top: childTop })
        const cCx = subtreeLeft + cs.rootX + cardOf(c.id).w / 2
        connectors.push({ fromId: id, toId: c.id, path: `M ${pCx} ${y + H} V ${midY} H ${cCx} V ${childTop + cs.rootY}` })
        subtreeLeft += cs.width + GAP_X
      }
    } else if (a === 'PILHA_PADRAO' || a === 'DIREITA' || a === 'ESQUERDA') {
      // Linha desce do pai; um ramal entra em cada filho (o último fecha a linha).
      const direita = a !== 'ESQUERDA'
      const spineX = a === 'PILHA_PADRAO' ? x + PADRAO_INSET : x + nw / 2
      const recuo = a === 'PILHA_PADRAO' ? PADRAO_GAP : indentDe(nw)
      let childTop = y + H + GAP_Y / 2

      for (const c of ch) {
        const cs = sizes[c.id]
        const cLeft = direita ? spineX + recuo : spineX - recuo - cs.width
        stack.push({ id: c.id, left: cLeft, top: childTop })
        const cx = cLeft + cs.rootX
        const mid = childTop + cs.rootY + cardOf(c.id).h / 2
        const edge = direita ? cx : cx + cardOf(c.id).w
        connectors.push({ fromId: id, toId: c.id, path: `M ${spineX} ${y + H} V ${mid} H ${edge}` })
        childTop += cs.height + GAP_STACK
      }
    } else {
      // Horizontal: sai do meio-direito do pai até a linha vertical, que liga os filhos.
      const spineX = x + nw + GAP_X / 2
      const pMid = y + H / 2
      const tops = stackTops(ch.map(c => sizes[c.id].height))
      const centers = ch.map((c, k) => tops[k] + sizes[c.id].rootY + cardOf(c.id).h / 2)
      // A coluna de filhos desce junto quando o pai não cabe acima do primeiro filho.
      const shift = size.rootY - ((centers[0] + centers[centers.length - 1]) / 2 - H / 2)

      ch.forEach((c, k) => {
        const cs = sizes[c.id]
        const cLeft = x + nw + GAP_X
        const cTop = top + shift + tops[k]
        stack.push({ id: c.id, left: cLeft, top: cTop })
        const mid = cTop + cs.rootY + cardOf(c.id).h / 2
        connectors.push({ fromId: id, toId: c.id, path: `M ${x + nw} ${pMid} H ${spineX} V ${mid} H ${cLeft + cs.rootX}` })
      })
    }
  }

  let maxX = 0
  let maxY = 0
  for (const g of Object.values(geometry)) {
    if (g.x + g.width > maxX) maxX = g.x + g.width
    if (g.y + g.height > maxY) maxY = g.y + g.height
  }

  return { geometry, connectors, bounds: { width: maxX, height: maxY + PILL_OVERHANG } }
}
