import ExcelJS from 'exceljs'
import type { PlanilhaDeCustos, SituacaoAtividade } from '@/lib/planilhaCustos'
import { fmtDataBR } from '@/lib/planilhaCustos'

/**
 * Export Planilha de Custos IDÊNTICO ao modelo (§F.6).
 * - Cabeçalho: projeto, início/fim.
 * - Colunas/agrupamentos, sub-totais cinza por macrofase, TOTAL GERAL.
 * - Fórmulas nativas: Horas (Min/1440, h:mm), Dias (Min/60/jornada do elaborador),
 *   R$ (valor do minuto do elaborador), Total ((Min × R$) + Materiais), somatórios, quadros-resumo.
 * - Linha sem elaborador (ou sem salário/jornada) → Dias e R$ vazios (nenhum valor); Total = só os materiais.
 * - 3 quadros-resumo (fase×valor, fase×tempo, elaborador×qtde/%).
 * - Formatação h:mm, moeda R$, datas dd/mm/aaaa, status colorido.
 */

export interface PlanilhaXlsxMeta {
  nomeProjeto: string
  inicioProjeto: Date | null
  fimProjeto: Date | null
}

const RESPALDO = '"R$" #,##0.00'
/** Valor do minuto: centavos não bastam (ex.: R$ 0,3472). */
const VALOR_MINUTO = '"R$" #,##0.00##'
const DURACAO = 'h:mm'
const DIAS = '0.00" d"'
const DATA_BR = 'dd/mm/aaaa'

const COR_GRUPO = '4472C4'
const COR_SUB = 'D9E2F3'
const COR_FASE = 'F2F2F2'
const COR_SUBTOTAL = 'D9D9D9'
const COR_TOTAL = 'BDD7EE'

const STATUS_FILL: Record<SituacaoAtividade, string> = {
  Antecipada: 'C6EFCE',
  'No prazo': 'DDEBF7',
  Atrasada: 'FFC7CE',
  Pendente: 'EDEDED',
}
const STATUS_FONT: Record<SituacaoAtividade, string> = {
  Antecipada: '006100',
  'No prazo': '1F4E78',
  Atrasada: '9C0006',
  Pendente: '595959',
}

function dataCelula(iso: string | null): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function borda(x: ExcelJS.Worksheet, r: ExcelJS.Row) {
  for (let c = 1; c <= 18; c++) {
    const cell = r.getCell(c)
    cell.border = {
      top: { style: 'thin', color: { argb: '9CA3AF' } },
      bottom: { style: 'thin', color: { argb: '9CA3AF' } },
      left: { style: 'thin', color: { argb: '9CA3AF' } },
      right: { style: 'thin', color: { argb: '9CA3AF' } },
    }
  }
}

