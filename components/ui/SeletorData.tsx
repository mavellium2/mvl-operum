'use client'

import GlassButton from '@/components/ui/GlassButton'

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Campo de data com calendário (estilo iOS): aceita digitar dd/mm/aaaa e, ao
 * clicar, abre um calendário em vidro. O valor é ISO (aaaa-mm-dd) ou ''.
 * Teclado no calendário: setas mudam o dia, PageUp/PageDown o mês, Enter
 * escolhe, Esc fecha.
 */

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const DIAS_NOME = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

const pad = (n: number) => String(n).padStart(2, '0')
const paraIso = (a: number, m: number, d: number) => `${a}-${pad(m + 1)}-${pad(d)}`
const deIso = (iso: string): { a: number; m: number; d: number } | null => {
  const r = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return r ? { a: Number(r[1]), m: Number(r[2]) - 1, d: Number(r[3]) } : null
}
const isoParaBr = (iso: string) => { const x = deIso(iso); return x ? `${pad(x.d)}/${pad(x.m + 1)}/${x.a}` : '' }
const mascara = (bruto: string) => {
  const d = bruto.replace(/\D/g, '').slice(0, 8)
  return d.length <= 2 ? d : d.length <= 4 ? `${d.slice(0, 2)}/${d.slice(2)}` : `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}
const brParaIso = (br: string) => {
  const r = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!r) return ''
  const [d, m, a] = [Number(r[1]), Number(r[2]) - 1, Number(r[3])]
  const dt = new Date(a, m, d)
  return dt.getFullYear() === a && dt.getMonth() === m && dt.getDate() === d ? paraIso(a, m, d) : ''
}
const diasNoMes = (a: number, m: number) => new Date(a, m + 1, 0).getDate()
const hojeIso = () => { const h = new Date(); return paraIso(h.getFullYear(), h.getMonth(), h.getDate()) }
const somarDias = (iso: string, n: number) => { const x = deIso(iso)!; const dt = new Date(x.a, x.m, x.d + n); return paraIso(dt.getFullYear(), dt.getMonth(), dt.getDate()) }

export default function SeletorData({ value, onChange, ariaLabel, id, disabled = false, placeholder = 'dd/mm/aaaa', error, className = '' }: {
  value: string
  onChange: (iso: string) => void
  ariaLabel?: string
  id?: string
  disabled?: boolean
  error?: string
  placeholder?: string
  /** Classes do campo (o visual do campo segue quem usa). */
  className?: string
}) {
  const uid = useId()
  const campo = useRef<HTMLInputElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const [texto, setTexto] = useState(isoParaBr(value))
  const [ultimoValor, setUltimoValor] = useState(value)
  const [touched, setTouched] = useState(false)
  const invalid = texto !== '' && !brParaIso(texto)
  const showError = invalid && (touched || texto.length === 10)
  const [aberto, setAberto] = useState(false)
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null)
  const inicial = deIso(value) ?? deIso(hojeIso())!
  const [mes, setMes] = useState({ a: inicial.a, m: inicial.m })
  const [direcao, setDirecao] = useState<'direita' | 'esquerda' | null>(null)
  const [foco, setFoco] = useState(value || hojeIso())

  // Valor mudou de fora (restaurar versão, descartar…): atualiza o texto.
  if (ultimoValor !== value) {
    setUltimoValor(value)
    setTexto(isoParaBr(value))
  }

  function abrir() {
    if (disabled || aberto) return
    const base = deIso(value) ?? deIso(hojeIso())!
    setMes({ a: base.a, m: base.m })
    setFoco(value || hojeIso())
    setDirecao(null)
    setAberto(true)
  }
  const fechar = () => setAberto(false)

  // Posição do calendário: abaixo do campo, ou acima se não couber.
  useLayoutEffect(() => {
    if (!aberto) return
    const medir = () => {
      const r = campo.current?.getBoundingClientRect()
      if (!r) return
      const largura = 296, altura = 360
      const left = Math.min(Math.max(8, r.right - largura), window.innerWidth - largura - 8)
      const top = r.bottom + 8 + altura > window.innerHeight ? Math.max(8, r.top - altura - 8) : r.bottom + 8
      setPosicao({ top, left })
    }
    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true) }
  }, [aberto])

  // Clique fora fecha.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (!painel.current?.contains(alvo) && !campo.current?.contains(alvo)) fechar()
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  function irParaMes(delta: number) {
    setDirecao(delta > 0 ? 'direita' : 'esquerda')
    setMes(({ a, m }) => { const dt = new Date(a, m + delta, 1); return { a: dt.getFullYear(), m: dt.getMonth() } })
  }
  function escolher(iso: string) {
    onChange(iso)
    setTexto(isoParaBr(iso))
    fechar()
    campo.current?.focus()
  }
  function moverFoco(novo: string) {
    const x = deIso(novo)!
    if (x.a !== mes.a || x.m !== mes.m) { setDirecao(novo > foco ? 'direita' : 'esquerda'); setMes({ a: x.a, m: x.m }) }
    setFoco(novo)
  }

  // Foco do teclado acompanha o dia destacado.
  // (só quando a pessoa já está navegando no calendário; digitando no campo, o foco fica lá).
  useEffect(() => {
    if (!aberto || !painel.current?.contains(document.activeElement)) return
    painel.current.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus({ preventScroll: true })
  }, [aberto, foco, mes])

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    const mapa: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in mapa) { e.preventDefault(); moverFoco(somarDias(foco, mapa[e.key])) }
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const x = deIso(foco)!
      const dt = new Date(x.a, x.m + (e.key === 'PageDown' ? 1 : -1), 1)
      moverFoco(paraIso(dt.getFullYear(), dt.getMonth(), Math.min(x.d, diasNoMes(dt.getFullYear(), dt.getMonth()))))
    } else if (e.key === 'Escape') { e.preventDefault(); fechar(); campo.current?.focus() }
    else if (e.key === 'Tab') fechar()
  }

  const celulas = useMemo(() => {
    const primeiroDia = new Date(mes.a, mes.m, 1).getDay()
    const total = diasNoMes(mes.a, mes.m)
    const lista: (number | null)[] = [...Array(primeiroDia).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
    while (lista.length % 7) lista.push(null)
    return lista
  }, [mes])
  const hoje = hojeIso()

  return (
    <>
      <span className="relative block">
        <input
          ref={campo}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          role="combobox"
          aria-label={ariaLabel}
          aria-invalid={invalid || !!error}
          aria-describedby={showError || error ? `${uid}-error` : undefined}
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-controls={aberto ? `${uid}-cal` : undefined}
          placeholder={placeholder}
          maxLength={10}
          disabled={disabled}
          value={texto}
          onClick={abrir}
          onBlur={() => setTouched(true)}
          onFocus={abrir}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' && aberto) { e.preventDefault(); painel.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus() }
            if (e.key === 'Escape') fechar()
            if (e.key === 'Tab') fechar()
          }}
          onChange={e => {
            const m = mascara(e.target.value)
            setTexto(m)
            const iso = brParaIso(m)
            // Mantém datas completas inválidas no rascunho para indicar pendência;
            // o formulário bloqueia o salvamento até a correção.
            const draft = m.length === 10 ? `${m.slice(6)}-${m.slice(3, 5)}-${m.slice(0, 2)}` : m
            setUltimoValor(draft)
            onChange(draft)
            if (iso) { const x = deIso(iso)!; setMes({ a: x.a, m: x.m }); setFoco(iso) }
          }}
          className={`${className} pr-8`}
        />
        <CalendarDays aria-hidden="true" className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 transition-colors ${aberto ? 'text-blue-500' : 'text-slate-400'}`} />
      </span>
      {(showError || error) && <span id={`${uid}-error`} className="date-validation-hint mt-1 block text-xs leading-relaxed">{error || 'Informe uma data válida (dd/mm/aaaa).'}</span>}

      {aberto && posicao && createPortal(
        <div
          ref={painel}
          id={`${uid}-cal`}
          role="dialog"
          aria-label={`Calendário${ariaLabel ? ` — ${ariaLabel}` : ''}`}
          onKeyDown={teclas}
          style={{ position: 'fixed', top: posicao.top, left: posicao.left, width: 296, zIndex: 10000 }}
          className="project-date-calendar vidro-flutuante anim-calendario rounded-[24px] p-3 font-sans"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[15px] font-bold tracking-tight text-slate-900" aria-live="polite">
              {MESES[mes.m]} <span className="font-semibold text-blue-600">{mes.a}</span>
            </p>
            <div className="flex items-center gap-0.5">
              <GlassButton variant="custom" type="button" aria-label="Mês anterior" onClick={() => irParaMes(-1)} className="pressionavel flex h-8 w-8 items-center justify-center rounded-full text-blue-600 hover:bg-blue-500/10"><ChevronLeft className="h-5 w-5" /></GlassButton>
              <GlassButton variant="custom" type="button" aria-label="Próximo mês" onClick={() => irParaMes(1)} className="pressionavel flex h-8 w-8 items-center justify-center rounded-full text-blue-600 hover:bg-blue-500/10"><ChevronRight className="h-5 w-5" /></GlassButton>
            </div>
          </div>
          <div className="grid grid-cols-7 px-0.5 pb-1">
            {DIAS.map((d, i) => <span key={i} aria-hidden="true" className="py-1 text-center text-[11px] font-semibold uppercase text-slate-400">{d}</span>)}
          </div>
          <div key={`${mes.a}-${mes.m}`} role="grid" className={`grid grid-cols-7 gap-y-0.5 px-0.5 ${direcao === 'direita' ? 'anim-mes-direita' : direcao === 'esquerda' ? 'anim-mes-esquerda' : ''}`}>
            {celulas.map((dia, i) => {
              if (dia === null) return <span key={i} />
              const iso = paraIso(mes.a, mes.m, dia)
              const escolhido = iso === value
              const ehHoje = iso === hoje
              const semana = new Date(mes.a, mes.m, dia).getDay()
              return (
                <GlassButton variant="custom"
                  key={i}
                  type="button"
                  data-dia={iso}
                  tabIndex={iso === foco ? 0 : -1}
                  aria-label={`${dia} de ${MESES[mes.m].toLowerCase()} de ${mes.a}, ${DIAS_NOME[semana]}${ehHoje ? ' (hoje)' : ''}`}
                  aria-pressed={escolhido}
                  onClick={() => escolher(iso)}
                  onFocus={() => setFoco(iso)}
                  className={`pressionavel mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[14px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                    escolhido
                      ? 'bg-gradient-to-b from-blue-500 to-blue-600 font-bold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3),0_4px_12px_-4px_rgb(37_99_235/0.7)]'
                      : ehHoje
                        ? 'font-bold text-blue-600 hover:bg-blue-500/10'
                        : `font-medium hover:bg-slate-900/[0.06] ${semana === 0 || semana === 6 ? 'text-slate-400' : 'text-slate-800'}`
                  }`}
                >
                  {dia}
                </GlassButton>
              )
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-900/[0.06] px-1 pt-2">
            <GlassButton variant="custom" type="button" onClick={() => escolher(hoje)} className="pressionavel rounded-full px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-500/10">Hoje</GlassButton>
            {value && <GlassButton variant="custom" type="button" onClick={() => { onChange(''); setTexto(''); fechar(); campo.current?.focus() }} className="pressionavel rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-slate-900/[0.05]">Limpar</GlassButton>}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
