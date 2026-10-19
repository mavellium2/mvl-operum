import { describe, it, expect } from 'vitest'
import {
  computarPlanilhaCustos,
  valorPorMinutoDe,
  horasPorDiaDoElaborador,
  valorPorMinutoDoElaborador,
  situacaoDe,
  fmtDataBR,
  aplicarDescricoesDosCards,
  cardsDasAtividades,
  type Elaborador,
} from '@/lib/planilhaCustos'
import type { WbsNodeClient } from '@/types/wbs'

const S = {
  backgroundColor: '#fff', borderColor: '#000', textColor: '#000',
  borderWidth: 1, fontSize: 14, borderRadius: 4,
}

function node(
  id: string,
  parentId: string | null,
  childrenIds: string[],
  props: WbsNodeClient['properties'] = {},
): WbsNodeClient {
  return {
    id, parentId, order: 0, code: id.toUpperCase(), title: id,
    layout: 'ABAIXO', collapsed: false, style: S, properties: props, childrenIds,
  }
}

// Dataset de exemplo (§F.6): elaboradores Maria/João com salário 4000 e 8h/dia,
// valorPorMinuto = 4000/30/8/60 = 5/18. Os totais batem com o modelo:
//   orçado ≈ 58,84 e realizado ≈ 22,51.
function eapExemplo(): Record<string, WbsNodeClient> {
  return {
    r: node('r', null, ['m1', 'm2']),
    m1: node('m1', 'r', ['a1', 'a2', 'a3']),
    m2: node('m2', 'r', []),
    a1: node('a1', 'm1', [], {
      tempoMinutos: 90, materiais: 5,
      tempoRealMinutos: 36, materiaisReal: 1,
      dataPrevista: '2026-03-10', dataRealizacao: '2026-03-05',
      elaboradoPor: 'Maria',
      elaboradoPorUserId: 'u-maria',
    }),
    a2: node('a2', 'm1', [], {
      tempoMinutos: 60, materiais: 2.84,
      tempoRealMinutos: 24, materiaisReal: 1,
      dataPrevista: '2026-03-10', dataRealizacao: '2026-03-10',
      elaboradoPor: 'João',
      elaboradoPorUserId: 'u-joao',
    }),
    a3: node('a3', 'm1', [], {
      tempoMinutos: 30, materiais: 1,
      tempoRealMinutos: 12, materiaisReal: 0.51,
      dataPrevista: '2026-03-10', dataRealizacao: '2026-03-15',
      elaboradoPor: 'Maria',
      elaboradoPorUserId: 'u-maria',
    }),
  }
}

const CONFIG = { valorReferencia: 4000, horasPorDia: 8 }

// Elaboradores do exemplo: salário 4000 → vpm 5/18 idêntico ao modelo §F.6.
const ELABORADORES = new Map<string, Elaborador>([
  ['u-maria', { userId: 'u-maria', name: 'Maria', remuneracao: 4000, horasDiarias: 8 }],
  ['u-joao', { userId: 'u-joao', name: 'João', remuneracao: 4000, horasDiarias: 8 }],
])

describe('valorPorMinutoDe', () => {
  it('salário mínimo /30/8h/60min (= 5/18)', () => {
    expect(valorPorMinutoDe(CONFIG)).toBeCloseTo(5 / 18, 10)
  })
})

describe('horasPorDiaDoElaborador', () => {
  const el = (horasDiarias: number | null) => ({ userId: 'u1', name: 'Maria', remuneracao: null, horasDiarias })

  it('usa horasDiarias do elaborador quando preenchidas', () => {
    expect(horasPorDiaDoElaborador(el(6))).toBe(6)
  })

  it('0 ou ausente → nenhum (não há padrão)', () => {
    expect(horasPorDiaDoElaborador(el(0))).toBeNull()
    expect(horasPorDiaDoElaborador(el(null))).toBeNull()
  })

  it('sem elaborador → nenhum', () => {
    expect(horasPorDiaDoElaborador(undefined)).toBeNull()
  })
})

