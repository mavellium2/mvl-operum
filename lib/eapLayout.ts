import type { EapLayoutResult, EapNode } from '@/types/eap'

/**
 * Layout FIXO de impressão da EAP gráfica (SPEC §7, §13, §14).
 *
 * Árvore "tidy" (organograma): raiz no topo-centro; cada nível é distribuído
 * lado a lado; conectores em cotovelo (descida vertical + barra horizontal +
 * descida ao filho). As coordenadas são independentes de tela — a página SVG
 * usa viewBox e é dimensionada para caber no A4 tanto no editor quanto no PDF.
 *
 * Função pura e iterativa. Testada em __tests__/unit/eap/eapLayout.test.ts.
 */

export const EAP_BOX_W = 150
export const EAP_BOX_H = 48
export const EAP_GAP_X = 40
export const EAP_GAP_Y = 56

interface SubtreeSize {
  width: number
  height: number
}

function childrenOf(node: EapNode): EapNode[] {
  return node.children ?? []
}

/** Largura + altura da subárvore de cada nó, em pós-ordem (iterativo). */
function buildSubtreeSizes(rootId: string, nodes: Record<string, EapNode>): Record<string, SubtreeSize> {
  const preOrder: string[] = []
  const seen = new Set<string>()
  const q: string[] = [rootId]

  while (q.length > 0) {
    const id = q.shift()!
    const node = nodes[id]
    if (!node || seen.has(id)) continue
    seen.add(id)
    preOrder.push(id)
    for (const c of childrenOf(node)) q.push(c.id)
  }

  const sizes: Record<string, SubtreeSize> = {}

  for (let i = preOrder.length - 1; i >= 0; i--) {
    const id = preOrder[i]
    const node = nodes[id]
    const ch = childrenOf(node)

    if (ch.length === 0) {
      sizes[id] = { width: EAP_BOX_W, height: EAP_BOX_H }
      continue
    }

    const totalW =
      ch.reduce((s, c) => s + (sizes[c.id]?.width ?? EAP_BOX_W), 0) +
      EAP_GAP_X * (ch.length - 1)
    const maxH = Math.max(...ch.map(c => sizes[c.id]?.height ?? EAP_BOX_H))
    sizes[id] = {
      width: Math.max(EAP_BOX_W, totalW),
      height: EAP_BOX_H + EAP_GAP_Y + maxH,
    }
  }

  return sizes
}

/**
 * Calcula geometria + conectores da árvore inteira.
 * Root único do documento; se houver múltiplas raízes, trata como subárvores
 * consecutivas (caso extremo de segurança).
 */
export function computeEapLayout(roots: EapNode[]): EapLayoutResult {
  if (roots.length === 0) {
    return { geometry: {}, connectors: [], bounds: { width: 0, height: 0 } }
  }

  const allSizes: Record<string, SubtreeSize> = {}
  const geometry: EapLayoutResult['geometry'] = {}
  const connectors: EapLayoutResult['connectors'] = []
  let maxX = 0
  let maxY = 0

  // Posiciona cada raiz lado a lado e processa suas subárvores.
  const rootsSizes = roots.map(r => {
    const sizes = buildSubtreeSizes(r.id, indexTree(roots))
    Object.assign(allSizes, sizes)
    return sizes[r.id] ?? { width: EAP_BOX_W, height: EAP_BOX_H }
  })
  const totalRootsW = rootsSizes.reduce((s, sz) => s + sz.width, 0) + EAP_GAP_X * (roots.length - 1)

  let cursorX = 0
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]
    const subtreeW = rootsSizes[i].width
    const rootX = cursorX + subtreeW / 2 - EAP_BOX_W / 2
    cursorX += subtreeW + EAP_GAP_X

    const stack: Array<{ id: string; x: number; y: number }> = [{ id: root.id, x: rootX, y: 0 }]
    const idMap = indexTree(roots)

    while (stack.length > 0) {
      const { id, x, y } = stack.pop()!
      const node = idMap[id]
      if (!node || geometry[id]) continue

      geometry[id] = { id, x, y, width: EAP_BOX_W, height: EAP_BOX_H, isRoot: i === 0 && root.id === id && node.level === 1 }
      if (x + EAP_BOX_W > maxX) maxX = x + EAP_BOX_W
      if (y + EAP_BOX_H > maxY) maxY = y + EAP_BOX_H

      const ch = childrenOf(node)
      if (ch.length === 0) continue

      const childWidths = ch.map(c => allSizes[c.id]?.width ?? EAP_BOX_W)
      const totalW = childWidths.reduce((s, w) => s + w, 0) + EAP_GAP_X * (ch.length - 1)
      const childY = y + EAP_BOX_H + EAP_GAP_Y
      const pCx = x + EAP_BOX_W / 2
      const midY = y + EAP_BOX_H + EAP_GAP_Y / 2
      let subtreeLeft = x + EAP_BOX_W / 2 - totalW / 2

      for (let k = 0; k < ch.length; k++) {
        const sw = childWidths[k]
        const chCx = subtreeLeft + sw / 2
        const childX = chCx - EAP_BOX_W / 2
        stack.push({ id: ch[k].id, x: childX, y: childY })

        connectors.push({
          fromId: id,
          toId: ch[k].id,
          path: `M ${pCx} ${y + EAP_BOX_H} V ${midY} H ${chCx} V ${childY}`,
        })
        subtreeLeft += sw + EAP_GAP_X
      }
    }
  }

  return {
    geometry,
    connectors,
    bounds: { width: Math.max(totalRootsW, maxX), height: maxY },
  }
}

