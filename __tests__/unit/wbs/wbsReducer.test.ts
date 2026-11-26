import { describe, it, expect } from 'vitest'
import { wbsReducer, DEFAULT_STYLE } from '@/lib/wbsReducer'
import type { WbsAction } from '@/lib/wbsReducer'
import type { WbsTreeState, WbsNodeClient } from '@/types/wbs'

type State = WbsTreeState
type Action = WbsAction

function node(
  id: string,
  parentId: string | null,
  order: number,
  childrenIds: string[],
  code = ''
): WbsNodeClient {
  return {
    id, parentId, order, code, title: id,
    layout: 'ABAIXO', collapsed: false,
    style: { ...DEFAULT_STYLE }, properties: {}, childrenIds,
  }
}

function makeState(
  nodes: Record<string, WbsNodeClient>,
  rootId: string | null = 'r'
): State {
  return {
    nodes,
    rootId,
    selectedNodeIds: [],
    editingNodeId: null,
    focusNodeId: null,
    clipboard: { nodes: [], copiedStyle: null, actionType: null },
    history: { past: [], future: [] },
    viewport: { zoom: 1, panX: 0, panY: 0 },
    sync: { status: 'IDLE', lastSavedAt: null, serverVersion: 0 },
  }
}

const act = (s: State, a: Action) => wbsReducer(s, a)

/** ID do nó recém-criado (diff dos mapas). */
function newId(prev: State, next: State): string {
  const prevIds = new Set(Object.keys(prev.nodes))
  return Object.keys(next.nodes).find(id => !prevIds.has(id))!
}

// ── INSERT_CHILD ─────────────────────────────────────────────────────────────

describe('INSERT_CHILD', () => {
  const base = makeState({ r: node('r', null, 0, [], '1') })

  it('cria filho com parentId correto', () => {
    const s = act(base, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    expect(s.nodes[newId(base, s)].parentId).toBe('r')
  })

  it('filho recebe order=0 quando pai vazio', () => {
    const s = act(base, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    expect(s.nodes[newId(base, s)].order).toBe(0)
  })

  it('filho recebe code "1.1"', () => {
    const s = act(base, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    expect(s.nodes[newId(base, s)].code).toBe('1.1')
  })

  it('segundo filho recebe code "1.2"', () => {
    const s1 = act(base, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    const s2 = act(s1, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    expect(s2.nodes[s2.nodes.r.childrenIds[1]].code).toBe('1.2')
  })

  it('pai atualiza childrenIds', () => {
    const s = act(base, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    expect(s.nodes.r.childrenIds).toHaveLength(1)
  })

  it('seleciona o nó recém-criado e entra em edição', () => {
    const s = act(base, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    const id = newId(base, s)
    expect(s.selectedNodeIds).toEqual([id])
    expect(s.editingNodeId).toBe(id)
  })

  it('empilha no history', () => {
    const s = act(base, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    expect(s.history.past).toHaveLength(1)
  })

  it('ignora parentId inexistente', () => {
    const s = act(base, { type: 'INSERT_CHILD', payload: { parentId: 'ghost' } })
    expect(s).toBe(base)
  })
})

// ── INSERT_SIBLING ───────────────────────────────────────────────────────────

describe('INSERT_SIBLING', () => {
  const base = makeState({
    r: node('r', null, 0, ['a'], '1'),
    a: node('a', 'r', 0, [], '1.1'),
  })

  it('novo irmão inserido após o selecionado (order=1)', () => {
    const s = act(base, { type: 'INSERT_SIBLING', payload: { siblingId: 'a' } })
    expect(s.nodes[newId(base, s)].order).toBe(1)
  })

  it('novo irmão recebe code "1.2"', () => {
    const s = act(base, { type: 'INSERT_SIBLING', payload: { siblingId: 'a' } })
    expect(s.nodes[newId(base, s)].code).toBe('1.2')
  })

  it('irmãos posteriores têm orders reajustados', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const s = act(s0, { type: 'INSERT_SIBLING', payload: { siblingId: 'a' } })
    expect(s.nodes.b.order).toBe(2)
    expect(s.nodes.b.code).toBe('1.3')
  })

  it('seleciona o irmão recém-criado e entra em edição', () => {
    const s = act(base, { type: 'INSERT_SIBLING', payload: { siblingId: 'a' } })
    const id = newId(base, s)
    expect(s.selectedNodeIds).toEqual([id])
    expect(s.editingNodeId).toBe(id)
  })

  it('não insere irmão da raiz', () => {
    const s0 = makeState({ r: node('r', null, 0, [], '1') })
    expect(act(s0, { type: 'INSERT_SIBLING', payload: { siblingId: 'r' } })).toBe(s0)
  })
})

// ── DELETE_NODE ──────────────────────────────────────────────────────────────

describe('DELETE_NODE', () => {
  it('remove o nó do mapa', () => {
    const s0 = makeState({ r: node('r', null, 0, ['a'], '1'), a: node('a', 'r', 0, [], '1.1') })
    expect(act(s0, { type: 'DELETE_NODE', payload: { nodeId: 'a' } }).nodes.a).toBeUndefined()
  })

  it('cascata: remove subárvore inteira', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
    })
    const s = act(s0, { type: 'DELETE_NODE', payload: { nodeId: 'a' } })
    expect(s.nodes.a).toBeUndefined()
    expect(s.nodes.aa).toBeUndefined()
  })

  it('renumera irmãos remanescentes sem lacunas', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b', 'c'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
      c: node('c', 'r', 2, [], '1.3'),
    })
    const s = act(s0, { type: 'DELETE_NODE', payload: { nodeId: 'b' } })
    expect(s.nodes.c.order).toBe(1)
    expect(s.nodes.c.code).toBe('1.2')
    expect(s.nodes.a.order).toBe(0)
  })

  it('atualiza childrenIds do pai', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const s = act(s0, { type: 'DELETE_NODE', payload: { nodeId: 'a' } })
    expect(s.nodes.r.childrenIds).toEqual(['b'])
  })

  it('ignora nodeId inexistente', () => {
    const s0 = makeState({ r: node('r', null, 0, [], '1') })
    expect(act(s0, { type: 'DELETE_NODE', payload: { nodeId: 'ghost' } })).toBe(s0)
  })

  it('regressão lexical: 11 irmãos → delete do 6º → renumeração numérica', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `c${i}`)
    const children = ids.reduce<Record<string, WbsNodeClient>>((acc, id, i) => {
      acc[id] = node(id, 'r', i, [], `1.${i + 1}`)
      return acc
    }, {})
    const s0 = makeState({ r: node('r', null, 0, ids, '1'), ...children })
    const s = act(s0, { type: 'DELETE_NODE', payload: { nodeId: 'c5' } })
    expect(s.nodes.c6.order).toBe(5)
    expect(s.nodes.c6.code).toBe('1.6')
    expect(s.nodes.c10.order).toBe(9)
    expect(s.nodes.c10.code).toBe('1.10')
  })
})