describe('valorPorMinutoDoElaborador', () => {
  const el = (remuneracao: number | null, horasDiarias: number | null) => ({
    userId: 'u1', name: 'Maria', remuneracao, horasDiarias,
  })

  it('salário e jornada do elaborador definem o valor/min', () => {
    expect(valorPorMinutoDoElaborador(el(3000, 6))).toBeCloseTo(3000 / 30 / 6 / 60, 10)
  })

  it('sem salário → nenhum (não usa valor de referência)', () => {
    expect(valorPorMinutoDoElaborador(el(null, 6))).toBeNull()
    expect(valorPorMinutoDoElaborador(el(0, 6))).toBeNull()
  })

  it('sem jornada → nenhum', () => {
    expect(valorPorMinutoDoElaborador(el(3000, null))).toBeNull()
  })
})

describe('situacaoDe', () => {
  it('sem realização → Pendente', () => {
    expect(situacaoDe('2026-03-10', null)).toBe('Pendente')
  })
  it('realização antes da prevista → Antecipada', () => {
    expect(situacaoDe('2026-03-10', '2026-03-05')).toBe('Antecipada')
  })
  it('realização no mesmo dia → No prazo', () => {
    expect(situacaoDe('2026-03-10', '2026-03-10')).toBe('No prazo')
  })
  it('realização depois → Atrasada', () => {
    expect(situacaoDe('2026-03-10', '2026-03-15')).toBe('Atrasada')
  })
})

describe('fmtDataBR', () => {
  it('yyyy-mm-dd → dd/mm/aaaa; vazio quando ausente', () => {
    expect(fmtDataBR('2026-03-05')).toBe('05/03/2026')
    expect(fmtDataBR(null)).toBe('')
    expect(fmtDataBR(undefined)).toBe('')
  })
})

