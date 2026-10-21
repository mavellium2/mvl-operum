// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

const { n } = vi.hoisted(() => ({ n: (id: string, parentId: string | null, childrenIds: string[], properties: Record<string, unknown> = {}) =>
  ({ id, parentId, order: 0, code: id, title: id, layout: 'vertical', collapsed: false, style: {}, properties, childrenIds }) }))

vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findFirst: vi.fn().mockResolvedValue({ valorReferencia: null, horasPorDia: null }) },
    userProject: { findMany: vi.fn().mockResolvedValue([{ userId: 'u', remuneracao: 1800, horasDiarias: 6, user: { id: 'u', name: 'Ana', deletedAt: null, isActive: true } }]) },
  },
}))
vi.mock('@/services/wbsService', () => ({
  aplicarResumoDaPlanilha: vi.fn(),
  getTree: vi.fn().mockResolvedValue({
    rootId: 'r',
    nodes: {
      r: n('r', null, ['f']),
      f: n('f', 'r', ['a', 'b']),
      a: n('a', 'f', [], { cardId: 'card-a', elaboradoPorUserIds: ['u'], tempoMinutos: 120, tempoRealMinutos: 90, materiais: 10, dataPrevista: '2026-10-20', dataRealizacao: '2026-10-19' }),
      b: n('b', 'f', [], { tempoMinutos: 30 }),
    },
  }),
}))
vi.mock('@/services/planilhaCardSync', () => ({ sincronizarCardsDaPlanilha: vi.fn() }))

import { resumoDaPlanilhaPorCard } from '@/services/planilhaService'

describe('resumoDaPlanilhaPorCard', () => {
  it('traz a linha da planilha do card ligado: horas, datas e valores', async () => {
    const mapa = await resumoDaPlanilhaPorCard('p1', 't1')
    // 1800 / 30 / 6 / 60 = R$ 0,1667/min → 120 min = 20,00 + 10 de materiais
    expect(mapa.get('card-a')).toEqual({
      minOrcado: 120, minReal: 90, dataPrevista: '2026-10-20', dataRealizacao: '2026-10-19', totalOrcado: 30, totalReal: 15,
    })
  })

  it('atividade sem card ligado não entra', async () => {
    const mapa = await resumoDaPlanilhaPorCard('p1', 't1')
    expect([...mapa.keys()]).toEqual(['card-a'])
  })
})
