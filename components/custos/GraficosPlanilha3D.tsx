'use client'

import { memo, useState, useEffect, useRef, useId, type CSSProperties } from 'react'
import { SobDemandaPlanilha, useAnimacaoGraficoVisivel } from './CarregamentoPlanilha'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GlassButton from '@/components/ui/GlassButton'
import GlassCard from '@/components/ui/GlassCard'
import type { PlanilhaDeCustos } from '@/lib/planilhaCustos'
import { formatarMinutos } from '@/lib/tempoRealizado'
import { fmtDataBR, maiorData } from '@/lib/planilhaCustos'
import SeloSituacao from './SeloSituacao'

// Referência: Planilha de Custos.xlsx, chart1/2 (rotX=15, rotY=20) e chart3 (rotX=50).
export const CORES_EXCEL = ['#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646']
/** Cores extras, bem diferentes das seis do Excel, para não repetir cor entre pessoas ou atividades. */
const CORES_EXTRAS = ['#D4A017', '#C2185B', '#00897B', '#6D4C41', '#283593', '#E57373', '#546E7A', '#AFB42B', '#4DB6AC']
const hslParaHex = (h: number, s: number, l: number) => {
  const a = s * Math.min(l, 1 - l)
  const canal = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0') }
  return `#${canal(0)}${canal(8)}${canal(4)}`
}
/** Cor única por posição: Excel, depois as extras e, além delas, matizes espaçados pelo ângulo de ouro. */
export function corUnica(index: number): string {
  if (index < CORES_EXCEL.length) return CORES_EXCEL[index]
  const extra = index - CORES_EXCEL.length
  if (extra < CORES_EXTRAS.length) return CORES_EXTRAS[extra]
  const n = extra - CORES_EXTRAS.length
  return hslParaHex((n * 137.508 + 47) % 360, 0.55, n % 2 ? 0.62 : 0.46)
}
/** Texto legível sobre a cor da fatia. */
const textoSobre = (hex: string) => {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5 ? '#ffffff' : '#102334'
}
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
const porcentagem = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const valueText = (value: number, currency: boolean) => currency ? reais.format(value) : numeros.format(value)

// Shared by column rearrangement and the pie reveal; cancel on updates/unmount.
function useChartNumber(target: number, initial = target, duration = 420) {
  const [value, setValue] = useState(initial)
  const current = useRef(initial)
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const from = current.current
    if (from === target) return
    let frame = 0
    let started: number | undefined
    const tick = (time: number) => {
      started ??= time
      const progress = reduced ? 1 : Math.min(1, (time - started) / duration)
      const eased = duration > 420 ? progress * progress * (3 - 2 * progress) : 1 - (1 - progress) ** 3
      current.current = from + (target - from) * eased
      setValue(current.current)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])
  return value
}

