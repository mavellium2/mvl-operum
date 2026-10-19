import { describe, it, expect } from 'vitest'
import {
  computeLayout, resolveDropPosition, formatoDaEap, formatoDaFase,
  NODE_W, NODE_H, GAP_X, GAP_Y, GAP_STACK, indentDe, PILL_OVERHANG, PADRAO_INSET, PADRAO_GAP,
} from '@/lib/wbsLayout'
import type { WbsNodeClient, WbsLayoutOrientation, WbsNodeGeometry } from '@/types/wbs'

const S = {
  backgroundColor: '#fff', borderColor: '#000', textColor: '#000',
  borderWidth: 1, fontSize: 14, borderRadius: 4,
}

function node(
  id: string,
  parentId: string | null,
  order: number,
  childrenIds: string[],
  layout: WbsLayoutOrientation = 'LADO_A_LADO',
  collapsed = false
): WbsNodeClient {
  return { id, parentId, order, code: '', title: id, layout, collapsed, style: S, properties: {}, childrenIds }
}

/** Monta a árvore a partir de { pai: [filhos] }; o layout da raiz é o formato da EAP. */
function arvore(filhos: Record<string, string[]>, formato: WbsLayoutOrientation = 'LADO_A_LADO', fases: Record<string, WbsLayoutOrientation> = {}) {
  const nodes: Record<string, WbsNodeClient> = { r: node('r', null, 0, [], formato) }
  const visitar = (pai: string) => {
    for (const [k, id] of (filhos[pai] ?? []).entries()) {
      nodes[id] = node(id, pai, k, [], fases[id] ?? 'LADO_A_LADO')
      nodes[pai].childrenIds.push(id)
      visitar(id)
    }
  }
  visitar('r')
  return nodes
}
const centroY = (g: WbsNodeGeometry) => g.y + g.height / 2

function semSobreposicao(geometry: Record<string, WbsNodeGeometry>) {
  const cards = Object.values(geometry)
  for (const [i, a] of cards.entries()) {
    for (const b of cards.slice(i + 1)) {
      const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
      expect(overlap, `${a.id} sobrepõe ${b.id}`).toBe(false)
    }
  }
}