function indexTree(roots: EapNode[]): Record<string, EapNode> {
  const map: Record<string, EapNode> = {}
  const stack: EapNode[] = [...roots]
  while (stack.length > 0) {
    const node = stack.pop()!
    map[node.id] = node
    for (const c of node.children ?? []) stack.push(c)
  }
  return map
}

/**
 * Escala para encaixar a árvore na área disponível do A4 (mm → px na altura).
 * Retorna o menor fator que garante largura E altura dentro da área.
 */
export function fitScale(
  treeWidth: number,
  treeHeight: number,
  availWidth: number,
  availHeight: number,
): number {
  if (treeWidth <= 0 || treeHeight <= 0) return 1
  const sx = availWidth / treeWidth
  const sy = availHeight / treeHeight
  const scale = Math.min(sx, sy, 1)
  return scale > 0 ? scale : 1
}
// ── Layout do modelo da EAP gráfica (colunas) ────────────────────────────────

/**
 * Layout do modelo de EAP gráfica do professor: raiz no topo, nível 2 lado a
 * lado e, abaixo de cada bloco do nível 2, todos os descendentes empilhados em
 * coluna (pré-ordem), ligados por uma linha vertical à esquerda.
 * Testado em __tests__/unit/eap/eapColumnLayout.test.ts.
 */
export const EAP_COL_BOX_W = 150
export const EAP_COL_GAP_X = 26
export const EAP_COL_INDENT = 12
export const EAP_COL_GAP_Y = 8
export const EAP_COL_LINE_H = 11
export const EAP_COL_PAD_Y = 6
export const EAP_COL_MAX_CHARS = 28
export const EAP_COL_MAX_LINES = 4

/** Texto do bloco: a raiz mostra só o título; os demais, "código título". */
export function eapBoxLabel(node: EapNode, isRoot: boolean): string {
  const title = (node.title || '').trim()
  return isRoot || !node.code ? title : `${node.code} ${title}`
}