// ── DELETE_NODES ─────────────────────────────────────────────────────────────

describe('DELETE_NODES', () => {
  it('remove todos os selecionados (com subárvores) e renumera os irmãos', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b', 'c'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
      b: node('b', 'r', 1, [], '1.2'),
      c: node('c', 'r', 2, [], '1.3'),
    })
    const s = act(s0, { type: 'DELETE_NODES', payload: { nodeIds: ['a', 'b'] } })
    expect(s.nodes.a).toBeUndefined()
    expect(s.nodes.aa).toBeUndefined()
    expect(s.nodes.b).toBeUndefined()
    expect(s.nodes.c).toBeDefined()
    expect(s.nodes.r.childrenIds).toEqual(['c'])
    expect(s.nodes.c.order).toBe(0)
    expect(s.nodes.c.code).toBe('1.1')
  })

  it('nunca exclui o card raiz, mesmo selecionado', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
    }, 'r')
    const s = act(s0, { type: 'DELETE_NODES', payload: { nodeIds: ['r', 'a'] } })
    expect(s.nodes.r).toBeDefined()
    expect(s.nodes.a).toBeUndefined()
  })

  it('no-op quando só o card raiz está selecionado', () => {
    const s0 = makeState({ r: node('r', null, 0, [], '1') }, 'r')
    expect(act(s0, { type: 'DELETE_NODES', payload: { nodeIds: ['r'] } })).toBe(s0)
  })

  it('limpa da seleção apenas os nós que foram excluídos', () => {
    const s0 = {
      ...makeState({
        r: node('r', null, 0, ['a', 'b'], '1'),
        a: node('a', 'r', 0, [], '1.1'),
        b: node('b', 'r', 1, [], '1.2'),
      }, 'r'),
      selectedNodeIds: ['r', 'a', 'b'],
    }
    const s = act(s0, { type: 'DELETE_NODES', payload: { nodeIds: ['r', 'a', 'b'] } })
    expect(s.selectedNodeIds).toEqual(['r'])
  })
})