describe('computeLayout', () => {
  it('retorna estruturas vazias para rootId null', () => {
    const r = computeLayout({}, null)
    expect(r.geometry).toEqual({})
    expect(r.connectors).toEqual([])
    expect(r.bounds).toEqual({ width: 0, height: 0 })
  })

  it('nó único fica em (0, 0)', () => {
    const { geometry } = computeLayout({ r: node('r', null, 0, []) }, 'r')
    expect(geometry.r).toMatchObject({ x: 0, y: 0, width: NODE_W, height: NODE_H })
  })

  // ── Padrão (modelo do Churrasco) ──────────────────────────────────────────

  describe('Padrão', () => {
    // r → Comidas (Carnes → 2 folhas, Pão de alho) e Utensílios (2 folhas)
    const make = () => arvore({ r: ['com', 'ute'], com: ['car', 'pao'], car: ['lin', 'cor'], ute: ['peg', 'tal'] })

    it('fases lado a lado embaixo da raiz', () => {
      const { geometry } = computeLayout(make(), 'r')
      expect(geometry.com.y).toBe(NODE_H + GAP_Y)
      expect(geometry.ute.y).toBe(geometry.com.y)
      expect(geometry.ute.x).toBeGreaterThan(geometry.com.x + NODE_W)
    })

    it('item com filhos que têm filhos: filhos lado a lado (Comidas → Carnes, Pão de alho)', () => {
      const { geometry } = computeLayout(make(), 'r')
      expect(geometry.car.y).toBe(geometry.pao.y)
      expect(geometry.pao.x).toBeGreaterThanOrEqual(geometry.car.x + NODE_W)
    })

    it('mantém filhos folhas lado a lado e liga pelo centro inferior do pai', () => {
      const { geometry: g, connectors } = computeLayout(make(), 'r')
      expect(g.lin.y).toBe(g.cor.y)
      expect(g.cor.x).toBeGreaterThanOrEqual(g.lin.x + NODE_W)
      const parent = g.car, child = g.cor
      expect(connectors.find(c => c.toId === 'cor')!.path).toBe(`M ${parent.x + parent.width / 2} ${parent.y + parent.height} V ${parent.y + parent.height + GAP_Y / 2} H ${child.x + child.width / 2} V ${child.y}`)
    })

    it('fases sem itens já nascem horizontais e recolher não muda o formato', () => {
      const nodes = arvore({ r: ['f1', 'f2'], f1: ['a'], f2: [] })
      nodes.f1.collapsed = true
      const { geometry: g } = computeLayout(nodes, 'r')
      expect(g.f1.y).toBe(g.f2.y)
      expect(g.f2.x).toBeGreaterThan(g.f1.x)
      expect(g.a).toBeUndefined()
      const folhas = computeLayout(arvore({ r: ['f1', 'f2'] }), 'r').geometry
      expect(folhas.f1.y).toBe(folhas.f2.y)
    })

    it('nada se sobrepõe', () => semSobreposicao(computeLayout(make(), 'r').geometry))
  })

  // ── Esquerda (Projeto Café, Citrolente) e Direita (vara de pesca) ─────────

  describe('Esquerda', () => {
    const make = () => arvore({ r: ['f1', 'f2'], f1: ['a', 'b'], f2: ['m'], m: ['m1', 'm2'] }, 'ESQUERDA')

    it('fases lado a lado embaixo da raiz', () => {
      const { geometry } = computeLayout(make(), 'r')
      expect(geometry.f1.y).toBe(NODE_H + GAP_Y)
      expect(geometry.f2.y).toBe(geometry.f1.y)
    })

    it('filhos da fase empilhados à esquerda da linha que desce do meio dela', () => {
      const { geometry, connectors } = computeLayout(make(), 'r')
      const spine = geometry.f1.x + NODE_W / 2
      expect(geometry.a.x + NODE_W).toBe(spine - indentDe(NODE_W))
      expect(geometry.b.x).toBe(geometry.a.x)
      expect(geometry.b.y).toBe(geometry.a.y + NODE_H + GAP_STACK)
      expect(connectors.find(c => c.toId === 'a')!.path).toBe(`M ${spine} ${geometry.f1.y + NODE_H} V ${centroY(geometry.a)} H ${geometry.a.x + NODE_W}`)
    })

    it('4º nível também à esquerda (1.5.1 Materiais → 1.5.1.1, 1.5.1.2)', () => {
      const { geometry } = computeLayout(make(), 'r')
      expect(geometry.m1.x + NODE_W).toBe(geometry.m.x + NODE_W / 2 - indentDe(NODE_W))
      expect(geometry.m2.y).toBeGreaterThan(geometry.m1.y)
      semSobreposicao(geometry)
    })
  })

  describe('Direita', () => {
    it('fases lado a lado; filhos à direita da linha que desce do meio da fase', () => {
      const { geometry, connectors } = computeLayout(arvore({ r: ['f1', 'f2'], f1: ['a', 'b'], f2: ['c'] }, 'DIREITA'), 'r')
      expect(geometry.f2.y).toBe(geometry.f1.y)
      const spine = geometry.f1.x + NODE_W / 2
      expect(geometry.a.x).toBe(spine + indentDe(NODE_W))
      expect(geometry.a.y).toBe(geometry.f1.y + NODE_H + GAP_Y / 2)
      expect(connectors.find(c => c.toId === 'b')!.path).toBe(`M ${spine} ${geometry.f1.y + NODE_H} V ${centroY(geometry.b)} H ${geometry.b.x}`)
      semSobreposicao(geometry)
    })

    it('recuo na proporção do ícone: filho começa a 11/12 da largura do pai', () => {
      expect(NODE_W / 2 + indentDe(NODE_W)).toBe(Math.round(NODE_W * 11 / 12))
    })
  })

  // ── Horizontal (Pintar uma sala) ──────────────────────────────────────────

  describe('Horizontal', () => {
    const make = () => arvore({ r: ['f1', 'f2', 'f3'], f1: ['a', 'b'], f3: ['g'], g: ['g1', 'g2'] }, 'HORIZONTAL')

    it('raiz em pé à esquerda: largura da altura do card e texto na vertical', () => {
      const { geometry } = computeLayout(make(), 'r', { r: 200 })
      expect(geometry.r).toMatchObject({ x: 0, width: NODE_H, height: 200, vertical: true })
    })

    it('cada nível numa coluna à direita do anterior, com o pai no meio dos filhos', () => {
      const { geometry } = computeLayout(make(), 'r')
      for (const id of ['f1', 'f2', 'f3']) expect(geometry[id].x).toBe(NODE_H + GAP_X)
      expect(geometry.a.x).toBe(geometry.f1.x + NODE_W + GAP_X)
      expect(geometry.g1.x).toBe(geometry.g.x + NODE_W + GAP_X)
      expect(centroY(geometry.f1)).toBe((centroY(geometry.a) + centroY(geometry.b)) / 2)
      expect(centroY(geometry.g)).toBe((centroY(geometry.g1) + centroY(geometry.g2)) / 2)
      expect(centroY(geometry.r)).toBeCloseTo((centroY(geometry.a) + centroY(geometry.g2)) / 2, 5)
      semSobreposicao(geometry)
    })

    it('conector sai do meio-direito do pai, passa pela linha vertical e entra na borda esquerda do filho', () => {
      const { geometry, connectors } = computeLayout(make(), 'r')
      const spine = geometry.f1.x + NODE_W + GAP_X / 2
      expect(connectors.find(c => c.toId === 'b')!.path).toBe(
        `M ${geometry.f1.x + NODE_W} ${centroY(geometry.f1)} H ${spine} V ${centroY(geometry.b)} H ${geometry.b.x}`,
      )
    })

    it('raiz mais alta que os filhos: os filhos descem e nada fica acima de 0', () => {
      const { geometry } = computeLayout(arvore({ r: ['f1'] }, 'HORIZONTAL'), 'r', { r: 400 })
      expect(geometry.r.y).toBe(0)
      expect(centroY(geometry.f1)).toBe(centroY(geometry.r))
    })

    it('raizEmPe: false (cartões detalhados) mantém a raiz deitada', () => {
      const { geometry } = computeLayout(make(), 'r', {}, 162, { raizEmPe: false })
      expect(geometry.r).toMatchObject({ width: NODE_W, height: 162 })
      expect(geometry.r.vertical).toBeUndefined()
    })
  })

  // ── Formato por fase ──────────────────────────────────────────────────────

  describe('formato por fase', () => {
    it('EAP em Padrão com 1.1 à Esquerda e 1.2 à Direita', () => {
      const nodes = arvore({ r: ['f1', 'f2'], f1: ['a', 'b'], a: ['a1'], f2: ['c', 'd'], c: ['c1'] }, 'LADO_A_LADO', { f1: 'ESQUERDA', f2: 'DIREITA' })
      const { geometry } = computeLayout(nodes, 'r')
      expect(geometry.f2.y).toBe(geometry.f1.y)
      expect(geometry.a.x + NODE_W).toBe(geometry.f1.x + NODE_W / 2 - indentDe(NODE_W))
      expect(geometry.a1.x + NODE_W).toBe(geometry.a.x + NODE_W / 2 - indentDe(NODE_W))
      expect(geometry.c.x).toBe(geometry.f2.x + NODE_W / 2 + indentDe(NODE_W))
      expect(geometry.c1.x).toBe(geometry.c.x + NODE_W / 2 + indentDe(NODE_W))
      semSobreposicao(geometry)
    })

    it('fase sem formato próprio segue a EAP; layout guardado abaixo das fases é ignorado', () => {
      const nodes = arvore({ r: ['f1'], f1: ['a', 'b'], a: ['a1', 'a2'] }, 'DIREITA')
      nodes.a.layout = 'LADO_A_LADO'
      const { geometry } = computeLayout(nodes, 'r')
      expect(geometry.a1.x).toBe(geometry.a.x + NODE_W / 2 + indentDe(NODE_W))
      expect(geometry.a2.x).toBe(geometry.a1.x)
    })

    it('no Horizontal o formato da fase não se aplica', () => {
      const nodes = arvore({ r: ['f1'], f1: ['a'] }, 'HORIZONTAL', { f1: 'ESQUERDA' })
      const { geometry } = computeLayout(nodes, 'r')
      expect(geometry.a.x).toBe(geometry.f1.x + NODE_W + GAP_X)
    })
  })

  describe('valores antigos', () => {
    it.each([
      ['HORIZONTAL_TOPO', 'HORIZONTAL'], ['HORIZONTAL_BASE', 'HORIZONTAL'], ['ABAIXO', 'DIREITA'],
      ['ABAIXO_L', 'DIREITA'], ['QUALQUER', 'LADO_A_LADO'], [undefined, 'LADO_A_LADO'],
    ])('%s na raiz → %s', (valor, formato) => expect(formatoDaEap(valor)).toBe(formato))

    it('formato da fase só aceita Esquerda e Direita', () => {
      expect(formatoDaFase('ESQUERDA', 'LADO_A_LADO')).toBe('ESQUERDA')
      expect(formatoDaFase('HORIZONTAL', 'LADO_A_LADO')).toBeNull()
      expect(formatoDaFase('DIREITA', 'HORIZONTAL')).toBeNull()
    })
  })

  // ── Colapsado ────────────────────────────────────────────────────────────────

  describe('collapsed', () => {
    const make = () => {
      const nodes = arvore({ r: ['a', 'b'], a: ['aa'] })
      nodes.a.collapsed = true
      return nodes
    }

    it('nó colapsado não gera filhos na geometria nem conectores para eles', () => {
      const { geometry, connectors } = computeLayout(make(), 'r')
      expect(geometry.a).toBeDefined()
      expect(geometry.aa).toBeUndefined()
      expect(connectors.find(c => c.toId === 'aa')).toBeUndefined()
    })
  })

  it('bounds refletem a extensão máxima da árvore', () => {
    const { geometry, bounds } = computeLayout(arvore({ r: ['a', 'b'] }), 'r')
    const maxRight = Math.max(...Object.values(geometry).map(g => g.x + g.width))
    const maxBottom = Math.max(...Object.values(geometry).map(g => g.y + g.height))
    expect(bounds.width).toBe(maxRight)
    // O bounds reserva a área da pílula de colapso que fica meio para fora do card.
    expect(bounds.height).toBe(maxBottom + PILL_OVERHANG)
  })
})