function Colunas3D({ title, rows, currency = false }: { title: string; rows: Linha[]; currency?: boolean }) {
  const { ref: chartRef, entered } = useAnimacaoGraficoVisivel()
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
  const labelWidth = Math.max(42, ...rows.flatMap(row => [row.orcado, row.real]).map(value => valueText(value, currency).length * 6.4 + 12))
  const left = currency ? 110 : 60
  const width = Math.max(720, rows.length * (Math.max(128, labelWidth * 2 + 24)) + left + 35)
  // Rótulos das fases na diagonal: uma linha só, cortada com reticências; o nome
  // completo fica no title e no detalhe abaixo do gráfico.
  const LIMITE_ROTULO = 24
  const height = 365
  const right = width - 35, bottom = 245, top = 28, dx = 13, dy = -11
  const groupWidth = (right - left) / Math.max(rows.length, 1)
  const barWidth = Math.min(Math.max(44, labelWidth), groupWidth / 2.5)
  const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step)
  return <GlassCard as="section" className="planilha-chart-card planilha-3d-card rounded-xl border">
    <div className="planilha-chart-heading"><div><h3>{title}</h3><p>{currency ? 'Comparativo de custos por macrofase' : 'Comparativo de tempo por macrofase'}</p></div><span>{rows.length} {rows.length === 1 ? 'fase' : 'fases'}</span></div>
    <div className="planilha-chart-legend">{['Orçado', 'Real'].map((name, index) => <GlassButton key={name} variant="custom" className="planilha-chart-toggle" aria-pressed={visible[index]} onClick={() => { setVisible(current => current.map((value, i) => i === index ? !value : value)); setHovered(null) }}><i style={{ background: CORES_EXCEL[index] }} />{name}</GlassButton>)}</div>
    <div className="planilha-3d-scroll" role="region" aria-label={`Visualização de ${title}`} tabIndex={0}>
    <svg ref={chartRef} data-entered={entered} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={title} data-chart-type="clustered-column-3d" data-rotation-x="15" data-rotation-y="20" style={{ display: 'block', width: '100%', minWidth: width, fontFamily: 'inherit', color: 'var(--ap-text)', fill: 'currentColor' }}>
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
          <text x={center} y={bottom + 18} transform={`rotate(-35 ${center} ${bottom + 18})`} textAnchor="end" fontSize={12} data-rotulo-fase="">
            <title>{row.fase}</title>
            {row.fase.length > LIMITE_ROTULO ? `${row.fase.slice(0, LIMITE_ROTULO - 1).trimEnd()}…` : row.fase}
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
              <text x={center + (series - 0.5 + position) * barWidth * expansion} y={bottom - value / scaleMax * (bottom - top) + (value / scaleMax * (bottom - top) >= 16 ? 12 : -3)} textAnchor="middle" fontSize={10.5} fontWeight="600" fill={value / scaleMax * (bottom - top) >= 16 ? '#fff' : 'var(--ap-text)'}>{valueText(value, currency)}</text>
            </g>
          })
        })}
      </g>
    </svg>
    </div>
    <div className="planilha-chart-detail" role="status">{detail ? <><strong>{detail.fase}</strong><span>Orçado: {valueText(detail.orcado, currency)} · Real: {valueText(detail.real, currency)} · Diferença (Real − Orçado): {valueText(detail.real - detail.orcado, currency)}</span></> : <span>Passe sobre uma coluna ou use Tab para ver os detalhes.</span>}</div>
  </GlassCard>
}
/** Quanto a fatia em destaque sobe (unidades do desenho). */
const ELEVACAO = 18
const minutosTexto = (minutos: number) => `${formatarMinutos(minutos)} min`
const horasTexto = (minutos: number) => { const total = Math.round(Math.max(0, minutos)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` }
const diasTexto = (dias: number) => dias.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A sprint criada pela EAP tem o nome da própria macrofase; nesse caso não repete. */
const mesmoNome = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function sector(cx: number, cy: number, rx: number, ry: number, start: number, end: number) {
  const point = (angle: number) => `${cx + Math.cos(angle) * rx} ${cy + Math.sin(angle) * ry}`
  if (end - start >= Math.PI * 2 - 0.000001) return `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`
  return `M${cx} ${cy} L${point(start)} A${rx} ${ry} 0 ${end - start > Math.PI ? 1 : 0} 1 ${point(end)} Z`
}
/**
 * Lateral visível de uma fatia: só a borda da frente (ângulos 0…π), descendo `altura`.
 * As emendas entre fatias ficam verticais, como num cilindro, em vez de seguir o raio.
 */
function parede(cx: number, cy: number, rx: number, ry: number, start: number, end: number, altura: number): string | null {
  const a = Math.max(start, 0), b = Math.min(end, Math.PI)
  if (b - a <= 0.0001) return null
  const point = (angle: number, dy: number) => `${cx + Math.cos(angle) * rx} ${cy + Math.sin(angle) * ry + dy}`
  return `M${point(a, 0)} A${rx} ${ry} 0 0 1 ${point(b, 0)} L${point(b, altura)} A${rx} ${ry} 0 0 0 ${point(a, altura)} Z`
}
/**
 * Altura atual da fatia em destaque: sobe de 0 até ELEVACAO a cada troca de fatia.
 * Anima só a altura (a base fica parada), então nada passa por cima das vizinhas.
 */
function useElevacao(chave: string | null) {
  // A altura fica guardada junto da fatia: ao trocar de fatia, a nova começa em 0, sem piscar levantada.
  const [estado, setEstado] = useState<{ chave: string | null; altura: number }>({ chave: null, altura: 0 })
  useEffect(() => {
    if (!chave) return
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let inicio: number | undefined
    const passo = (agora: number) => {
      inicio ??= agora
      const t = reduzido ? 1 : Math.min(1, (agora - inicio) / 180)
      setEstado({ chave, altura: ELEVACAO * (1 - (1 - t) ** 3) })
      if (t < 1) frame = requestAnimationFrame(passo)
    }
    frame = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(frame)
  }, [chave])
  return chave && estado.chave === chave ? estado.altura : 0
}
type SomaTabela = { minOrcado: number; minReal: number; diasOrcado: number; diasReal: number; matOrcado: number; matReal: number; valorOrcado: number; valorReal: number; dataFim: string }
/** Linha de soma igual à da planilha: Sub-total da macrofase ou Total da pessoa. */
function LinhaSoma({ rotulo, ariaLabel, soma, colSpan, total = false }: { rotulo: string; ariaLabel: string; soma: SomaTabela; colSpan: number; total?: boolean }) {
  const acima = (real: number, orcado: number) => real > orcado && orcado > 0 || undefined
  return <tr aria-label={ariaLabel} className={total ? 'planilha-pie-tabela-total' : 'planilha-pie-tabela-subtotal'}>
    <th scope="row" colSpan={colSpan}>{rotulo}</th>
    <td data-inicio-grupo>{formatarMinutos(soma.minOrcado)}</td><td>{horasTexto(soma.minOrcado)}</td><td>{diasTexto(soma.diasOrcado)}</td><td />
    <td>{reais.format(soma.matOrcado)}</td><td className="planilha-pie-tabela-valor" aria-label={`${rotulo} orçado: ${reais.format(soma.valorOrcado)}`}>{reais.format(soma.valorOrcado)}</td>
    <td className="planilha-pie-tabela-data" title="Data fim: maior data prevista">{soma.dataFim || '—'}</td>
    <td data-inicio-grupo data-acima={acima(soma.minReal, soma.minOrcado)}>{formatarMinutos(soma.minReal)}</td><td data-acima={acima(soma.minReal, soma.minOrcado)}>{horasTexto(soma.minReal)}</td><td data-acima={acima(soma.minReal, soma.minOrcado)}>{diasTexto(soma.diasReal)}</td><td />
    <td data-acima={acima(soma.matReal, soma.matOrcado)}>{reais.format(soma.matReal)}</td><td className="planilha-pie-tabela-valor" aria-label={`${rotulo} realizado: ${reais.format(soma.valorReal)}`} data-acima={acima(soma.valorReal, soma.valorOrcado)}>{reais.format(soma.valorReal)}</td>
    <td colSpan={2} />
  </tr>
}
function Pizza3D({ rows, total, planilha }: { rows: PlanilhaDeCustos['quadros']['elaboradores']; total: number; planilha: PlanilhaDeCustos }) {
  const { ref: chartRef, entered } = useAnimacaoGraficoVisivel()
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const userButtons = useRef(new Map<string, HTMLButtonElement>())
  const [userKey, setUserKey] = useState<string | null>(null)
  // Cada troca de elaborador avança o ciclo e a pizza se redesenha a partir do topo.
  const [ciclo, setCiclo] = useState(0)
  const trocarUsuario = (key: string | null) => { if (key === userKey) return; setUserKey(key); setCiclo(value => value + 1) }
  const user = rows.find(row => (row.userId ?? row.elaborador) === userKey)
  const close = () => { if (userKey) userButtons.current.get(userKey)?.focus({ preventScroll: true }); trocarUsuario(null); setSelected(null); setHovered(null) }
  useEffect(() => {
    if (!userKey) return
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !container.current?.contains(event.target)) { setUserKey(null); setCiclo(value => value + 1); setSelected(null); setHovered(null) } }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [userKey])
  const groups = user ? planilha.macrofases.flatMap(phase => {
    const activities = phase.atividades.filter(activity => user.userId
      ? activity.elaboradoPorUserIds.includes(user.userId) || activity.elaboradoPorUserId === user.userId && !activity.elaboradoPorUserIds.length
      : activity.elaboradoPor.split(',').some(name => name.trim() === user.elaborador))
    const sprints = new Map<string, typeof activities>()
    for (const activity of activities) {
      const id = activity.card?.sprintId ?? 'sem-sprint'
      sprints.set(id, [...(sprints.get(id) ?? []), activity])
    }
    return [...sprints].map(([id, tasks]) => ({ key: `${phase.nodeId}:${id}`, sprintId: id, phase: `${phase.codigo} ${phase.titulo}`, sprint: tasks[0].card?.sprintId ? tasks[0].card.sprintNome ?? phase.titulo : 'Sem sprint vinculada', tasks }))
  }) : []
  const taskCount = groups.reduce((sum, group) => sum + group.tasks.length, 0)
  const jornadaDe = (task: { jornadaDiaria?: number | null }) => task.jornadaDiaria || planilha.config?.horasPorDia || 8
  const diasDe = (minutos: number, task: { jornadaDiaria?: number | null }) => Math.max(0, minutos || 0) / 60 / jornadaDe(task)
  type Tarefa = (typeof groups)[number]['tasks'][number]
  /** Somas de tempo, dias, materiais e valor, usadas no subtotal de cada macrofase e no total. */
  const somaDe = (tarefas: Tarefa[]) => tarefas.reduce<SomaTabela>((soma, task) => ({
    ...soma,
    minOrcado: soma.minOrcado + Math.max(0, task.minOrcado || 0), minReal: soma.minReal + Math.max(0, task.minReal || 0),
    diasOrcado: soma.diasOrcado + diasDe(task.minOrcado, task), diasReal: soma.diasReal + diasDe(task.minReal, task),
    matOrcado: soma.matOrcado + (task.materiaisOrcado || 0), matReal: soma.matReal + (task.materiaisReal || 0),
    valorOrcado: soma.valorOrcado + (task.totalOrcado ?? 0), valorReal: soma.valorReal + (task.totalReal ?? 0),
  }), { minOrcado: 0, minReal: 0, diasOrcado: 0, diasReal: 0, matOrcado: 0, matReal: 0, valorOrcado: 0, valorReal: 0, dataFim: fmtDataBR(maiorData(tarefas.map(task => task.dataPrevista))) })
  const somaTotal = somaDe(groups.flatMap(group => group.tasks))
  // Com um elaborador aberto, cada atividade dele é uma fatia proporcional ao tempo
  // planejado (orçado). Sem tempo planejado em nenhuma, as fatias ficam iguais.
  const minutosPlanejados = groups.reduce((sum, group) => sum + group.tasks.reduce((total, task) => total + Math.max(0, task.minOrcado || 0), 0), 0)
  const displayRows: { key: string; elaborador: string; qtdeAtividades: number; percentual: number; rotulo?: string; detalhe?: string }[] = user
    ? groups.flatMap(group => group.tasks.map(task => {
      const minutos = Math.max(0, task.minOrcado || 0)
      const percentual = minutosPlanejados ? minutos / minutosPlanejados * 100 : 100 / taskCount
      const tempo = minutosPlanejados ? ` · ${numeros.format(percentual)}% do tempo planejado (${formatarMinutos(minutos)} min)` : ''
      return { key: task.nodeId, elaborador: `${task.codigo} ${task.titulo}`, qtdeAtividades: minutosPlanejados ? minutos : 1, percentual, rotulo: task.codigo, detalhe: `${group.phase} · ${group.sprint}${tempo}` }
    }))
    : rows.map(row => ({ ...row, key: row.userId ?? row.elaborador }))
  const active = hovered ?? (user ? selected : null)
  const select = (key: string) => {
    if (!user) { userButtons.current.get(key)?.focus({ preventScroll: true }); trocarUsuario(key); setSelected(null); setHovered(null) }
    else setSelected(current => current === key ? null : key)
  }
  // A cor vem da posição original (igual à legenda), não da lista já filtrada.
  const slices = displayRows.map((row, posicao) => ({ ...row, color: corUnica(posicao) })).filter(row => row.qtdeAtividades > 0).map((row, index, data) => {
    const start = -Math.PI / 2 + data.slice(0, index).reduce((sum, item) => sum + item.percentual / 100 * Math.PI * 2, 0)
    const end = start + row.percentual / 100 * Math.PI * 2
    return { ...row, start, end }
  })
  const corDa = (key: string) => slices.find(slice => slice.key === key)?.color
  // Muitas pessoas: a legenda se divide em colunas para não esticar a altura do gráfico.
  const colunasLegenda = rows.length > 12 ? 3 : rows.length > 6 ? 2 : 1
  // Só levanta depois da animação de entrada, para não sair do recorte do desenho.
  const elevada = active ? slices.find(slice => slice.key === active) ?? null : null
  const altura = useElevacao(elevada?.key ?? null)
  const descreverFatia = (slice: (typeof slices)[number]) => user
    ? `${slice.elaborador} · ${slice.detalhe}`
    : `${slice.elaborador}: ${numeros.format(slice.percentual)}% · ${slice.qtdeAtividades} atividades`
  const reveal = Math.max(0, useChartNumber(entered ? ciclo + 1 : 0, 0, 700) - ciclo)
  const revealId = useId()
  const cx = 330, cy = 250, rx = 285, ry = rx * Math.sin(50 * Math.PI / 180), depth = 28
  return <div ref={container} onKeyDown={event => { if (event.key === 'Escape') close() }}><GlassCard as="section" className="planilha-chart-card planilha-3d-card planilha-3d-pie-card rounded-xl border">
    <div className="planilha-chart-heading"><div key={userKey ?? 'todos'} className="planilha-pie-heading"><h3>{user ? `Atividades de ${user.elaborador}` : 'Elaboração das Atividades (%)'}</h3><p>{user ? minutosPlanejados ? 'Cada fatia é uma atividade, do tamanho do seu tempo planejado' : 'Cada fatia é uma atividade deste elaborador' : 'Distribuição das atividades entre os elaboradores'}</p></div><span>{user ? taskCount : total} atividades</span>{user && <GlassCloseButton label="Voltar para todos os elaboradores" onClick={close} />}</div>
    <div className="planilha-3d-pie-layout" data-com-atividades={user ? true : undefined} style={{ '--legenda-colunas': colunasLegenda } as CSSProperties}>
    <svg ref={chartRef} data-entered={entered} viewBox="0 0 660 520" onMouseLeave={() => setHovered(null)} role="group" aria-label={user ? `Atividades de ${user.elaborador}` : 'Elaboração das Atividades (%)'} data-chart-type="pie-3d" data-rotation-x="50" style={{ display: 'block', width: '100%', minWidth: 0, maxWidth: user ? 400 : 600, fontFamily: 'inherit', color: 'var(--ap-text)', fill: 'currentColor' }}>
      <title>{user ? `Atividades de ${user.elaborador}` : 'Elaboração das Atividades (%)'}</title><desc>{slices.map(row => user ? row.elaborador : `${row.elaborador}: ${row.percentual.toFixed(2)}%`).join('; ')}</desc>
      <defs>
        <clipPath id={`${revealId}-top`}><path d={sector(cx, cy, rx + 1, ry + 1, -Math.PI / 2, -Math.PI / 2 + reveal * Math.PI * 2)} /></clipPath>
        <clipPath id={`${revealId}-depth`}><path d={sector(cx, cy, rx + 2, ry + depth + 2, -Math.PI / 2, -Math.PI / 2 + reveal * Math.PI * 2)} /></clipPath>
      </defs>
      {/* Fundo: sair das fatias limpa o destaque sem piscar ao cruzar a borda entre duas fatias. */}
      <rect x={0} y={0} width={660} height={520} fill="transparent" onMouseEnter={() => setHovered(null)} />
      <g clipPath={`url(#${revealId}-depth)`}>
      {/* A lateral 3D pertence à mesma fatia: sem isso o destaque some ao descer o mouse. */}
      {slices.map(slice => ({ slice, d: parede(cx, cy, rx, ry, slice.start, slice.end, depth) })).filter(item => item.d).map(({ slice, d }) => <path key={`depth:${slice.key}`} d={d!} fill={shade(slice.color, 0.72)} className="planilha-pie-depth" onMouseEnter={() => setHovered(slice.key)} onClick={() => select(slice.key)} />)}
      </g>
      <g clipPath={`url(#${revealId}-top)`}>
      {/* SVG controls retain native geometry; matching HTML actions use GlassButton below. */}
      {slices.map(slice => <g key={slice.key} role="button" tabIndex={0} aria-label={descreverFatia(slice)} aria-pressed={selected === slice.key} className="planilha-chart-mark" data-ativa={active === slice.key || undefined} onMouseEnter={() => setHovered(slice.key)} onFocus={() => setHovered(slice.key)} onBlur={() => setHovered(null)} onClick={() => select(slice.key)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(slice.key) } if (event.key === 'Escape') { setSelected(null); setHovered(null) } }}>
        <path d={sector(cx, cy, rx, ry, slice.start, slice.end)} fill={slice.color} />

      </g>)}
      </g>
      {/* Fatia em destaque: redesenhada levantada, com a lateral até a base. Só visual; o mouse continua na fatia original. */}
      {elevada && <g key={`elevada:${elevada.key}`} className="planilha-pie-elevada" data-elevada={elevada.key} pointerEvents="none">
        {/* Faces de corte: só acima da posição original, para não cobrir a lateral das vizinhas. */}
        {Array.from({ length: Math.ceil(altura / 2) + 1 }, (_, index) => Math.min(0, index * 2 - altura)).reverse().map(offset => <path key={offset} data-face-elevada="" d={sector(cx, cy + offset, rx, ry, elevada.start, elevada.end)} fill={shade(elevada.color, 0.72)} />)}
        {/* Borda da frente: do topo levantado até a base, com emendas verticais. */}
        {(() => { const d = parede(cx, cy - altura, rx, ry, elevada.start, elevada.end, depth + altura); return d && <path data-parede-elevada="" d={d} fill={shade(elevada.color, 0.72)} /> })()}
        <path d={sector(cx, cy - altura, rx, ry, elevada.start, elevada.end)} fill={shade(elevada.color, 1.06)} stroke="#fff" strokeOpacity={0.55} strokeWidth={1.2} />
      </g>}
      {/* Fatias mais perto de quem olha são redesenhadas por cima da levantada: ela não invade a frente. */}
      {elevada && (() => {
        const meio = (slice: { start: number; end: number }) => Math.sin((slice.start + slice.end) / 2)
        const frente = slices.filter(slice => slice.key !== elevada.key && meio(slice) > meio(elevada))
        // Como no desenho base: todas as laterais primeiro, depois todos os topos.
        return <g data-frente-da-elevada="" pointerEvents="none">
          {frente.map(slice => ({ slice, d: parede(cx, cy, rx, ry, slice.start, slice.end, depth) })).filter(item => item.d).map(({ slice, d }) => <path key={`frente-lateral:${slice.key}`} d={d!} fill={shade(slice.color, 0.72)} />)}
          {frente.map(slice => <path key={`frente-topo:${slice.key}`} data-frente-topo="" d={sector(cx, cy, rx, ry, slice.start, slice.end)} fill={slice.color} />)}
        </g>
      })()}
      {slices.filter(slice => slice.end - slice.start >= (user ? 0.3 : 0.12)).map(slice => <text key={`label:${slice.key}`} className="planilha-pie-value" style={{ pointerEvents: 'none', transform: elevada?.key === slice.key ? `translateY(-${altura}px)` : undefined, opacity: reveal >= 0.999 || -Math.PI / 2 + reveal * Math.PI * 2 >= (slice.start + slice.end) / 2 ? 1 : 0 }} x={cx + Math.cos((slice.start + slice.end) / 2) * rx * 0.82} y={cy + Math.sin((slice.start + slice.end) / 2) * ry * 0.82} textAnchor="middle" dominantBaseline="middle" fontSize={user ? 21 : 14} fontWeight="600" fill={textoSobre(slice.color)}>{user ? <><tspan x={cx + Math.cos((slice.start + slice.end) / 2) * rx * 0.82} dy="-0.55em">{slice.rotulo}</tspan><tspan x={cx + Math.cos((slice.start + slice.end) / 2) * rx * 0.82} dy="1.2em" fontWeight="500">{`${porcentagem.format(slice.percentual)}%`}</tspan></> : `${porcentagem.format(slice.percentual)}%`}</text>)}
      {!slices.length && <text x={330} y={250} textAnchor="middle" fontSize={14} fill="var(--ap-muted)">{total ? 'Nenhuma atividade com elaborador.' : 'Nenhuma atividade cadastrada.'}</text>}
    </svg>
    <div className="planilha-3d-legend" aria-label="Elaboradores" data-colunas={colunasLegenda}>{rows.map((row, index) => <GlassButton key={row.userId ?? row.elaborador} ref={element => { const key = row.userId ?? row.elaborador; if (element) userButtons.current.set(key, element); else userButtons.current.delete(key) }} aria-expanded={userKey === (row.userId ?? row.elaborador)} aria-controls={userKey === (row.userId ?? row.elaborador) ? `${revealId}-tasks` : undefined} variant="custom" className="planilha-donut-item planilha-chart-toggle" style={{ '--cor-elaborador': corUnica(index) } as CSSProperties} data-esmaecido={user && userKey !== (row.userId ?? row.elaborador) ? true : undefined} data-destaque={!user && active === (row.userId ?? row.elaborador) ? true : undefined} aria-pressed={userKey === (row.userId ?? row.elaborador)} onClick={() => { trocarUsuario(row.userId ?? row.elaborador); setSelected(null); setHovered(null) }} onMouseEnter={() => !user && setHovered(row.userId ?? row.elaborador)} onMouseLeave={() => setHovered(null)} onFocus={() => !user && setHovered(row.userId ?? row.elaborador)} onBlur={() => setHovered(null)}><i style={{ backgroundColor: corUnica(index) }} /><span>{row.elaborador}</span><strong>{row.qtdeAtividades}</strong><small>{numeros.format(row.percentual)}%</small></GlassButton>)}</div>
    </div>
    <div className="planilha-chart-detail" role="status">{active ? (() => { const row = slices.find(item => item.key === active); return row ? descreverFatia(row) : 'Selecione um elaborador.' })() : user ? '' : 'Clique em um elaborador para ver suas atividades.'}</div>
    {user && <section key={userKey} id={`${revealId}-tasks`} className="planilha-pie-tasks" aria-label={`Atividades atribuídas a ${user.elaborador}`}>
      <h4>{user.elaborador} · {taskCount} {taskCount === 1 ? 'atividade' : 'atividades'}</h4>
      <div className="planilha-pie-tabela-rolagem">
      <table className="planilha-pie-tabela">
        <thead>
          <tr className="planilha-pie-tabela-cabecalho">
            <th rowSpan={2} scope="col">Macrofases</th><th rowSpan={2} scope="col">Atividades</th><th rowSpan={2} scope="col">Elaborada por</th>
            <th colSpan={7} scope="colgroup">Valor orçado</th><th colSpan={8} scope="colgroup">Valor realizado</th>
          </tr>
          <tr className="planilha-pie-tabela-colunas">{['Min', 'Horas', 'Dias', 'R$', 'Materiais', 'Total', 'Data Prevista', 'Min', 'Horas', 'Dias', 'R$', 'Materiais', 'Total', 'Data Realização', 'Situação'].map((rotulo, index) => <th key={index} scope="col" data-inicio-grupo={index === 0 || index === 7 || undefined}>{rotulo}</th>)}</tr>
        </thead>
        {groups.map(group => <tbody key={group.key}>
          <tr className="planilha-pie-tabela-fase"><th colSpan={18} scope="colgroup"><span className="planilha-pie-tabela-fase-nome">{group.phase}</span><span className="planilha-pie-tabela-fase-contagem">{mesmoNome(group.sprint, group.phase) ? '' : `${group.sprint} · `}{group.tasks.length} {group.tasks.length === 1 ? 'atividade' : 'atividades'}</span></th></tr>
          {group.tasks.map(task => {
            const orcado = Math.max(0, task.minOrcado || 0), real = Math.max(0, task.minReal || 0)
            const acima = orcado > 0 && real > orcado
            const variacao = orcado > 0 && real > 0 ? Math.round((real - orcado) / orcado * 100) : null
            const vpm = task.vpm === null || task.vpm === undefined ? '—' : reais.format(task.vpm)
            return <tr key={task.nodeId} data-atividade="" data-active={active === task.nodeId || undefined} onMouseEnter={() => setHovered(task.nodeId)} onMouseLeave={() => setHovered(null)}>
              <td className="planilha-pie-tabela-marca"><i aria-hidden="true" style={{ background: corDa(task.nodeId) ?? 'transparent' }} /></td>
              <th scope="row" className="planilha-pie-tabela-nome">{task.codigo} {task.titulo}</th>
              <td className="planilha-pie-tabela-elaborador">{task.elaboradoPor || '—'}</td>
              {orcado > 0 ? <><td data-inicio-grupo aria-label={`Orçado: ${minutosTexto(orcado)}`}>{formatarMinutos(orcado)}</td><td>{horasTexto(orcado)}</td><td>{diasTexto(diasDe(orcado, task))}</td></> : <td data-inicio-grupo colSpan={3} className="planilha-pie-tabela-vazio" aria-label="Sem tempo planejado">sem tempo planejado</td>}
              <td title="Valor do minuto dos elaboradores">{vpm}</td>
              <td aria-label={`Materiais orçados: ${reais.format(task.materiaisOrcado || 0)}`}>{task.materiaisOrcado ? reais.format(task.materiaisOrcado) : '—'}</td>
              <td className="planilha-pie-tabela-valor" aria-label={`Valor orçado: ${task.totalOrcado === null ? 'sem valor' : reais.format(task.totalOrcado)}`}>{task.totalOrcado === null ? '—' : reais.format(task.totalOrcado)}</td>
              <td className="planilha-pie-tabela-data" aria-label={`Data prevista: ${fmtDataBR(task.dataPrevista) || 'sem data'}`}>{fmtDataBR(task.dataPrevista) || '—'}</td>
              {real > 0 ? <><td data-inicio-grupo aria-label={`Realizado: ${minutosTexto(real)}`} data-acima={acima || undefined} title={variacao ? `${variacao > 0 ? '+' : ''}${variacao}% em relação ao orçado` : undefined}>{formatarMinutos(real)}</td><td data-acima={acima || undefined}>{horasTexto(real)}</td><td data-acima={acima || undefined}>{diasTexto(diasDe(real, task))}</td></> : <td data-inicio-grupo colSpan={3} className="planilha-pie-tabela-vazio">—</td>}
              <td title="Valor do minuto dos elaboradores">{vpm}</td>
              <td aria-label={`Materiais realizados: ${reais.format(task.materiaisReal || 0)}`} data-acima={(task.materiaisReal || 0) > (task.materiaisOrcado || 0) && (task.materiaisOrcado || 0) > 0 || undefined}>{task.materiaisReal ? reais.format(task.materiaisReal) : '—'}</td>
              <td className="planilha-pie-tabela-valor" aria-label={`Valor realizado: ${task.totalReal ? reais.format(task.totalReal) : 'sem valor'}`} data-acima={task.totalReal !== null && task.totalOrcado !== null && task.totalReal > task.totalOrcado || undefined}>{task.totalReal ? reais.format(task.totalReal) : '—'}</td>
              <td className="planilha-pie-tabela-data" aria-label={`Data realizada: ${fmtDataBR(task.dataRealizacao) || 'sem data'}`}>{fmtDataBR(task.dataRealizacao) || '—'}</td>
              <td className="planilha-pie-tabela-situacao"><SeloSituacao situacao={task.situacao} /></td>
            </tr>
          })}
          <LinhaSoma rotulo="Sub-total" ariaLabel={`Subtotal de ${group.phase}`} soma={somaDe(group.tasks)} colSpan={3} />
        </tbody>)}
        <tfoot>
          <LinhaSoma rotulo={`Total de ${user.elaborador}`} ariaLabel={`Tempo total de ${user.elaborador}`} soma={somaTotal} colSpan={3} total />
        </tfoot>
      </table>
      </div>
      {!groups.length && <p>Nenhuma atividade atribuída a este elaborador.</p>}
    </section>}
  </GlassCard></div>
}
export default memo(function GraficosPlanilha3D({ planilha }: { planilha: PlanilhaDeCustos }) {
  // A planilha usa atividades atribuídas por elaborador; a pizza normaliza as contagens
  // para fechar 100%, inclusive quando uma atividade possui vários elaboradores.
  const total = planilha.quadros.elaboradores.reduce((sum, row) => sum + Math.max(0, row.qtdeAtividades), 0)
  const rows = planilha.quadros.elaboradores.map(row => ({ ...row, percentual: total ? Math.max(0, row.qtdeAtividades) / total * 100 : 0 }))
  return <div className="planilha-charts planilha-3d-grid mt-4" data-planilha-charts="excel-3d" style={{ minWidth: 0 }}>
    <SobDemandaPlanilha preloadDistance={600} label="gráfico de valores"><Colunas3D title="Valores: Orçado e Real (R$)" currency rows={planilha.quadros.valor.map(row => ({ fase: row.fase, orcado: row.orcado, real: row.realizado }))} /></SobDemandaPlanilha>
    <SobDemandaPlanilha preloadDistance={600} label="gráfico de tempo"><Colunas3D title="Tempo: Orçado e Real (Minutos)" rows={planilha.quadros.tempo.map(row => ({ fase: row.fase, orcado: row.minOrcado, real: row.minReal }))} /></SobDemandaPlanilha>
    <SobDemandaPlanilha preloadDistance={600} label="gráfico de elaboradores"><Pizza3D planilha={planilha} rows={rows} total={planilha.qtdeAtividades} /></SobDemandaPlanilha>
  </div>
})