export async function gerarPlanilhaXlsx(
  plan: PlanilhaDeCustos,
  meta: PlanilhaXlsxMeta,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Planilha de Custos')
  ws.views = [{ state: 'frozen', ySplit: 5, activeCell: 'A6' }]

  const inicio = meta.inicioProjeto ? fmtDataBR(meta.inicioProjeto.toISOString()) : ''
  const fim = meta.fimProjeto ? fmtDataBR(meta.fimProjeto.toISOString()) : ''

  // ── Cabeçalho ───────────────────────────────────────────────────────────────
  ws.mergeCells('A1:R1')
  const t1 = ws.getCell('A1')
  t1.value = 'PLANILHA DE CUSTOS'
  t1.font = { bold: true, size: 16 }
  t1.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  ws.mergeCells('A2:C2')
  ws.getCell('A2').value = `Projeto: ${meta.nomeProjeto}`
  ws.getCell('A2').font = { bold: true, size: 12 }

  ws.mergeCells('A3:C3')
  ws.getCell('A3').value = `Início do Projeto: ${inicio}`

  ws.mergeCells('D3:E3')
  ws.getCell('D3').value = `Fim do Projeto: ${fim}`
  ws.getCell('D3').alignment = { horizontal: 'right' }

  // ── Cabeçalhos do grupo ──────────────────────────────────────────────────────
  ws.getRow(4).height = 22
  ws.getCell('A4').value = 'Macrofases'
  ws.getCell('B4').value = 'Atividades'
  ws.getCell('C4').value = 'Elaborada por'
  ws.getCell('D4').value = 'VALOR ORÇADO'
  ws.getCell('K4').value = 'VALOR REALIZADO'
  ws.mergeCells('D4:J4')
  ws.mergeCells('K4:R4')
  for (let c = 1; c <= 18; c++) {
    const cell = ws.getCell(4, c)
    cell.font = { bold: true, color: { argb: 'FFFFFF' } }
    if (c >= 4) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_GRUPO } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    } else {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF' } }
    }
  }
  ws.getCell('D4').value = 'VALOR ORÇADO'
  ws.getCell('K4').value = 'VALOR REALIZADO'

  const subs = ['Min', 'Horas', 'Dias', 'R$', 'Materiais', 'Total', 'Data Prevista']
  ws.getRow(5).height = 20
  subs.forEach((s, i) => { ws.getCell(5, 4 + i).value = s })
  const subsReal = ['Min', 'Horas', 'Dias', 'R$', 'Materiais', 'Total', 'Data Realização', 'Situação']
  subsReal.forEach((s, i) => { ws.getCell(5, 11 + i).value = s })
  for (let c = 1; c <= 18; c++) {
    const cell = ws.getCell(5, c)
    cell.font = { bold: true, color: { argb: '1F3864' } }
    if (c >= 4) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_SUB } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    }
  }

  // ── Linhas de dados ──────────────────────────────────────────────────────────
  const fmtRowAtividade = (r: number, éReal: boolean) => {
    const base = éReal ? 11 : 4
    // Min
    ws.getCell(r, base).numFmt = '0 "min"'
    // Horas (h:mm)
    ws.getCell(r, base + 1).numFmt = DURACAO
    // Dias
    ws.getCell(r, base + 2).numFmt = DIAS
    // R$ (valor do minuto)
    ws.getCell(r, base + 3).numFmt = VALOR_MINUTO
    // Materiais
    ws.getCell(r, base + 4).numFmt = RESPALDO
    // Total
    ws.getCell(r, base + 5).numFmt = RESPALDO
    // Data
    ws.getCell(r, base + 6).numFmt = DATA_BR
  }

  let nextRow = 6
  const subTotalRows: number[] = []

  for (const fase of plan.macrofases) {
    // Linha da macrofase
    ws.getCell(nextRow, 1).value = `${fase.codigo} ${fase.titulo}`
    ws.getCell(nextRow, 1).font = { bold: true }
    for (let c = 2; c <= 18; c++) ws.getCell(nextRow, c).value = ''
    for (let c = 1; c <= 18; c++) {
      ws.getCell(nextRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FASE } }
    }
    const linhaFase = nextRow
    nextRow++

    for (const a of fase.atividades) {
      const r = nextRow
      ws.getCell(r, 1).value = ''
      ws.getCell(r, 2).value = `${a.codigo} ${a.titulo}`
      ws.getCell(r, 3).value = a.elaboradoPor

      // Orçado
      ws.getCell(r, 4).value = a.minOrcado
      ws.getCell(r, 5).value = { formula: `D${r}/1440` }
      if (a.jornadaDiaria !== null) ws.getCell(r, 6).value = { formula: `D${r}/60/${a.jornadaDiaria}` }
      // R$ = valor do minuto; Total = (Min × R$) + Materiais (sem R$, só os materiais).
      if (a.vpm !== null) {
        ws.getCell(r, 7).value = a.vpm
        ws.getCell(r, 9).value = { formula: `ROUND(D${r}*G${r},2)+H${r}` }
      } else if (a.materiaisOrcado) {
        ws.getCell(r, 9).value = { formula: `H${r}` }
      }
      ws.getCell(r, 8).value = a.materiaisOrcado
      ws.getCell(r, 10).value = dataCelula(a.dataPrevista)
      fmtRowAtividade(r, false)

      // Realizado
      ws.getCell(r, 11).value = a.minReal
      ws.getCell(r, 12).value = { formula: `K${r}/1440` }
      if (a.jornadaDiaria !== null) ws.getCell(r, 13).value = { formula: `K${r}/60/${a.jornadaDiaria}` }
      if (a.vpm !== null) {
        ws.getCell(r, 14).value = a.vpm
        ws.getCell(r, 16).value = { formula: `ROUND(K${r}*N${r},2)+O${r}` }
      } else if (a.materiaisReal) {
        ws.getCell(r, 16).value = { formula: `O${r}` }
      }
      ws.getCell(r, 15).value = a.materiaisReal
      ws.getCell(r, 17).value = dataCelula(a.dataRealizacao)
      ws.getCell(r, 18).value = a.situacao
      const status = ws.getCell(r, 18)
      status.font = { color: { argb: STATUS_FONT[a.situacao] }, bold: true }
      status.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[a.situacao] } }
      status.alignment = { horizontal: 'center' }
      fmtRowAtividade(r, true)

      borda(ws, ws.getRow(r))
      nextRow++
    }

    if (fase.atividades.length === 0) {
      ws.getCell(nextRow, 1).value = 'Sub-total (sem atividades)'
      ws.getCell(nextRow, 1).alignment = { horizontal: 'right', vertical: 'middle' }
    } else {
      // Sub-total da macrofase (cinza)
      const s = nextRow
      nextRow++
      ws.mergeCells(`A${s}:C${s}`)
      ws.getCell(s, 1).value = 'Sub-total'
      ws.getCell(s, 1).font = { bold: true, italic: true }
      // Rótulo encostado nos valores (SDD 4.7), no modelo do Prof. Fábio.
      ws.getCell(s, 1).alignment = { horizontal: 'right', vertical: 'middle' }
      // R$ (valor do minuto) não se soma.
      const cols = [4, 5, 6, 8, 9, 11, 12, 13, 15, 16]
      for (const c of cols) {
        const letter = ws.getColumn(c).letter
        ws.getCell(s, c).value = { formula: `SUM(${letter}${linhaFase + 1}:${letter}${s - 1})` }
      }
      for (let c = 1; c <= 18; c++) {
        const cell = ws.getCell(s, c)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_SUBTOTAL } }
        cell.font = { bold: true }
      }
      for (const c of [5, 12]) ws.getCell(s, c).numFmt = DURACAO
      for (const c of [6, 13]) ws.getCell(s, c).numFmt = DIAS
      for (const c of [8, 9, 15, 16]) ws.getCell(s, c).numFmt = RESPALDO
      borda(ws, ws.getRow(s))
      subTotalRows.push(s)
    }
  }

  // Total geral
  if (subTotalRows.length > 0) {
    const t = nextRow
    nextRow++
    ws.mergeCells(`A${t}:C${t}`)
    ws.getCell(t, 1).value = 'TOTAL GERAL'
    ws.getCell(t, 1).font = { bold: true, size: 12 }
    ws.getCell(t, 1).alignment = { horizontal: 'right', vertical: 'middle' }
    const lista = subTotalRows.join(',')
    // R$ (valor do minuto) não se soma.
      const cols = [4, 5, 6, 8, 9, 11, 12, 13, 15, 16]
    for (const c of cols) {
      const letter = ws.getColumn(c).letter
      ws.getCell(t, c).value = { formula: `SUM(${lista.split(',').map(i => `${letter}${i}`).join(',')})` }
    }
    for (let c = 1; c <= 18; c++) {
      const cell = ws.getCell(t, c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TOTAL } }
      cell.font = { bold: true }
      cell.border = { top: { style: 'medium' }, bottom: { style: 'double' } }
    }
    for (const c of [5, 12]) ws.getCell(t, c).numFmt = DURACAO
    for (const c of [6, 13]) ws.getCell(t, c).numFmt = DIAS
    for (const c of [8, 9, 15, 16]) ws.getCell(t, c).numFmt = RESPALDO
  }

  // ── Quadros-resumo ───────────────────────────────────────────────────────────
  let q = nextRow + 1
  const quadroTitulo = (titulo: string) => {
    ws.mergeCells(`A${q}:C${q}`)
    ws.getCell(q, 1).value = titulo
    ws.getCell(q, 1).font = { bold: true, size: 13 }
    ws.getRow(q).height = 22
    q++
  }
  const quadroHead = (a: string, b: string, c: string) => {
    ws.getCell(q, 1).value = a
    ws.getCell(q, 2).value = b
    ws.getCell(q, 3).value = c
    for (let col = 1; col <= 3; col++) {
      const cell = ws.getCell(q, col)
      cell.font = { bold: true, color: { argb: 'FFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_GRUPO } }
    }
    q++
  }

  // Quadro 1 — Valor por fase
  quadroTitulo('Resumo — Valor por Fase do Projeto')
  quadroHead('Fases do Projeto', 'Valor Orçado', 'Valor Real')
  const f1rows: number[] = []
  for (const v of plan.quadros.valor) {
    ws.getCell(q, 1).value = v.fase
    ws.getCell(q, 2).value = ''
    ws.getCell(q, 3).value = ''
    f1rows.push(q)
    q++
  }
  if (subTotalRows.length > 0) {
    subTotalRows.forEach((s, i) => {
      ws.getCell(f1rows[i], 2).value = { formula: `I${s}` }
      ws.getCell(f1rows[i], 3).value = { formula: `P${s}` }
      ws.getCell(f1rows[i], 2).numFmt = RESPALDO
      ws.getCell(f1rows[i], 3).numFmt = RESPALDO
    })
  }
  ws.getCell(q, 1).value = 'Total'
  ws.getCell(q, 2).value = f1rows.length > 0 ? { formula: `SUM(${f1rows.map(i => `B${i}`).join(',')})` } : 0
  ws.getCell(q, 3).value = f1rows.length > 0 ? { formula: `SUM(${f1rows.map(i => `C${i}`).join(',')})` } : 0
  ws.getCell(q, 2).numFmt = RESPALDO
  ws.getCell(q, 3).numFmt = RESPALDO
  for (let col = 1; col <= 3; col++) ws.getCell(q, col).font = { bold: true }
  q++

  // Quadro 2 — Tempo por fase
  quadroTitulo('Resumo — Tempo por Fase do Projeto')
  quadroHead('Fases do Projeto', 'Tempo Orçado (Min.)', 'Tempo Real (Min.)')
  const f2rows: number[] = []
  for (const t of plan.quadros.tempo) {
    ws.getCell(q, 1).value = t.fase
    f2rows.push(q)
    q++
  }
  if (subTotalRows.length > 0) {
    subTotalRows.forEach((s, i) => {
      ws.getCell(f2rows[i], 2).value = { formula: `D${s}` }
      ws.getCell(f2rows[i], 3).value = { formula: `K${s}` }
    })
  }
  ws.getCell(q, 1).value = 'Total'
  ws.getCell(q, 2).value = f2rows.length > 0 ? { formula: `SUM(${f2rows.map(i => `B${i}`).join(',')})` } : 0
  ws.getCell(q, 3).value = f2rows.length > 0 ? { formula: `SUM(${f2rows.map(i => `C${i}`).join(',')})` } : 0
  for (let col = 1; col <= 3; col++) ws.getCell(q, col).font = { bold: true }
  q++

  // Quadro 3 — Elaboradores
  quadroTitulo('Resumo — Distribuição por Elaborador')
  quadroHead('Elaborador por', 'Qtde. Atividades', 'Percentual')
  const primeiraAtividade = 6
  const ultimaAtividade = subTotalRows.length > 0 ? subTotalRows[0] - 2 : (plan.macrofases.length > 0 ? plan.macrofases[0].atividades.length + 5 : 5)
  const f3rows: number[] = []
  for (const e of plan.quadros.elaboradores) {
    ws.getCell(q, 1).value = e.elaborador
    const nome = e.elaborador.replaceAll('"', '')
    ws.getCell(q, 2).value = { formula: `COUNTIF($C$${primeiraAtividade}:$C$${ultimaAtividade},"${nome}")` }
    f3rows.push(q)
    q++
  }
  const f3total = q
  ws.getCell(f3total, 1).value = 'Total'
  ws.getCell(f3total, 2).value = f3rows.length > 0 ? { formula: `SUM(${f3rows.map(i => `B${i}`).join(',')})` } : 0
  ws.getCell(f3total, 3).value = f3rows.length > 0 ? { formula: `SUM(${f3rows.map(i => `C${i}`).join(',')})` } : 0
  ws.getCell(f3total, 3).numFmt = '0.0%'
  if (f3rows.length > 0) {
    f3rows.forEach(i => {
      ws.getCell(i, 3).value = { formula: `B${i}/$B$${f3total}` }
      ws.getCell(i, 3).numFmt = '0.0%'
    })
  }
  for (let col = 1; col <= 3; col++) ws.getCell(f3total, col).font = { bold: true }

  // ── Larguras ─────────────────────────────────────────────────────────────────
  const widths = [16, 46, 22, 9, 9, 10, 11, 11, 11, 13, 9, 9, 10, 11, 11, 11, 13, 13]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}