describe('resolveDropPosition', () => {
  const g = { x: 100, y: 200, width: 160, height: NODE_H }
  const midX = g.x + g.width / 2
  const midY = g.y + g.height / 2

  it('corpo do card → INSIDE (filho)', () => {
    expect(resolveDropPosition(midX, midY, g)).toBe('INSIDE')
  })

  it('abaixo do card (faixa de filhos) → INSIDE', () => {
    expect(resolveDropPosition(midX, g.y + g.height + 10, g)).toBe('INSIDE')
  })

  it('borda esquerda → BEFORE (irmão antes)', () => {
    expect(resolveDropPosition(g.x + 5, midY, g)).toBe('BEFORE')
  })

  it('borda direita → AFTER (irmão depois)', () => {
    expect(resolveDropPosition(g.x + g.width - 5, midY, g)).toBe('AFTER')
  })

  it('fora de qualquer zona → null', () => {
    expect(resolveDropPosition(midX, g.y - 40, g)).toBeNull()
    expect(resolveDropPosition(g.x + g.width + 40, midY, g)).toBeNull()
    expect(resolveDropPosition(midX, g.y + g.height + 40, g)).toBeNull()
  })
})


it.each(['LADO_A_LADO', 'ESQUERDA', 'DIREITA', 'HORIZONTAL'] as WbsLayoutOrientation[])(
  'formato %s com fases mistas: tudo dentro dos bounds e sem sobreposição, com cards largos e altos',
  formato => {
    const nodes: Record<string, WbsNodeClient> = {}, widths: Record<string, number> = {}
    const fases: WbsLayoutOrientation[] = ['LADO_A_LADO', 'ESQUERDA', 'DIREITA']
    for (let i = 0; i < 60; i++) {
      const id = String(i), parent = i === 0 ? null : String(Math.floor((i - 1) / 3))
      nodes[id] = node(id, parent, i, [], i === 0 ? formato : fases[(i * 7) % 3]); widths[id] = 120 + (i % 5) * 70
      if (parent) nodes[parent].childrenIds.push(id)
    }
    for (const altura of [NODE_H, 162]) {
      const { geometry, bounds } = computeLayout(nodes, '0', widths, altura)
      for (const a of Object.values(geometry)) {
        expect(a.x).toBeGreaterThanOrEqual(0)
        expect(a.y).toBeGreaterThanOrEqual(0)
        expect(a.x + a.width).toBeLessThanOrEqual(bounds.width)
        expect(a.y + a.height).toBeLessThanOrEqual(bounds.height)
      }
      semSobreposicao(geometry)
    }
  },
)

it('regressão 16/10: EAP antiga com todos os nós em DIREITA muda de formato depois do Organizar universal', async () => {
  const { wbsReducer } = await import('@/lib/wbsReducer')
  const nodes = arvore({ r: ['f1', 'f2'], f1: ['a', 'b'], f2: ['c'] })
  for (const n of Object.values(nodes)) n.layout = 'DIREITA'
  const base = {
    nodes, rootId: 'r', selectedNodeIds: [], editingNodeId: null, focusNodeId: null,
    clipboard: { nodes: [], copiedStyle: null, actionType: null }, history: { past: [], future: [] },
    viewport: { zoom: 1, panX: 0, panY: 0 }, sync: { status: 'IDLE' as const, lastSavedAt: null, serverVersion: 0 },
  }
  const s = wbsReducer(base, { type: 'SET_EAP_FORMAT', payload: { layout: 'ESQUERDA' } })
  const { geometry } = computeLayout(s.nodes, 'r')
  expect(geometry.a.x + NODE_W).toBe(geometry.f1.x + NODE_W / 2 - indentDe(NODE_W))
})