// ── MOVE_NODE ────────────────────────────────────────────────────────────────

describe('MOVE_NODE', () => {
  it('rejeita ciclo: target é descendente do nó', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
    })
    expect(act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'a', targetId: 'aa', position: 'INSIDE' } })).toBe(s0)
  })

  it('rejeita mover nó para ele mesmo', () => {
    const s0 = makeState({ r: node('r', null, 0, ['a'], '1'), a: node('a', 'r', 0, [], '1.1') })
    expect(act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'a', targetId: 'a', position: 'INSIDE' } })).toBe(s0)
  })

  it('INSIDE: nó vira filho do target', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const s = act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'a', targetId: 'b', position: 'INSIDE' } })
    expect(s.nodes.a.parentId).toBe('b')
    expect(s.nodes.b.childrenIds).toContain('a')
  })

  it('BEFORE: reordena corretamente', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b', 'c'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
      c: node('c', 'r', 2, [], '1.3'),
    })
    // c BEFORE a → [c, a, b]
    const s = act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'c', targetId: 'a', position: 'BEFORE' } })
    expect(s.nodes.c.order).toBe(0)
    expect(s.nodes.a.order).toBe(1)
    expect(s.nodes.b.order).toBe(2)
  })

  it('AFTER: reordena corretamente', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b', 'c'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
      c: node('c', 'r', 2, [], '1.3'),
    })
    // a AFTER c → [b, c, a]
    const s = act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'a', targetId: 'c', position: 'AFTER' } })
    expect(s.nodes.a.order).toBe(2)
    expect(s.nodes.b.order).toBe(0)
    expect(s.nodes.c.order).toBe(1)
  })

  it('codes recalculados após mover', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const s = act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'b', targetId: 'a', position: 'INSIDE' } })
    expect(s.nodes.b.code).toBe('1.1.1')
  })

  it('pai original tem orders recompactadas', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b', 'c'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, ['ba'], '1.2'),
      c: node('c', 'r', 2, [], '1.3'),
      ba: node('ba', 'b', 0, [], '1.2.1'),
    })
    const s = act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'a', targetId: 'b', position: 'INSIDE' } })
    expect(s.nodes.r.childrenIds).toEqual(['b', 'c'])
    expect(s.nodes.b.order).toBe(0)
    expect(s.nodes.c.order).toBe(1)
  })

  it('empilha no history', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const s = act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'a', targetId: 'b', position: 'INSIDE' } })
    expect(s.history.past).toHaveLength(1)
  })

  it('arrastar nó para a borda da raiz (BEFORE/AFTER) o torna filho, não o órfão', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
    })
    const s = act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'aa', targetId: 'r', position: 'AFTER' } })
    // aa não pode sumir: vira filho da raiz (r não tem pai para BEFORE/AFTER)
    expect(s.nodes.aa).toBeDefined()
    expect(s.nodes.aa.parentId).toBe('r')
    expect(s.nodes.r.childrenIds).toContain('aa')
    expect(s.nodes.aa.code.startsWith('1.')).toBe(true)
  })

  it('arrastar descendente para dentro de um ancestral o torna filho dele', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
    })
    const s = act(s0, { type: 'MOVE_NODE', payload: { nodeId: 'aa', targetId: 'r', position: 'INSIDE' } })
    expect(s.nodes.aa.parentId).toBe('r')
    expect(s.nodes.a.childrenIds).not.toContain('aa')
    expect(s.nodes.r.childrenIds).toContain('aa')
  })
})

// ── MOVE_NODES ───────────────────────────────────────────────────────────────

