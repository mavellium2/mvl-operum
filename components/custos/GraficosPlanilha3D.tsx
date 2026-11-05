'use client'

import { memo, useState, useEffect, useRef, useId } from 'react'
import { SobDemandaPlanilha } from './CarregamentoPlanilha'
import GlassButton from '@/components/ui/GlassButton'
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
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numeros = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const valueText = (value: number, currency: boolean) => currency ? reais.format(value) : numeros.format(value)

// Shared by column rearrangement and the pie reveal; cancel on updates/unmount.
function useChartNumber(target: number, initial = target) {
  const [value, setValue] = useState(initial)
  const current = useRef(initial)
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = current.current
    let frame = 0
    let started: number | undefined
    const tick = (time: number) => {
      started ??= time
      const progress = reduced ? 1 : Math.min(1, (time - started) / 420)
      current.current = from + (target - from) * (1 - (1 - progress) ** 3)
      setValue(current.current)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return value
}

function Colunas3D({ title, rows, currency = false }: { title: string; rows: Linha[]; currency?: boolean }) {
  const [visible, setVisible] = useState([true, true])
  const [selected, setSelected] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const active = hovered
  const detail = active === null ? undefined : rows[active]
  const select = (index: number) => setSelected(current => current === index ? null : index)
  const scale = escalaExcel(rows.flatMap(row => [visible[0] ? row.orcado : 0, visible[1] ? row.real : 0]))
  const scaleMax = useChartNumber(scale.max)
  const solo = visible.filter(Boolean).length === 1
  const expansion = useChartNumber(solo ? 1.25 : 1)
  const position = useChartNumber(solo ? (visible[0] ? 0.5 : -0.5) : 0)
  const labelWidth = Math.max(42, ...rows.flatMap(row => [row.orcado, row.real]).map(value => valueText(value, currency).length * 5.5 + 12))
  const left = currency ? 110 : 60
  const width = Math.max(720, rows.length * (Math.max(128, labelWidth * 2 + 24)) + left + 35)
  const right = width - 35, bottom = 245, top = 28, dx = 13, dy = -11
  const groupWidth = (right - left) / Math.max(rows.length, 1)
  const barWidth = Math.min(Math.max(44, labelWidth), groupWidth / 2.5)
  const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step)
  return <GlassCard as="section" className="planilha-chart-card planilha-3d-card rounded-xl border">
    <div className="planilha-chart-heading"><div><h3>{title}</h3><p>{currency ? 'Comparativo de custos por macrofase' : 'Comparativo de tempo por macrofase'}</p></div><span>{rows.length} {rows.length === 1 ? 'fase' : 'fases'}</span></div>
    <div className="planilha-chart-legend">{['Orçado', 'Real'].map((name, index) => <GlassButton key={name} variant="custom" className="planilha-chart-toggle" aria-pressed={visible[index]} onClick={() => { setVisible(current => current.map((value, i) => i === index ? !value : value)); setHovered(null) }}><i style={{ background: CORES_EXCEL[index] }} />{name}</GlassButton>)}</div>
    <div className="planilha-3d-scroll" role="region" aria-label={`Visualização de ${title}`} tabIndex={0}>
    <svg viewBox={`0 0 ${width} 325`} role="group" aria-label={title} data-chart-type="clustered-column-3d" data-rotation-x="15" data-rotation-y="20" style={{ display: 'block', width: '100%', minWidth: Math.min(width, 720), fontFamily: 'inherit', color: 'var(--ap-text)', fill: 'currentColor' }}>
      <title>{title}</title><desc>{rows.map(row => `${row.fase}: Orçado ${valueText(row.orcado, currency)}, Real ${valueText(row.real, currency)}`).join('; ')}</desc>
      <path d={`M${left} ${top} l${dx * 2} ${dy * 2} V${bottom + dy * 2} L${left} ${bottom} Z M${left} ${bottom} H${right} l${dx * 2} ${dy * 2} H${left + dx * 2} M${right + dx * 2} ${bottom + dy * 2} V${top + dy * 2}`} fill="none" stroke="var(--ap-border)" strokeWidth={0.6} />
      {ticks.map(value => <text key={value} x={left - 3} y={bottom - value / scaleMax * (bottom - top) + 3} textAnchor="end" fontSize={11}>{valueText(Number(value.toPrecision(8)), currency)}</text>)}
      {rows.map((row, index) => {
        const center = left + groupWidth * (index + 0.5)
        return <g key={`${row.fase}:${index}`}>
          {[row.orcado, row.real].map((raw, series) => {
            const value = Math.max(0, Number.isFinite(raw) ? raw : 0)
            const height = value / scaleMax * (bottom - top)
            const x = center + (series - 1 + position) * barWidth * expansion
            const y = bottom - height
            const color = CORES_EXCEL[series]
            // SVG geometry needs an SVG control; an HTML GlassButton cannot wrap these paths.
            return <g key={series} role="button" tabIndex={visible[series] ? 0 : -1} aria-label={`${row.fase} · ${series === 0 ? 'Orçado' : 'Real'}: ${valueText(value, currency)}`} aria-pressed={selected === index} className="planilha-chart-mark planilha-chart-column" style={{ visibility: visible[series] ? 'visible' : 'hidden', opacity: visible[series] ? (active !== null && active !== index ? 0.35 : 1) : 0 }} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} onClick={() => select(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(index) } if (event.key === 'Escape') { setSelected(null); setHovered(null) } }} data-series={series === 0 ? 'Orçado' : 'Real'}>
              <title>{`${row.fase} · ${series === 0 ? 'Orçado' : 'Real'}: ${valueText(value, currency)}`}</title>
              <g className="planilha-chart-rise">
              <path d={`M${x} ${y} h${barWidth * expansion} v${height} h${-barWidth * expansion} Z`} fill={color} />
              <path d={`M${x} ${y} l${dx} ${dy} h${barWidth * expansion} l${-dx} ${-dy} Z`} fill={shade(color, 1.12)} />
              <path d={`M${x + barWidth * expansion} ${y} l${dx} ${dy} v${height} l${-dx} ${-dy} Z`} fill={shade(color, 0.78)} />
              </g>
            </g>
          })}
          <text x={center} y={bottom + 23} textAnchor="middle" fontSize={11}>
            <title>{row.fase}</title>
            {(row.fase.match(/.{1,22}(?:\s|$)|\S{23,}/g) ?? [row.fase]).map((line, lineIndex) => <tspan key={lineIndex} x={center} dy={lineIndex ? 14 : 0}>{line.trim()}</tspan>)}
          </text>
        </g>
      })}
      {!rows.length && <text x={width / 2} y={130} textAnchor="middle" fontSize={12} fill="var(--ap-muted)">Nenhuma macrofase com dados.</text>}
      <g data-chart-labels="foreground">
        {rows.flatMap((row, index) => {
          const center = left + groupWidth * (index + 0.5)
          return [row.orcado, row.real].map((raw, series) => {
            const value = Math.max(0, Number.isFinite(raw) ? raw : 0)
            return <g key={`${index}:${series}`} className="planilha-chart-value" data-value-label={series === 0 ? 'Orçado' : 'Real'} style={{ pointerEvents: 'none', visibility: visible[series] ? 'visible' : 'hidden', opacity: visible[series] ? (active !== null && active !== index ? 0.35 : 1) : 0 }}>
              <text x={center + (series - 0.5 + position) * barWidth * expansion} y={bottom - value / scaleMax * (bottom - top) + (value / scaleMax * (bottom - top) >= 14 ? 11 : -2)} textAnchor="middle" fontSize={9} fontWeight="600" fill="#fff">{valueText(value, currency)}</text>
            </g>
          })
        })}
      </g>
    </svg>
    </div>
    <div className="planilha-chart-detail" role="status">{detail ? <><strong>{detail.fase}</strong><span>Orçado: {valueText(detail.orcado, currency)} · Real: {valueText(detail.real, currency)} · Diferença (Real − Orçado): {valueText(detail.real - detail.orcado, currency)}</span></> : <span>Passe sobre uma coluna ou use Tab para ver os detalhes.</span>}</div>
  </GlassCard>
}
function sector(cx: number, cy: number, rx: number, ry: number, start: number, end: number) {
  const point = (angle: number) => `${cx + Math.cos(angle) * rx} ${cy + Math.sin(angle) * ry}`
  if (end - start >= Math.PI * 2 - 0.000001) return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`
  return `M${cx} ${cy} L${point(start)} A${rx} ${ry} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(end)} Z`
}
function Pizza3D({ rows, total }: { rows: { elaborador: string; qtdeAtividades: number; percentual: number }[]; total: number }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const active = hovered
  const select = (name: string) => setSelected(current => current === name ? null : name)
  const slices = rows.filter(row => row.qtdeAtividades > 0).map((row, index, data) => {
    const start = -Math.PI / 2 + data.slice(0, index).reduce((sum, item) => sum + item.percentual / 100 * Math.PI * 2, 0)
    const end = start + row.percentual / 100 * Math.PI * 2
    return { ...row, start, end, color: CORES_EXCEL[index % CORES_EXCEL.length] }
  })
  const reveal = useChartNumber(1, 0)
  const revealId = useId()
  const cx = 330, cy = 250, rx = 285, ry = rx * Math.sin(50 * Math.PI / 180), depth = 28
  return <GlassCard as="section" className="planilha-chart-card planilha-3d-card planilha-3d-pie-card rounded-xl border">
    <div className="planilha-chart-heading"><div><h3>Elaboração das Atividades (%)</h3><p>Distribuição das atividades entre os elaboradores</p></div><span>{total} atividades</span></div>
    <div className="planilha-3d-pie-layout">
    <svg viewBox="0 0 660 520" role="group" aria-label="Elaboração das Atividades (%)" data-chart-type="pie-3d" data-rotation-x="50" style={{ display: 'block', width: '100%', minWidth: 0, maxWidth: 600, fontFamily: 'inherit', color: 'var(--ap-text)', fill: 'currentColor' }}>
      <title>Elaboração das Atividades (%)</title><desc>{slices.map(row => `${row.elaborador}: ${row.percentual.toFixed(2)}%`).join('; ')}</desc>
      <defs><clipPath id={revealId}><path d={sector(cx, cy, 900, 900, -Math.PI / 2, -Math.PI / 2 + reveal * Math.PI * 2)} /></clipPath></defs>
      <g clipPath={`url(#${revealId})`}>
      {slices.map((slice, index) => <path key={`depth:${index}`} d={sector(cx, cy + depth, rx, ry, slice.start, slice.end)} fill={shade(slice.color, 0.72)} opacity={active && active !== slice.elaborador ? 0.35 : 1} />)}
      {/* SVG controls retain native geometry; matching HTML actions use GlassButton below. */}
      {slices.map((slice, index) => <g key={index} role="button" tabIndex={0} aria-label={`${slice.elaborador}: ${numeros.format(slice.percentual)}% · ${slice.qtdeAtividades} atividades`} aria-pressed={selected === slice.elaborador} className="planilha-chart-mark" opacity={active && active !== slice.elaborador ? 0.35 : 1} onMouseEnter={() => setHovered(slice.elaborador)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(slice.elaborador)} onBlur={() => setHovered(null)} onClick={() => select(slice.elaborador)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(slice.elaborador) } if (event.key === 'Escape') { setSelected(null); setHovered(null) } }}>
        <title>{`${slice.elaborador}: ${slice.percentual.toFixed(2)}% · ${slice.qtdeAtividades} atividades`}</title>
        <path d={sector(cx, cy, rx, ry, slice.start, slice.end)} fill={slice.color} />
        <text x={cx + Math.cos((slice.start + slice.end) / 2) * rx * 0.82} y={cy + Math.sin((slice.start + slice.end) / 2) * ry * 0.82} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight="600" fill="#102334">{slice.percentual.toFixed(2)}</text>
      </g>)}
      </g>
      {!slices.length && <text x={330} y={250} textAnchor="middle" fontSize={14} fill="var(--ap-muted)">{total ? 'Nenhuma atividade com elaborador.' : 'Nenhuma atividade cadastrada.'}</text>}
    </svg>
    <div className="planilha-3d-legend" aria-label="Elaboradores">{slices.map(slice => <GlassButton key={slice.elaborador} variant="custom" className="planilha-donut-item planilha-chart-toggle" aria-pressed={selected === slice.elaborador} onClick={() => select(slice.elaborador)} onMouseEnter={() => setHovered(slice.elaborador)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(slice.elaborador)} onBlur={() => setHovered(null)}><i style={{ backgroundColor: slice.color }} /><span title={slice.elaborador}>{slice.elaborador}</span><strong>{slice.qtdeAtividades}</strong><small>{slice.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</small></GlassButton>)}</div>
    </div>
    <div className="planilha-chart-detail" role="status">{active ? (() => { const row = slices.find(item => item.elaborador === active); return row ? `${row.elaborador}: ${row.qtdeAtividades} atividades · ${numeros.format(row.percentual)}%` : 'Selecione um elaborador.' })() : 'Passe sobre uma fatia ou selecione um elaborador para destacar sua participação.'}</div>
  </GlassCard>
}
export default memo(function GraficosPlanilha3D({ planilha }: { planilha: PlanilhaDeCustos }) {
  // A planilha usa atividades atribuídas por elaborador; a pizza normaliza as contagens
  // para fechar 100%, inclusive quando uma atividade possui vários elaboradores.
  const total = planilha.quadros.elaboradores.reduce((sum, row) => sum + Math.max(0, row.qtdeAtividades), 0)
  const rows = planilha.quadros.elaboradores.map(row => ({ ...row, percentual: total ? Math.max(0, row.qtdeAtividades) / total * 100 : 0 }))
  return <div className="planilha-charts planilha-3d-grid mt-4" data-planilha-charts="excel-3d" style={{ minWidth: 0 }}>
    <SobDemandaPlanilha whenVisible label="gráfico de valores"><Colunas3D title="Valores: Orçado e Real (R$)" currency rows={planilha.quadros.valor.map(row => ({ fase: row.fase, orcado: row.orcado, real: row.realizado }))} /></SobDemandaPlanilha>
    <SobDemandaPlanilha whenVisible label="gráfico de tempo"><Colunas3D title="Tempo: Orçado e Real (Minutos)" rows={planilha.quadros.tempo.map(row => ({ fase: row.fase, orcado: row.minOrcado, real: row.minReal }))} /></SobDemandaPlanilha>
    <SobDemandaPlanilha whenVisible label="gráfico de elaboradores"><Pizza3D rows={rows} total={planilha.qtdeAtividades} /></SobDemandaPlanilha>
  </div>
})
