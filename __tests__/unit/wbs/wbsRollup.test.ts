import { computarPlanilhaCustos, valorPorMinutoDoElaborador } from '@/lib/planilhaCustos'
import { describe, it, expect } from 'vitest'
import { computeRollups, computeFinancialRollups } from '@/lib/wbsRollup'
import type { WbsNodeClient } from '@/types/wbs'

const S = {
  backgroundColor: '#fff', borderColor: '#000', textColor: '#000',
  borderWidth: 1, fontSize: 14, borderRadius: 4,
}

function node(
  id: string,
  parentId: string | null,
  childrenIds: string[],
  cost?: number,
  durationDays?: number
): WbsNodeClient {
  return {
    id, parentId, order: 0, code: '', title: id,
    layout: 'ABAIXO', collapsed: false, style: S,
    properties: { cost, durationDays },
    childrenIds,
  }
}

describe('computeRollups', () => {
  it('retorna {} para rootId null', () => {
    expect(computeRollups({}, null)).toEqual({})
  })

  it('retorna {} para rootId inexistente', () => {
    expect(computeRollups({}, 'nope')).toEqual({})
  })

  it('folha usa valor próprio', () => {
    const r = computeRollups({ r: node('r', null, [], 100, 5) }, 'r')
    expect(r.r).toEqual({ cost: 100, durationDays: 5, isRolledUp: false })
  })

  it('folha sem valores retorna zeros', () => {
    const r = computeRollups({ r: node('r', null, []) }, 'r')
    expect(r.r).toEqual({ cost: 0, durationDays: 0, isRolledUp: false })
  })

  it('pai é soma dos filhos (isRolledUp: true)', () => {
    const nodes = {
      r: node('r', null, ['a', 'b']),
      a: node('a', 'r', [], 30, 2),
      b: node('b', 'r', [], 70, 3),
    }
    const r = computeRollups(nodes, 'r')
    expect(r.r).toEqual({ cost: 100, durationDays: 5, isRolledUp: true })
  })

  it('rollup em cascata — 3 níveis', () => {
    const nodes = {
      r: node('r', null, ['a']),
      a: node('a', 'r', ['aa', 'ab']),
      aa: node('aa', 'a', [], 10, 1),
      ab: node('ab', 'a', [], 20, 2),
    }
    const r = computeRollups(nodes, 'r')
    expect(r.aa).toEqual({ cost: 10, durationDays: 1, isRolledUp: false })
    expect(r.ab).toEqual({ cost: 20, durationDays: 2, isRolledUp: false })
    expect(r.a).toEqual({ cost: 30, durationDays: 3, isRolledUp: true })
    expect(r.r).toEqual({ cost: 30, durationDays: 3, isRolledUp: true })
  })

  it('nó com filhos ignora valor próprio (rollup substitui)', () => {
    const nodes = {
      r: node('r', null, ['a'], 999, 999),
      a: node('a', 'r', [], 50, 4),
    }
    const r = computeRollups(nodes, 'r')
    expect(r.r.cost).toBe(50)
    expect(r.r.durationDays).toBe(4)
    expect(r.r.isRolledUp).toBe(true)
  })

  it('não processa childrenIds cujos nós não existem no mapa', () => {
    const nodes = {
      r: node('r', null, ['a', 'ghost']),
      a: node('a', 'r', [], 10, 1),
    }
    const r = computeRollups(nodes, 'r')
    expect(r.r.cost).toBe(10)
    expect(r.r.isRolledUp).toBe(true)
  })
})


describe('financial rollups', () => {
  it('sums hidden descendants using their own elaborator rates and actual materials', () => {
    const r = node('r', null, ['a', 'b']); r.collapsed = true
    const a = node('a', 'r', []), b = node('b', 'r', [])
    a.properties = { elaboradoPorUserId: 'u1', tempoMinutos: 60, tempoRealMinutos: 120, materiais: 10, materiaisReal: 5 }
    b.properties = { elaboradoPorUserId: 'u2', tempoMinutos: 120, tempoRealMinutos: 30, materiais: 20, materiaisReal: 15 }
    expect(computeFinancialRollups({ r, a, b }, 'r', { u1: 2, u2: 3 }).r).toEqual({ budgetHours: 3, actualHours: 2.5, budgetCost: 510, actualCost: 350 })
  })
  it('does not present incomplete costs as zero when an elaborator rate is missing', () => {
    const r = node('r', null, ['a']), a = node('a', 'r', [])
    a.properties = { tempoMinutos: 60, tempoRealMinutos: 120, elaboradoPorUserId: 'missing' }
    expect(computeFinancialRollups({ r, a }, 'r', {}).r).toEqual({ budgetHours: 1, actualHours: 2, budgetCost: null, actualCost: null })
  })
})


describe('EAP e Planilha de Custos usam os mesmos valores', () => {
  it('subtotal e total preservam materiais sem mão de obra e somam só os valores calculados', () => {
    const r = node('r', null, ['f']), f = node('f', 'r', ['a', 'b', 'c'])
    const a = node('a', 'f', []), b = node('b', 'f', []), c = node('c', 'f', [])
    a.properties = { elaboradoPorUserId: 'u', tempoMinutos: 95, tempoRealMinutos: 70, materiais: 25.3, materiaisReal: 18.2 }
    b.properties = { tempoMinutos: 10, materiais: 300, materiaisReal: 100 }
    const nodes = { r, f, a, b, c }
    const member = { userId: 'u', name: 'Ana', remuneracao: 1621, horasDiarias: 8 }
    const sheet = computarPlanilhaCustos(nodes, 'r', { valorReferencia: 0, horasPorDia: 8 }, new Map([['u', member]]))
    const finances = computeFinancialRollups(nodes, 'r', { u: valorPorMinutoDoElaborador(member) })
    expect(finances.r.budgetCost).toBe(sheet.totalOrcado)
    expect(finances.r.actualCost).toBe(sheet.totalReal)
    expect(finances.r.budgetHours * 60).toBeCloseTo(sheet.tempoOrcadoTotal)
    expect(finances.b.budgetCost).toBe(300)
    expect(finances.c.budgetCost).toBeNull()
  })
})