describe('MOVE_NODES', () => {
  it('move vários irmãos para dentro de um alvo, preservando a ordem', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b', 'c'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
      c: node('c', 'r', 2, ['ca'], '1.3'),
      ca: node('ca', 'c', 0, [], '1.3.1'),
    })
    const s = act(s0, { type: 'MOVE_NODES', payload: { nodeIds: ['a', 'b'], targetId: 'c', position: 'INSIDE' } })
    expect(s.nodes.a.parentId).toBe('c')
    expect(s.nodes.b.parentId).toBe('c')
    expect(s.nodes.c.childrenIds).toEqual(['ca', 'a', 'b'])
    expect(s.nodes.r.childrenIds).toEqual(['c'])
    expect(s.nodes.a.order).toBe(1)
    expect(s.nodes.b.order).toBe(2)
    // c virou filho único da raiz → recalcCodes o renumerou para 1.1
    expect(s.nodes.c.code).toBe('1.1')
    expect(s.nodes.a.code).toBe('1.1.2')
    expect(s.nodes.b.code).toBe('1.1.3')
  })

  it('BEFORE em um irmão mantém todos os movidos antes do alvo', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b', 'c'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
      c: node('c', 'r', 2, [], '1.3'),
    })
    const s = act(s0, { type: 'MOVE_NODES', payload: { nodeIds: ['a', 'b'], targetId: 'c', position: 'BEFORE' } })
    expect(s.nodes.r.childrenIds).toEqual(['a', 'b', 'c'])
    expect(s.nodes.a.order).toBe(0)
    expect(s.nodes.b.order).toBe(1)
    expect(s.nodes.c.order).toBe(2)
  })

  it('descendente no lote não é movido em dobro (só o topo vai)', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
    })
    const s = act(s0, { type: 'MOVE_NODES', payload: { nodeIds: ['a', 'aa'], targetId: 'r', position: 'INSIDE' } })
    expect(s.nodes.a.parentId).toBe('r')
    expect(s.nodes.aa.parentId).toBe('a')
    expect(s.nodes.r.childrenIds).toContain('a')
    expect(s.nodes.a.childrenIds).toContain('aa')
  })

  it('ignora a raiz no lote', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
    })
    const s = act(s0, { type: 'MOVE_NODES', payload: { nodeIds: ['r', 'a'], targetId: 'r', position: 'INSIDE' } })
    expect(s.nodes.r.parentId).toBeNull()
    expect(s.nodes.a.parentId).toBe('r')
  })

  it('no-op quando o alvo está dentro de um dos movidos (ciclo)', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
    })
    expect(act(s0, { type: 'MOVE_NODES', payload: { nodeIds: ['a'], targetId: 'aa', position: 'INSIDE' } })).toBe(s0)
  })

  it('empilha no history', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const s = act(s0, { type: 'MOVE_NODES', payload: { nodeIds: ['a', 'b'], targetId: 'r', position: 'INSIDE' } })
    expect(s.history.past).toHaveLength(1)
  })
})

// ── DUPLICATE ─────────────────────────────────────────────────────────────────

describe('DUPLICATE', () => {
  it('duplica um nó como irmão imediatamente após ele', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const s = act(s0, { type: 'DUPLICATE', payload: { nodeIds: ['a'] } })
    expect(s.nodes.a.childrenIds).toHaveLength(1)
    expect(s.nodes.r.childrenIds).toHaveLength(3)
    const cloneId = s.nodes.r.childrenIds[1]
    expect(cloneId).not.toBe('a')
    expect(s.nodes[cloneId].parentId).toBe('r')
    expect(s.nodes[cloneId].order).toBe(1)
    // subárvore clonada preserva o filho
    expect(s.nodes[s.nodes[cloneId].childrenIds[0]]).toBeDefined()
    expect(s.nodes[cloneId].childrenIds).toHaveLength(1)
    expect(s.nodes.b.order).toBe(2)
    expect(s.nodes[cloneId].code).toBe('1.2')
    expect(s.nodes.b.code).toBe('1.3')
  })

  it('duplica múltiplos irmãos, cada clone logo após o original', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const s = act(s0, { type: 'DUPLICATE', payload: { nodeIds: ['a', 'b'] } })
    expect(s.nodes.r.childrenIds).toHaveLength(4)
    expect(s.nodes.r.childrenIds[0]).toBe('a')
    expect(s.nodes.r.childrenIds[1]).not.toBe('a')
    expect(s.nodes.r.childrenIds[2]).toBe('b')
    expect(s.nodes.r.childrenIds[3]).not.toBe('b')
  })

  it('com seleção pai+filho duplica apenas o topo (pai)', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, ['aa'], '1.1'),
      aa: node('aa', 'a', 0, [], '1.1.1'),
    })
    const s = act(s0, { type: 'DUPLICATE', payload: { nodeIds: ['a', 'aa'] } })
    expect(s.nodes.r.childrenIds).toHaveLength(2)
    const cloneId = s.nodes.r.childrenIds[1]
    expect(s.nodes[cloneId].childrenIds).toHaveLength(1)
    expect(s.nodes.a.childrenIds).toHaveLength(1)
  })

  it('ignora a raiz e não duplica', () => {
    const s0 = makeState({ r: node('r', null, 0, [], '1') })
    const s = act(s0, { type: 'DUPLICATE', payload: { nodeIds: ['r'] } })
    expect(s).toBe(s0)
  })

  it('empilha no history', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
    })
    const s = act(s0, { type: 'DUPLICATE', payload: { nodeIds: ['a'] } })
    expect(s.history.past).toHaveLength(1)
  })
})