describe('computarPlanilhaCustos — dataset de exemplo', () => {
  const plan = computarPlanilhaCustos(eapExemplo(), 'r', CONFIG, ELABORADORES)

  it('macrofase sem atividades folha aparece vazia (m2)', () => {
    expect(plan.macrofases.map(f => f.nodeId)).toEqual(['m1', 'm2'])
    const m2 = plan.macrofases.find(f => f.nodeId === 'm2')
    expect(m2?.atividades).toEqual([])
    expect(m2?.minOrcado).toBe(0)
    expect(m2?.totalOrcado).toBe(0)
    expect(m2?.minReal).toBe(0)
    expect(m2?.totalReal).toBe(0)
  })

  it('TOTAL GERAL orçado ≈ 58,84 e realizado ≈ 22,51', () => {
    expect(plan.totalOrcado).toBeCloseTo(58.84, 2)
    expect(plan.totalReal).toBeCloseTo(22.51, 2)
  })

  it('custo deriva de min × valorPorMinuto + materiais, por linha', () => {
    const [a1, a2, a3] = plan.macrofases[0].atividades
    expect(a1.totalOrcado).toBeCloseTo(90 * (5 / 18) + 5, 2) // 30
    expect(a2.totalOrcado).toBeCloseTo(60 * (5 / 18) + 2.84, 2)
    expect(a3.totalOrcado).toBeCloseTo(30 * (5 / 18) + 1, 2)
    expect(a1.totalReal).toBeCloseTo(36 * (5 / 18) + 1, 2) // 11
    expect(a3.totalReal).toBeCloseTo(12 * (5 / 18) + 0.51, 2)
  })

  it('situação de cada atividade', () => {
    const [a1, a2, a3] = plan.macrofases[0].atividades
    expect(a1.situacao).toBe('Antecipada')
    expect(a2.situacao).toBe('No prazo')
    expect(a3.situacao).toBe('Atrasada')
  })

  it('jornada/valor-min seguem o elaborador; sem elaborador o valor é nenhum', () => {
    const nodes = eapExemplo()
    nodes.a1.properties.elaboradoPorUserId = 'u-maria'
    const elaboradores = new Map([['u-maria', { userId: 'u-maria', name: 'Maria', remuneracao: 3000, horasDiarias: 6 }]])
    const p = computarPlanilhaCustos(nodes, 'r', CONFIG, elaboradores)
    const [a1, a2] = p.macrofases[0].atividades
    // a1 é da Maria (6h/dia, salário 3000) → jornada e valor/min dela
    expect(a1.jornadaDiaria).toBe(6)
    expect(a1.vpm).toBeCloseTo(3000 / 30 / 6 / 60, 10)
    expect(a1.totalOrcado).toBeCloseTo(90 * (3000 / 30 / 6 / 60) + 5, 2)
    // a2 (João) sem cadastro no mapa → nenhum valor/min (sem padrão); Total = só materiais
    expect(a2.jornadaDiaria).toBeNull()
    expect(a2.vpm).toBeNull()
    expect(a2.totalOrcado).toBe(nodes.a2.properties.materiais ? nodes.a2.properties.materiais : null)
  })

  it('sem elaboradores cadastrados, nenhuma linha calcula R$/dias; o Total fica só com os materiais', () => {
    const nodes = eapExemplo()
    const p = computarPlanilhaCustos(nodes, 'r', CONFIG)
    const atividades = p.macrofases[0].atividades
    const a1 = atividades[0]
    expect(a1.jornadaDiaria).toBeNull()
    expect(a1.vpm).toBeNull()
    expect(a1.totalOrcado).toBe(nodes.a1.properties.materiais)
    const materiaisOrcados = atividades.reduce((s, a) => s + a.materiaisOrcado, 0)
    const materiaisReais = atividades.reduce((s, a) => s + a.materiaisReal, 0)
    expect(p.macrofases[0].totalOrcado).toBeCloseTo(materiaisOrcados, 2)
    expect(p.macrofases[0].totalReal).toBeCloseTo(materiaisReais, 2)
  })

  it('linha sem valor/min e sem materiais: Total é nenhum', () => {
    const nodes = eapExemplo()
    nodes.a1.properties.materiais = 0
    nodes.a1.properties.materiaisReal = 0
    const a1 = computarPlanilhaCustos(nodes, 'r', CONFIG).macrofases[0].atividades[0]
    expect(a1.totalOrcado).toBeNull()
    expect(a1.totalReal).toBeNull()
  })

  it('sub-total da macrofase soma linhas (60,00 min orçados)', () => {
    const f = plan.macrofases[0]
    expect(f.minOrcado).toBe(180)
    expect(f.minReal).toBe(72)
    expect(f.totalOrcado).toBeCloseTo(plan.totalOrcado, 2)
  })

  it('quadro de valores por fase', () => {
    const [v] = plan.quadros.valor
    expect(v.fase).toBe('M1 m1')
    expect(v.orcado).toBeCloseTo(58.84, 2)
    expect(v.realizado).toBeCloseTo(22.51, 2)
  })

  it('quadro de tempo por fase (min)', () => {
    const [t] = plan.quadros.tempo
    expect(t.minOrcado).toBe(180)
    expect(t.minReal).toBe(72)
  })

  it('quadro de elaboradores: quantidade e percentual', () => {
    const els = plan.quadros.elaboradores
    const maria = els.find(e => e.elaborador === 'Maria')!
    expect(maria.qtdeAtividades).toBe(2)
    expect(maria.percentual).toBeCloseTo(66.7, 1) // 2/3
    const joao = els.find(e => e.elaborador === 'João')!
    expect(joao.percentual).toBeCloseTo(33.3, 1)
  })
})
describe('data fim das fases e do projeto (maior data prevista)', () => {
  it('fase usa a maior data prevista das atividades; projeto, a maior das fases', () => {
    const nodes = {
      r: node('r', null, ['f1', 'f2', 'f3']),
      f1: node('f1', 'r', ['t1', 't2', 't3']),
      t1: node('t1', 'f1', [], { dataPrevista: '2026-10-15' }),
      t2: node('t2', 'f1', [], { dataPrevista: '2026-11-01' }),
      t3: node('t3', 'f1', [], { dataPrevista: '2026-10-20' }),
      f2: node('f2', 'r', ['u1'], { }),
      u1: node('u1', 'f2', [], { dataPrevista: '2026-12-01T00:00:00.000Z' }),
      f3: node('f3', 'r', ['v1', 'v2']),
      v1: node('v1', 'f3', [], { dataPrevista: '2027-12-01' }),
      v2: node('v2', 'f3', []),
    }
    const p = computarPlanilhaCustos(nodes, 'r', { valorReferencia: 4000, horasPorDia: 8 })
    expect(p.macrofases.map(f => f.dataFim)).toEqual(['2026-11-01', '2026-12-01', '2027-12-01'])
    expect(p.dataFimProjeto).toBe('2027-12-01')
  })

  it('sem datas previstas → null (não sobrescreve o que foi informado à mão)', () => {
    const p = computarPlanilhaCustos({ r: node('r', null, ['f']), f: node('f', 'r', ['t']), t: node('t', 'f', []) }, 'r', { valorReferencia: 4000, horasPorDia: 8 })
    expect(p.macrofases[0].dataFim).toBeNull()
    expect(p.dataFimProjeto).toBeNull()
  })
})

