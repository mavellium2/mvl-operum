import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarPlanilhaXlsx } from '@/lib/exports/planilhaCustosXlsx'
import { computarPlanilhaCustos } from '@/lib/planilhaCustos'
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

const CONFIG = { valorReferencia: 4000, horasPorDia: 8 }

const ELABORADORES = new Map<string, { userId: string; name: string; remuneracao: number | null; horasDiarias: number | null }>([
  ['u-maria', { userId: 'u-maria', name: 'Maria', remuneracao: 4000, horasDiarias: 8 }],
  ['u-joao', { userId: 'u-joao', name: 'João', remuneracao: 4000, horasDiarias: 8 }],
])

async function lerWorkbook(): Promise<ExcelJS.Workbook> {
  const nodes: Record<string, WbsNodeClient> = {
    r: node('r', null, ['m1']),
    m1: node('m1', 'r', ['a1', 'a2', 'a3']),
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
    // a3 sem elaborador → linha sem cálculo (nenhum valor)
    a3: node('a3', 'm1', [], {
      tempoMinutos: 30, materiais: 1,
      tempoRealMinutos: 12, materiaisReal: 0.51,
      dataPrevista: '2026-03-10', dataRealizacao: '2026-03-15',
      elaboradoPor: 'Maria',
    }),
  }
  const plan = computarPlanilhaCustos(nodes, 'r', CONFIG, ELABORADORES)
  const buffer = await gerarPlanilhaXlsx(plan, {
    nomeProjeto: 'Pintar uma sala',
    inicioProjeto: new Date(2026, 2, 1),
    fimProjeto: new Date(2026, 3, 30),
  })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

describe('gerarPlanilhaXlsx — modelo IDÊNTICO', () => {
  it('gera planilha com a aba e cabeçalho do projeto (sem padrões)', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    expect(ws).toBeDefined()
    expect(String(ws.findCell(1, 1)?.value)).toContain('PLANILHA DE CUSTOS')
    expect(String(ws.findCell(2, 1)?.value)).toContain('Projeto: Pintar uma sala')
    // Sem "horas por dia" nem "valor de referência"/"valor por minuto" no cabeçalho
    expect(ws.findCell(2, 6)?.value ?? null).toBe(null)
    expect(ws.findCell(2, 9)?.value ?? null).toBe(null)
    expect(String(ws.findCell(3, 7)?.value || '')).not.toContain('Valor por minuto')
  })

  it('datas início/fim no cabeçalho', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    expect(String(ws.findCell(3, 1)?.value)).toContain('01/03/2026')
    expect(String(ws.findCell(3, 4)?.value)).toContain('30/04/2026')
  })

  it('usa fórmulas nativas (não valores fixos) nos subtotais e total', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    // sub-total (linha 10) e TOTAL GERAL (linha 11) em coluna Total orçado (I) e realizado (P)
    const subtotal = ws.getCell('I10').value as { formula: string }
    expect(subtotal.formula.startsWith('SUM(')).toBe(true)
    const totalRow = ws.getRow(11)
    expect(String(totalRow.getCell(1).value)).toContain('TOTAL GERAL')
    const totalI = ws.getCell('I11').value as { formula: string }
    expect(totalI.formula.startsWith('SUM(')).toBe(true)
  })

  it('rótulos do sub-total e do TOTAL GERAL alinhados à direita (SDD 4.7)', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    expect(String(ws.getCell('A10').value)).toMatch(/^Sub-total/)
    expect(ws.getCell('A10').alignment).toMatchObject({ horizontal: 'right' })
    expect(ws.getCell('A11').alignment).toMatchObject({ horizontal: 'right' })
  })

  it('R$/Horas/Dias por atividade derivam de fórmulas com referências', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    // atividade a1 na linha 7 (linha 6 = linha da macrofase) — Maria (8h/dia, salário 4000)
    const hora = ws.getCell('E7').value as { formula: string }
    expect(hora.formula).toBe('D7/1440')
    expect(ws.getCell('E7').numFmt).toBe('h:mm')
    const dias = ws.getCell('F7').value as { formula: string }
    expect(dias.formula).toBe('D7/60/8') // jornada do elaborador (Maria, 8h/dia)
    const valorMinuto = ws.getCell('G7').value
    expect(valorMinuto).toBeCloseTo(0.2777777777777778) // valor/min da Maria = 4000/30/8/60
    expect(ws.getCell('G7').numFmt).toContain('R$')
    const total = ws.getCell('I7').value as { formula: string }
    expect(total.formula).toBe('ROUND(D7*G7,2)+H7')
    // realizado
    expect((ws.getCell('L7').value as { formula: string }).formula).toBe('K7/1440')
    expect((ws.getCell('P7').value as { formula: string }).formula).toBe('ROUND(K7*N7,2)+O7')
  })

  it('linha sem elaborador deixa Dias/R$/Total em branco (nenhum valor)', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    // a3 (linha 9) não tem elaborador → células de cálculo vazias
    expect(ws.findCell(9, 6)?.value ?? null).toBe(null) // Dias orçado
    expect(ws.findCell(9, 7)?.value ?? null).toBe(null) // R$ orçado
    expect(ws.findCell(9, 9)?.value).toMatchObject({ formula: 'H9' }) // Total orçado
    expect(ws.findCell(9, 13)?.value ?? null).toBe(null) // Dias realizado
    expect(ws.findCell(9, 14)?.value ?? null).toBe(null) // R$ realizado
    expect(ws.findCell(9, 16)?.value).toMatchObject({ formula: 'O9' }) // Total realizado
    // Somatório do sub-total continua funcionando (linhas calculáveis somadas)
    expect((ws.getCell('I10').value as { formula: string }).formula.startsWith('SUM(')).toBe(true)
  })

  it('status colorido é persistido', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    // atividade a1 fica na linha 7 (linha 6 = macrofase)
    const celula = ws.getCell('R7')
    expect(celula.value).toBe('Antecipada')
    const fill = celula.fill as { fgColor?: { argb?: string } }
    expect(fill.fgColor?.argb).toBe('C6EFCE')
  })

  it('contém os 3 quadros-resumo com fórmulas nativas', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    const texto = ws.getCell('A13').value
    expect(String(texto)).toContain('Resumo — Valor por Fase')
    // linha da fase no quadro 1 → B15 referencia I10 (sub-total orçado)
    expect((ws.getCell('B15').value as { formula: string }).formula).toBe('I10')
    expect((ws.getCell('C15').value as { formula: string }).formula).toBe('P10')
  })

  it('quadro de elaboradores usa COUNTIF nativo', async () => {
    const wb = await lerWorkbook()
    const ws = wb.getWorksheet('Planilha de Custos')
    // quadro 3 começa após quadro 2 (linha 21 título, 22 cabeçalho, 23+ dados)
    const indice = (() => {
      for (let r = 13; r <= 30; r++) {
        if (String(ws.findCell(r, 1)?.value ?? '').includes('Distribuição por Elaborador')) return r + 2
      }
      return 23
    })()
    const nome = String(ws.findCell(indice, 1)?.value ?? '')
    const celQtde = ws.getCell(`B${indice}`).value as { formula: string }
    expect(celQtde.formula).toEqual(`COUNTIF($C$6:$C$8,"${nome}")`)
  })
})