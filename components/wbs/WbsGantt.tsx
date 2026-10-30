'use client'

import Select from '@/components/ui/Select'
import { useMemo, useState } from 'react'
import type { WbsNodeClient } from '@/types/wbs'
import { DAY_MS, dateLabel, ganttRows, plannedSchedule } from '@/lib/wbsGantt'

export default function WbsGantt({ nodes, rootId, today }: {
  nodes: Record<string, WbsNodeClient>; rootId: string | null; today: string
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [zoom, setZoom] = useState<'day' | 'week' | 'month'>('week')
  const rows = useMemo(() => ganttRows(nodes, rootId, collapsed), [nodes, rootId, collapsed])
  const schedules = Object.values(nodes).map(n => plannedSchedule(n)).filter(s => s !== null)
  const now = Date.parse(`${today}T00:00:00Z`)
  const start = Math.min(now, ...schedules.map(s => s.start)) - DAY_MS
  const end = Math.max(now, ...schedules.map(s => s.end)) + 2 * DAY_MS
  const days = (end - start) / DAY_MS
  const dayWidth = zoom === 'day' ? 36 : zoom === 'week' ? 12 : 4
  // Bound DOM/scroll size for projects spanning many years.
  const width = Math.min(32000, Math.max(720, days * dayWidth))
  const scale = width / (end - start)
  const step = Math.max(zoom === 'day' ? 1 : zoom === 'week' ? 7 : 30, Math.ceil(days / 150))
  const ticks = Array.from({ length: Math.ceil(days / step) }, (_, i) => start + i * step * DAY_MS)
  return <section className="flex-1 overflow-auto bg-white" aria-label="Gantt do projeto">
    <div className="p-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">Zoom <Select ariaLabel="Zoom do Gantt" className="w-32" searchable={false} value={zoom} onChange={v => setZoom(v as typeof zoom)}
        options={[{ value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mês' }]} /></div>
      <p className="text-xs text-gray-600">Somente leitura. O período estimado termina na data prevista e usa a duração em dias corridos. Nós sem data ficam sem barra.</p>
    </div>
    <div style={{ minWidth: width + 280 }}>
      <div className="flex h-10 border-b" aria-hidden="true">
        <div className="w-[280px] shrink-0 sticky left-0 bg-white z-20 px-3">Elemento da EAP</div>
        <div className="relative" style={{ width }}>{ticks.map(t => <span key={t} className="absolute text-xs" style={{ left: (t - start) * scale }}>{dateLabel(t)}</span>)}</div>
      </div>
      {rows.map(({ node, depth }) => {
        const schedule = plannedSchedule(node)
        return <div key={node.id} className="flex h-11 border-b">
          <div className="w-[280px] shrink-0 sticky left-0 bg-white z-20 flex items-center gap-1 overflow-hidden" style={{ paddingLeft: 8 + depth * 16 }}>
            {node.childrenIds.length > 0 ? <button type="button" aria-label={`${collapsed.has(node.id) ? 'Expandir' : 'Recolher'} ${node.title}`} aria-expanded={!collapsed.has(node.id)} onClick={() => setCollapsed(previous => {
              const next = new Set(previous); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next
            })} className="w-5 shrink-0">{collapsed.has(node.id) ? '+' : '−'}</button> : <span className="w-5 shrink-0" />}
            <span className="truncate" title={`${node.code} ${node.title}`}>{node.code} {node.title}</span>
          </div>
          <div className="relative" style={{ width }}>
            <span className="absolute h-full border-l-2 border-red-500 z-10" style={{ left: (now - start) * scale }} title={`Hoje: ${dateLabel(now)}`} />
            {schedule ? <div className={`absolute top-3 h-5 rounded ${node.childrenIds.length ? 'bg-slate-600' : 'bg-blue-500'}`} style={{ left: (schedule.start - start) * scale, width: Math.max(3, (schedule.end - schedule.start + DAY_MS) * scale) }} role="img" aria-label={`${node.title}: ${dateLabel(schedule.start)} a ${dateLabel(schedule.end)}`} title={`${dateLabel(schedule.start)} a ${dateLabel(schedule.end)}`} /> : <span className="text-xs text-gray-400 leading-[44px] px-2">Sem data prevista</span>}
          </div>
        </div>
      })}
    </div>
  </section>
}