/** Quebra o texto em linhas de até `maxChars`; o excedente vira reticências. */
export function eapWrapLines(text: string, maxChars = EAP_COL_MAX_CHARS, maxLines = EAP_COL_MAX_LINES): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
    } else current = candidate
  }
  if (current) lines.push(current)
  const cut = lines.map(l => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l))
  if (cut.length <= maxLines) return cut
  const kept = cut.slice(0, maxLines)
  kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1).trimEnd()}…`
  return kept
}

/** Medidas do layout em colunas; o documento estreita os blocos quando há muitas fases. */
export interface EapColunasOpcoes {
  boxW?: number
  gapX?: number
  maxChars?: number
  maxLines?: number
}

/**
 * Medidas para `n` fases caberem em `larguraPx` sem encolher a fonte: blocos
 * mais estreitos (até 70 px) e o texto quebrado em mais linhas.
 */
export function eapColunasParaLargura(n: number, larguraPx: number): Required<EapColunasOpcoes> {
  if (n <= 0) return { boxW: EAP_COL_BOX_W, gapX: EAP_COL_GAP_X, maxChars: EAP_COL_MAX_CHARS, maxLines: EAP_COL_MAX_LINES }
  const largoPadrao = n * (EAP_COL_INDENT + EAP_COL_BOX_W) + (n - 1) * EAP_COL_GAP_X
  if (largoPadrao <= larguraPx) return { boxW: EAP_COL_BOX_W, gapX: EAP_COL_GAP_X, maxChars: EAP_COL_MAX_CHARS, maxLines: EAP_COL_MAX_LINES }
  const gapX = 10
  const boxW = Math.max(70, Math.min(EAP_COL_BOX_W, Math.floor((larguraPx - (n - 1) * gapX) / n - EAP_COL_INDENT)))
  // ~5,3 px por caractere na fonte de 9 px.
  return { boxW, gapX, maxChars: Math.max(12, Math.floor(boxW / 5.3)), maxLines: 6 }
}

function boxHeight(node: EapNode, isRoot: boolean, o: Required<EapColunasOpcoes>): number {
  return eapWrapLines(eapBoxLabel(node, isRoot), o.maxChars, o.maxLines).length * EAP_COL_LINE_H + EAP_COL_PAD_Y * 2
}

/** Descendentes em pré-ordem (iterativo). */
function descendants(node: EapNode): EapNode[] {
  const out: EapNode[] = []
  const stack = [...(node.children ?? [])].reverse()
  while (stack.length > 0) {
    const current = stack.pop()!
    out.push(current)
    for (const c of [...(current.children ?? [])].reverse()) stack.push(c)
  }
  return out
}

export function computeEapColumnLayout(roots: EapNode[], opcoes: EapColunasOpcoes = {}): EapLayoutResult {
  const o: Required<EapColunasOpcoes> = {
    boxW: opcoes.boxW ?? EAP_COL_BOX_W, gapX: opcoes.gapX ?? EAP_COL_GAP_X,
    maxChars: opcoes.maxChars ?? EAP_COL_MAX_CHARS, maxLines: opcoes.maxLines ?? EAP_COL_MAX_LINES,
  }
  const BOX_W = o.boxW
  const GAP_X = o.gapX
  const geometry: EapLayoutResult['geometry'] = {}
  const connectors: EapLayoutResult['connectors'] = []
  const colW = EAP_COL_INDENT + BOX_W
  let offsetX = 0
  let maxBottom = 0

  for (const root of roots) {
    const columns = root.children ?? []
    const blockW = Math.max(BOX_W, columns.length * colW + Math.max(0, columns.length - 1) * GAP_X)
    const rootH = boxHeight(root, true, o)
    const rootX = offsetX + (blockW - BOX_W) / 2
    geometry[root.id] = { id: root.id, x: rootX, y: 0, width: BOX_W, height: rootH, isRoot: true }
    maxBottom = Math.max(maxBottom, rootH)

    if (columns.length > 0) {
      const busY = rootH + 12
      const headerY = busY + 12
      const headerH = Math.max(...columns.map(c => boxHeight(c, false, o)))
      const rootCx = rootX + BOX_W / 2

      columns.forEach((col, i) => {
        const colX = offsetX + i * (colW + GAP_X)
        const cx = colX + BOX_W / 2
        geometry[col.id] = { id: col.id, x: colX, y: headerY, width: BOX_W, height: headerH, isRoot: false }
        connectors.push({ fromId: root.id, toId: col.id, path: `M ${rootCx} ${rootH} V ${busY} H ${cx} V ${headerY}` })

        const lineX = colX + EAP_COL_INDENT / 2
        let y = headerY + headerH + EAP_COL_GAP_Y
        for (const item of descendants(col)) {
          const h = boxHeight(item, false, o)
          geometry[item.id] = { id: item.id, x: colX + EAP_COL_INDENT, y, width: BOX_W, height: h, isRoot: false }
          connectors.push({ fromId: col.id, toId: item.id, path: `M ${lineX} ${headerY + headerH} V ${y + h / 2} H ${colX + EAP_COL_INDENT}` })
          y += h + EAP_COL_GAP_Y
        }
        maxBottom = Math.max(maxBottom, y - EAP_COL_GAP_Y, headerY + headerH)
      })
    }
    offsetX += blockW + GAP_X * 2
  }

  const width = roots.length > 0 ? offsetX - GAP_X * 2 : 0
  return { geometry, connectors, bounds: { width, height: roots.length > 0 ? maxBottom : 0 } }
}
