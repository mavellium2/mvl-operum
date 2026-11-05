'use client'

import { memo } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import type { PlanilhaDeCustos } from '@/lib/planilhaCustos'

// Referência: Planilha de Custos.xlsx, chart1/2 (rotX=15, rotY=20) e chart3 (rotX=50).
export const CORES_EXCEL = ['#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646']
const shade = (hex: string, factor: number) => `#${hex.slice(1).match(/../g)!.map(value => Math.min(255, Math.round(parseInt(value, 16) * factor)).toString(16).padStart(2, '0')).join('')}`
export function escalaExcel(values: number[]) {
  const max = Math.max(0, ...values.filter(Number.isFinite))
  const power = 10 ** Math.floor(Math.log10((max || 1) / 6))
  const step = ([1, 2, 2.5, 5, 10].find(value => value * power >= max / 6) ?? 10) * power
  return { step, max: Math.max(step, Math.ceil(max / step) * step) }
}
type Linha = { fase: string; orcado: number; real: number }
const valueText = (value: number, currency: boolean) => currency ? value.toFixed(2) : Number(value.toFixed(2)).toString()

function Colunas3D({ title, rows, currency = false }: { title: string; rows: Linha[]; currency?: boolean }) {
  const scale = escalaExcel(rows.flatMap(row => [row.orcado, row.real]))
  const width = Math.max(1000, rows.length * 68 + 600)
  const left = 355, right = width - 240, bottom = 155, top = 60, dx = 9, dy = -8
  const groupWidth = (right - left) / Math.max(rows.length, 1)
  const barWidth = Math.min(18, groupWidth / 3)
  const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step)
  return <GlassCard as="section" className="planilha-excel-chart" style={{ background: '#fff', color: '#000', borderRadius: 0, boxShadow: 'none', border: '1px solid #d9d9d9' }}>
    <svg viewBox={`0 0 ${width} 310`} role="img" aria-label={title} data-chart-type="clustered-column-3d" data-rotation-x="15" data-rotation-y="20" style={{ display: 'block', width: '100%', minWidth: 800, fontFamily: 'Calibri, Carlito, Arial, sans-serif' }}>
      <title>{title}</title><desc>{rows.map(row => `${row.fase}: Orçado ${valueText(row.orcado, currency)}, Real ${valueText(row.real, currency)}`).join('; ')}</desc>
      <text x={width / 2} y={31} textAnchor="middle" fontSize={17} fontWeight="bold" fill="#757575">{title}</text>
      <path d={`M${left} ${top} l${dx * 2} ${dy * 2} V${bottom + dy * 2} L${left} ${bottom} Z M${left} ${bottom} H${right} l${dx * 2} ${dy * 2} H${left + dx * 2} M${right + dx * 2} ${bottom + dy * 2} V${top + dy * 2}`} fill="none" stroke="#888" strokeWidth={0.6} />
      {ticks.map(value => <text key={value} x={left - 3} y={bottom - value / scale.max * (bottom - top) + 3} textAnchor="end" fontSize={9}>{Number(value.toPrecision(8))}</text>)}
      {rows.map((row, index) => {
        const center = left + groupWidth * (index + 0.5)
        return <g key={`${row.fase}:${index}`}>
          {[row.orcado, row.real].map((raw, series) => {
            const value = Math.max(0, Number.isFinite(raw) ? raw : 0)
            const height = value / scale.max * (bottom - top)
            const x = center + (series - 1) * barWidth
            const y = bottom - height
            const color = CORES_EXCEL[series]
            return <g key={series} data-series={series === 0 ? 'Orçado' : 'Real'}>
              <title>{row.fase} · {series === 0 ? 'Orçado' : 'Real'}: {valueText(value, currency)}</title>
              <path d={`M${x} ${y} h${barWidth} v${height} h${-barWidth} Z`} fill={color} />
              <path d={`M${x} ${y} l${dx} ${dy} h${barWidth} l${-dx} ${-dy} Z`} fill={shade(color, 1.12)} />
              <path d={`M${x + barWidth} ${y} l${dx} ${dy} v${height} l${-dx} ${-dy} Z`} fill={shade(color, 0.78)} />
              <text x={x + barWidth / 2 + dx / 2} y={y + dy - 4} textAnchor="middle" fontSize={10} fontWeight="bold">{valueText(value, currency)}</text>
            </g>
          })}
          <text transform={`translate(${center + 4},${bottom + 10}) rotate(-45)`} textAnchor="end" fontSize={9}>{row.fase}</text>
        </g>
      })}
      {!rows.length && <text x={width / 2} y={130} textAnchor="middle" fontSize={12} fill="#757575">Nenhuma macrofase com dados.</text>}
    </svg>
  </GlassCard>
}
function sector(cx: number, cy: number, rx: number, ry: number, start: number, end: number) {
  const point = (angle: number) => `${cx + Math.cos(angle) * rx} ${cy + Math.sin(angle) * ry}`
  if (end - start >= Math.PI * 2 - 0.000001) return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`
  return `M${cx} ${cy} L${point(start)} A${rx} ${ry} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(end)} Z`
}
function Pizza3D({ rows, total }: { rows: { elaborador: string; qtdeAtividades: number; percentual: number }[]; total: number }) {
  const slices = rows.filter(row => row.qtdeAtividades > 0).map((row, index, data) => {
    const start = -Math.PI / 2 + data.slice(0, index).reduce((sum, item) => sum + item.percentual / 100 * Math.PI * 2, 0)
    const end = start + row.percentual / 100 * Math.PI * 2
    return { ...row, start, end, color: CORES_EXCEL[index % CORES_EXCEL.length] }
  })
  const cx = 365, cy = 280, rx = 285, ry = rx * Math.sin(50 * Math.PI / 180), depth = 28
  const height = Math.max(560, slices.length * 30 + 100)
  return <GlassCard as="section" className="planilha-excel-chart" style={{ background: '#fff', color: '#000', borderRadius: 0, boxShadow: 'none', border: '1px solid #d9d9d9' }}>
    <svg viewBox={`0 0 1000 ${height}`} role="img" aria-label="Elaboração das Atividades (%)" data-chart-type="pie-3d" data-rotation-x="50" style={{ display: 'block', width: '100%', minWidth: 700, fontFamily: 'Calibri, Carlito, Arial, sans-serif' }}>
      <title>Elaboração das Atividades (%)</title><desc>{slices.map(row => `${row.elaborador}: ${row.percentual.toFixed(2)}%`).join('; ')}</desc>
      <text x={500} y={32} textAnchor="middle" fontSize={22} fontWeight="bold" fill="#757575">Elaboração das Atividades (%)</text>
      {slices.map((slice, index) => <path key={`depth:${index}`} d={sector(cx, cy + depth, rx, ry, slice.start, slice.end)} fill={shade(slice.color, 0.72)} />)}
      {slices.map((slice, index) => <g key={index}>
        <title>{slice.elaborador}: {slice.percentual.toFixed(2)}% · {slice.qtdeAtividades} atividades</title>
        <path d={sector(cx, cy, rx, ry, slice.start, slice.end)} fill={slice.color} />
        <text x={cx + Math.cos((slice.start + slice.end) / 2) * rx * 0.82} y={cy + Math.sin((slice.start + slice.end) / 2) * ry * 0.82} textAnchor="middle" dominantBaseline="middle" fontSize={12}>{slice.percentual.toFixed(2)}</text>
        <rect x={690} y={250 + index * 30} width={13} height={13} fill={slice.color} />
        <text x={710} y={263 + index * 30} fontSize={20} fontWeight="bold">{slice.elaborador}</text>
      </g>)}
      {!slices.length && <text x={500} y={280} textAnchor="middle" fontSize={14} fill="#757575">{total ? 'Nenhuma atividade com elaborador.' : 'Nenhuma atividade cadastrada.'}</text>}
    </svg>
  </GlassCard>
}
export default memo(function GraficosPlanilha3D({ planilha }: { planilha: PlanilhaDeCustos }) {
  // A planilha usa atividades atribuídas por elaborador; a pizza normaliza as contagens
  // para fechar 100%, inclusive quando uma atividade possui vários elaboradores.
  const total = planilha.quadros.elaboradores.reduce((sum, row) => sum + Math.max(0, row.qtdeAtividades), 0)
  const rows = planilha.quadros.elaboradores.map(row => ({ ...row, percentual: total ? Math.max(0, row.qtdeAtividades) / total * 100 : 0 }))
  return <div className="mt-4 grid gap-5" data-planilha-charts="excel-3d" style={{ minWidth: 0 }}>
    <Colunas3D title="Valores: Orçado e Real (R$)" currency rows={planilha.quadros.valor.map(row => ({ fase: row.fase, orcado: row.orcado, real: row.realizado }))} />
    <Colunas3D title="Tempo: Orçado e Real (Minutos)" rows={planilha.quadros.tempo.map(row => ({ fase: row.fase, orcado: row.minOrcado, real: row.minReal }))} />
    <Pizza3D rows={rows} total={planilha.qtdeAtividades} />
  </div>
})