// ── CLEAR_STYLE ──────────────────────────────────────────────────────────────

describe('CLEAR_STYLE', () => {
  it('reseta o estilo dos selecionados para DEFAULT_STYLE, preservando title', () => {
    const s: State = {
      ...makeState({ r: node('r', null, 0, ['a'], '1'), a: node('a', 'r', 0, [], '1.1') }),
      selectedNodeIds: ['a'],
    }
    s.nodes.a = { ...s.nodes.a, style: { ...DEFAULT_STYLE, backgroundColor: '#ff0000', fontSize: 20 } }
    const result = act(s, { type: 'CLEAR_STYLE' })
    expect(result.nodes.a.style.backgroundColor).toBe(DEFAULT_STYLE.backgroundColor)
    expect(result.nodes.a.style.fontSize).toBe(DEFAULT_STYLE.fontSize)
    expect(result.nodes.a.title).toBe('a')
  })

  it('no-op sem seleção', () => {
    const s0 = makeState({
      r: node('r', null, 0, ['a'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
    })
    s0.nodes.a = { ...s0.nodes.a, style: { ...DEFAULT_STYLE, backgroundColor: '#ff0000' } }
    expect(act(s0, { type: 'CLEAR_STYLE' })).toBe(s0)
  })

  it('empilha no history', () => {
    const s: State = {
      ...makeState({ r: node('r', null, 0, ['a'], '1'), a: node('a', 'r', 0, [], '1.1') }),
      selectedNodeIds: ['a'],
    }
    const result = act(s, { type: 'CLEAR_STYLE' })
    expect(result.history.past).toHaveLength(1)
  })
})

// ── PASTE_STYLE ──────────────────────────────────────────────────────────────

describe('PASTE_STYLE', () => {
  it('aplica estilo copiado, preserva title e properties', () => {
    const src: WbsNodeClient = {
      ...node('a', 'r', 0, [], '1.1'),
      title: 'Meu título',
      properties: { cost: 999 },
    }
    const s: State = {
      ...makeState({ r: node('r', null, 0, ['a'], '1'), a: src }),
      clipboard: { nodes: [], copiedStyle: { ...DEFAULT_STYLE, backgroundColor: '#ff0000' }, actionType: null },
    }
    const result = act(s, { type: 'PASTE_STYLE', payload: { nodeIds: ['a'] } })
    expect(result.nodes.a.style.backgroundColor).toBe('#ff0000')
    expect(result.nodes.a.title).toBe('Meu título')
    expect(result.nodes.a.properties.cost).toBe(999)
  })

  it('aplica a múltiplos nós', () => {
    const s: State = {
      ...makeState({
        r: node('r', null, 0, ['a', 'b'], '1'),
        a: node('a', 'r', 0, [], '1.1'),
        b: node('b', 'r', 1, [], '1.2'),
      }),
      clipboard: { nodes: [], copiedStyle: { ...DEFAULT_STYLE, backgroundColor: '#0000ff' }, actionType: null },
    }
    const result = act(s, { type: 'PASTE_STYLE', payload: { nodeIds: ['a', 'b'] } })
    expect(result.nodes.a.style.backgroundColor).toBe('#0000ff')
    expect(result.nodes.b.style.backgroundColor).toBe('#0000ff')
  })

  it('não faz nada se copiedStyle for null', () => {
    const s = makeState({ r: node('r', null, 0, [], '1') })
    expect(act(s, { type: 'PASTE_STYLE', payload: { nodeIds: ['r'] } })).toBe(s)
  })
})

// ── UNDO / REDO ──────────────────────────────────────────────────────────────

describe('UNDO / REDO', () => {
  it('UNDO restaura estado anterior', () => {
    const s0 = makeState({ r: node('r', null, 0, [], '1') })
    const s1 = act(s0, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    const u = act(s1, { type: 'UNDO' })
    expect(Object.keys(u.nodes)).toHaveLength(1)
    expect(u.nodes.r.childrenIds).toHaveLength(0)
  })

  it('REDO restaura estado forward', () => {
    const s0 = makeState({ r: node('r', null, 0, [], '1') })
    const s1 = act(s0, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    const u = act(s1, { type: 'UNDO' })
    const r = act(u, { type: 'REDO' })
    expect(Object.keys(r.nodes)).toHaveLength(2)
  })

  it('múltiplos UNDOs funcionam', () => {
    const s0 = makeState({ r: node('r', null, 0, [], '1') })
    const s1 = act(s0, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    const s2 = act(s1, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    const u2 = act(act(s2, { type: 'UNDO' }), { type: 'UNDO' })
    expect(Object.keys(u2.nodes)).toHaveLength(1)
  })

  it('UNDO sem history não modifica estado', () => {
    const s = makeState({ r: node('r', null, 0, [], '1') })
    expect(act(s, { type: 'UNDO' })).toBe(s)
  })

  it('REDO sem future não modifica estado', () => {
    const s = makeState({ r: node('r', null, 0, [], '1') })
    expect(act(s, { type: 'REDO' })).toBe(s)
  })

  it('nova ação após UNDO limpa o future', () => {
    const s0 = makeState({ r: node('r', null, 0, [], '1') })
    const s1 = act(s0, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    const u = act(s1, { type: 'UNDO' })
    const s2 = act(u, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    expect(s2.history.future).toHaveLength(0)
  })
})

// ── Imutabilidade ─────────────────────────────────────────────────────────────

describe('imutabilidade', () => {
  it('INSERT_CHILD não muta o estado anterior', () => {
    const s = makeState({ r: node('r', null, 0, [], '1') })
    const origNodes = s.nodes
    act(s, { type: 'INSERT_CHILD', payload: { parentId: 'r' } })
    expect(s.nodes).toBe(origNodes)
    expect(s.nodes.r.childrenIds).toHaveLength(0)
  })

  it('DELETE_NODE não muta o estado anterior', () => {
    const s = makeState({ r: node('r', null, 0, ['a'], '1'), a: node('a', 'r', 0, [], '1.1') })
    act(s, { type: 'DELETE_NODE', payload: { nodeId: 'a' } })
    expect(s.nodes.a).toBeDefined()
  })

  it('MOVE_NODE não muta o estado anterior', () => {
    const s = makeState({
      r: node('r', null, 0, ['a', 'b'], '1'),
      a: node('a', 'r', 0, [], '1.1'),
      b: node('b', 'r', 1, [], '1.2'),
    })
    const orig = [...s.nodes.r.childrenIds]
    act(s, { type: 'MOVE_NODE', payload: { nodeId: 'a', targetId: 'b', position: 'INSIDE' } })
    expect(s.nodes.r.childrenIds).toEqual(orig)
  })
})

// ── RESET_TREE ────────────────────────────────────────────────────────────────

describe('RESET_TREE', () => {
  it('cria árvore com nó raiz único (code="1")', () => {
    const s = makeState({ r: node('r', null, 0, ['a'], '1'), a: node('a', 'r', 0, [], '1.1') })
    const next = act(s, { type: 'RESET_TREE' })
    expect(Object.keys(next.nodes)).toHaveLength(1)
    expect(next.nodes[next.rootId!].code).toBe('1')
    expect(next.nodes[next.rootId!].parentId).toBeNull()
  })

  it('usa rootTitle customizado', () => {
    const s = makeState({ r: node('r', null, 0, [], '1') })
    const next = act(s, { type: 'RESET_TREE', payload: { rootTitle: 'Alpha' } })
    expect(next.nodes[next.rootId!].title).toBe('Alpha')
  })
})

// ── SET_COLLAPSED ─────────────────────────────────────────────────────────────

describe('SET_COLLAPSED', () => {
  it('colapsa o nó', () => {
    const s = makeState({ r: node('r', null, 0, [], '1') })
    expect(act(s, { type: 'SET_COLLAPSED', payload: { nodeId: 'r', collapsed: true } }).nodes.r.collapsed).toBe(true)
  })

  it('expande o nó', () => {
    const collapsed = { ...node('r', null, 0, [], '1'), collapsed: true }
    const s = makeState({ r: collapsed })
    expect(act(s, { type: 'SET_COLLAPSED', payload: { nodeId: 'r', collapsed: false } }).nodes.r.collapsed).toBe(false)
  })
})

// ── Vínculo com card/sprint em cópias ──────────────────────────────────────────

describe('cópias e vínculo com card/sprint', () => {
  const base = () => makeState({
    r: node('r', null, 0, ['a', 'b'], '1'),
    a: { ...node('a', 'r', 0, [], '1.1'), properties: { cardId: 'c1', tempoMinutos: 30 } },
    b: { ...node('b', 'r', 1, [], '1.2'), properties: { sprintId: 's1' } },
  })
  const copias = (s: State, antes: State) => Object.values(s.nodes).filter(n => !antes.nodes[n.id])

  it('duplicar cria cópia sem cardId/sprintId (mantém o resto das propriedades)', () => {
    const s0 = base()
    const [copia] = copias(act(s0, { type: 'DUPLICATE', payload: { nodeIds: ['a'] } }), s0)
    expect(copia.properties).toEqual({ tempoMinutos: 30 })
  })

  it('copiar e colar não leva o vínculo', () => {
    const s0 = act(base(), { type: 'COPY', payload: { nodeIds: ['b'] } })
    const [copia] = copias(act(s0, { type: 'PASTE', payload: { parentId: 'r' } }), s0)
    expect(copia.properties).toEqual({})
  })

  it('recortar e colar mantém o vínculo (é o mesmo item mudando de lugar)', () => {
    const s0 = act(base(), { type: 'CUT', payload: { nodeIds: ['a'] } })
    const [colado] = copias(act(s0, { type: 'PASTE', payload: { parentId: 'b' } }), s0)
    expect(colado.properties).toEqual({ cardId: 'c1', tempoMinutos: 30 })
  })
})

describe('SET_EAP_FORMAT (Organizar sem fase selecionada)', () => {
  // EAP antiga: o padrão era ABAIXO, convertido em DIREITA em todos os nós.
  const antiga = () => {
    const s = makeState({
      r: node('r', null, 0, ['f1', 'f2']), f1: node('f1', 'r', 0, ['a']), f2: node('f2', 'r', 1, []), a: node('a', 'f1', 0, []),
    })
    for (const n of Object.values(s.nodes)) n.layout = 'DIREITA'
    return s
  }

  it('põe o formato na raiz e todas as fases e itens voltam a "Igual à EAP"', () => {
    const s = act(antiga(), { type: 'SET_EAP_FORMAT', payload: { layout: 'ESQUERDA' } })
    expect(Object.fromEntries(Object.values(s.nodes).map(n => [n.id, n.layout]))).toEqual({
      r: 'ESQUERDA', f1: 'LADO_A_LADO', f2: 'LADO_A_LADO', a: 'LADO_A_LADO',
    })
    expect(s.sync.status).toBe('DIRTY')
  })

  it('desfazer volta os formatos anteriores', () => {
    const s = act(act(antiga(), { type: 'SET_EAP_FORMAT', payload: { layout: 'LADO_A_LADO' } }), { type: 'UNDO' })
    expect(Object.values(s.nodes).every(n => n.layout === 'DIREITA')).toBe(true)
  })

  it('sem raiz não faz nada', () => {
    const s = makeState({}, null)
    expect(act(s, { type: 'SET_EAP_FORMAT', payload: { layout: 'ESQUERDA' } })).toBe(s)
  })
})

describe('MERGE_TREE (conflito resolvido sem intervenção)', () => {
  it('troca a árvore, mantém seleção e edição dos itens que continuam e marca para salvar com a versão nova', () => {
    const s0 = { ...makeState({ r: node('r', null, 0, ['a', 'b']), a: node('a', 'r', 0, []), b: node('b', 'r', 1, []) }), selectedNodeIds: ['a', 'b'], editingNodeId: 'a' }
    const nodes = { r: node('r', null, 0, ['a']), a: { ...node('a', 'r', 0, []), properties: { cardId: 'c1' } } }
    const s1 = act(s0, { type: 'MERGE_TREE', payload: { nodes, rootId: 'r', serverVersion: 7 } })
    expect(s1.nodes).toBe(nodes)
    expect(s1.selectedNodeIds).toEqual(['a'])
    expect(s1.editingNodeId).toBe('a')
    expect(s1.sync).toMatchObject({ status: 'DIRTY', serverVersion: 7 })
    expect(s1.history).toEqual({ past: [], future: [] })
  })
})