describe('descrição das atividades', () => {
  const nodes = () => ({
    r: node('r', null, ['m1']),
    m1: node('m1', 'r', ['a1', 'a2', 'a3']),
    a1: node('a1', 'm1', [], { description: '  do nó  ', cardId: 'c1' }),
    a2: node('a2', 'm1', [], { description: 'só no nó' }),
    a3: node('a3', 'm1', [], { cardId: 'c3' }),
  })

  it('vem do nó da EAP, sem espaços nas pontas', () => {
    const p = computarPlanilhaCustos(nodes(), 'r', { valorReferencia: 4000, horasPorDia: 8 })
    expect(p.macrofases[0].atividades.map(a => a.descricao)).toEqual(['do nó', 'só no nó', ''])
  })

  it('linha com card ligado usa a descrição atual do card; sem card, mantém a do nó', () => {
    const n = nodes()
    const p = computarPlanilhaCustos(n, 'r', { valorReferencia: 4000, horasPorDia: 8 })
    expect(cardsDasAtividades(p, n)).toEqual(['c1', 'c3'])
    const r = aplicarDescricoesDosCards(p, n, new Map([['c1', 'editada no card'], ['c3', '']]))
    expect(r.macrofases[0].atividades.map(a => a.descricao)).toEqual(['editada no card', 'só no nó', ''])
  })

  it('card excluído (fora do mapa) mantém a descrição do nó', () => {
    const n = nodes()
    const p = computarPlanilhaCustos(n, 'r', { valorReferencia: 4000, horasPorDia: 8 })
    expect(aplicarDescricoesDosCards(p, n, new Map()).macrofases[0].atividades[0].descricao).toBe('do nó')
  })
})

describe('vários elaboradores na mesma tarefa (ADR-044)', () => {
  // Ana: 4800/mês, 8h/dia → 4800/30/8/60 = 1/3 por minuto. Bruno: 2x isso, 6h/dia.
  const ana: Elaborador = { userId: 'ana', name: 'Ana', remuneracao: 4800, horasDiarias: 8 }
  const bruno: Elaborador = { userId: 'bruno', name: 'Bruno', remuneracao: 7200, horasDiarias: 6 }
  const elab = new Map([[ana.userId, ana], [bruno.userId, bruno]])
  const nodes = () => ({
    r: node('r', null, ['m1']),
    m1: node('m1', 'r', ['a1', 'a2']),
    a1: node('a1', 'm1', [], { tempoMinutos: 60, elaboradoPorUserIds: ['ana', 'bruno'], elaboradoPor: 'Ana, Bruno' }),
    a2: node('a2', 'm1', [], { tempoMinutos: 60, elaboradoPorUserId: 'ana', elaboradoPor: 'Ana' }),
  })

  it('custo soma o valor/minuto de todos; jornada é a menor', () => {
    const p = computarPlanilhaCustos(nodes(), 'r', { valorReferencia: 4000, horasPorDia: 8 }, elab)
    const [a1, a2] = p.macrofases[0].atividades
    const vAna = valorPorMinutoDoElaborador(ana)!, vBruno = valorPorMinutoDoElaborador(bruno)!
    expect(a1.vpm).toBeCloseTo(vAna + vBruno, 10)
    expect(a1.jornadaDiaria).toBe(6)
    expect(a1.elaboradoPorUserIds).toEqual(['ana', 'bruno'])
    expect(a2.vpm).toBeCloseTo(vAna, 10)
    expect(a2.elaboradoPorUserIds).toEqual(['ana'])
  })

  it('quadro de elaboradores conta a tarefa para cada um', () => {
    const p = computarPlanilhaCustos(nodes(), 'r', { valorReferencia: 4000, horasPorDia: 8 }, elab)
    expect(p.quadros.elaboradores).toEqual([
      { elaborador: 'Ana', qtdeAtividades: 2, percentual: 100 },
      { elaborador: 'Bruno', qtdeAtividades: 1, percentual: 50 },
    ])
  })
})
