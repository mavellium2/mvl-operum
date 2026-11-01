'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useFloatingPanelFocus } from '@/hooks/useFloatingPanelFocus'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GlassButton from '@/components/ui/GlassButton'
import { ChevronDown, History, RotateCcw } from 'lucide-react'
import { listarVersoesProjetoAction } from '@/app/actions/projetoEdicao'
import { listarAlteracoes, type FaseForm, type FormProjeto } from '@/lib/alteracoesProjeto'
import type { VersaoProjeto } from '@/services/projetoVersoes'

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Histórico do editor: o marcador de versão ativa independe da ordem dos
 * salvamentos. Restaurar ativa uma versão preservando as demais.
 */
export default function HistoricoProjeto({ projetoId, aberto, salvo, nomeDoUsuario, onFechar, onRestaurar, recarregar, origemX }: {
  origemX?: number
  projetoId: string
  aberto: boolean
  /** Como o projeto está salvo agora (base da comparação). */
  salvo: { form: FormProjeto; fases: FaseForm[] } | null
  nomeDoUsuario: (id: string) => string
  onFechar: () => void
  onRestaurar: (versao: VersaoProjeto) => void
  /** Muda a cada salvamento, para recarregar a lista. */
  recarregar: number
}) {
  const panel = useRef<HTMLDivElement>(null)
  useFloatingPanelFocus(panel, aberto, onFechar)
  const [jaAberto, setJaAberto] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- só habilita a saída depois da primeira abertura
    if (aberto) setJaAberto(true)
  }, [aberto])
  const [versoes, setVersoes] = useState<VersaoProjeto[] | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [comparando, setComparando] = useState<number | null>(null)
  /** Versões já comparadas: o conteúdo fica montado para fechar deslizando. */
  const [comparadas, setComparadas] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!aberto) return
    let ativo = true
    listarVersoesProjetoAction(projetoId).then(r => {
      if (!ativo) return
      if ('error' in r) setErro(r.error)
      else { setErro(null); setVersoes(r.versoes) }
    }).catch(() => { if (ativo) setErro('Não foi possível carregar o histórico. Suas alterações continuam preservadas.') })
    return () => { ativo = false }
  }, [aberto, projetoId, recarregar, tentativa])

  const diferencas = (v: VersaoProjeto) => {
    if (!salvo) return []
    const fasesDaVersao: FaseForm[] = v.conteudo.fases.map((f, i) => ({ chave: `v-${i}`, ...f }))
    const fasesAtuais: FaseForm[] = salvo.fases.map((f, i) => ({ ...f, chave: `a-${i}` }))
    // Compara por nome da fase: chaves iguais quando o nome bate.
    const norm = (t: string) => t.trim().toLowerCase()
    const chaveAtual = new Map(fasesAtuais.map(f => [norm(f.fase), f.chave]))
    const versaoComChaves = fasesDaVersao.map(f => ({ ...f, chave: chaveAtual.get(norm(f.fase)) ?? f.chave }))
    return listarAlteracoes({ form: salvo.form, fases: fasesAtuais }, { form: v.conteudo.form, fases: versaoComChaves }, nomeDoUsuario)
  }

  return (
    <div ref={panel} tabIndex={-1}
      style={{ '--history-drop-x': origemX !== undefined ? `${origemX}px` : '50%' } as CSSProperties}
      data-open={aberto} data-visited={jaAberto} role="dialog" aria-label="Histórico de versões" aria-hidden={!aberto} inert={!aberto}
      className={`project-history-panel absolute bottom-full mb-3 vidro-flutuante flex max-h-[60vh] origin-bottom flex-col rounded-[22px] transition-[opacity,transform] duration-500 [transition-timing-function:var(--ease-mola)] ${aberto ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-[0.96] opacity-0 duration-200'}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-900/[0.06] px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><History className="h-4 w-4 text-slate-400" />Histórico de versões</h3>
        <GlassCloseButton label="Fechar histórico" onClick={onFechar} className="project-history-close" />
      </div>
      <div className="borda-suave-rolagem min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        {erro && <div className="px-3 py-4"><p role="alert" className="text-sm text-red-600">{erro}</p><GlassButton className="mt-3" onClick={() => setTentativa(n => n + 1)}>Tentar novamente</GlassButton></div>}
        {!erro && versoes === null && <p className="px-3 py-4 text-sm text-slate-500">Carregando…</p>}
        {versoes?.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">Ainda não há versões. Cada vez que você salvar, uma versão nova entra aqui.</p>}
        <ol className="relative space-y-3">
          {versoes?.map((v, i) => {
            const atual = versoes.some(versao => versao.ativa) ? !!v.ativa : i === 0
            const aberta = comparando === v.numero
            const lista = aberta || comparadas.has(v.numero) ? diferencas(v) : []
            return (
              <li key={v.numero} className="project-history-version relative pl-8" style={{ animationDelay: `${Math.min(i, 5) * 35}ms`, '--history-item-delay': `${Math.min(i, 5) * 55}ms` } as CSSProperties} data-testid="versao">
                {/* Linha do tempo, como num histórico de commits. */}
                <span aria-hidden="true" className={`history-timeline-line absolute left-3 top-0 w-px bg-slate-200 ${i === versoes.length - 1 ? 'h-5' : 'h-[calc(100%+0.75rem)]'}`} />
                <span aria-hidden="true" data-current={atual} className={`history-timeline-dot absolute left-[7px] top-5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${atual ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <div className="history-version-card rounded-2xl px-4 py-4 transition-colors duration-200 hover:bg-white/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">v{v.numero}</span>
                    {atual && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">Atual</span>}
                    {v.restauradaDe && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">restaurada da v{v.restauradaDe}</span>}

                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">{quando(v.createdAt)}{v.autorNome ? ` · ${v.autorNome}` : ''}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    {v.alteracoes.length ? v.alteracoes.slice(0, 4).join(' · ') + (v.alteracoes.length > 4 ? ` · +${v.alteracoes.length - 4}` : '') : 'Estado inicial registrado'}
                  </p>
                  {!atual && (
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                      <GlassButton variant="custom" type="button" onClick={() => { setComparadas(c => new Set(c).add(v.numero)); setComparando(aberta ? null : v.numero) }} aria-expanded={aberta} className="history-action-motion history-action-compare inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                        <ChevronDown data-open={aberta} className="project-history-chevron h-3.5 w-3.5" />Comparar com a atual
                      </GlassButton>
                      <GlassButton variant="custom" type="button" onClick={() => onRestaurar(v)} className="history-action-motion history-action-restore inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50">
                        <RotateCcw className="h-3.5 w-3.5" />Restaurar esta versão
                      </GlassButton>
                    </div>
                  )}
                  <div className="project-history-comparison grid" data-open={aberta} aria-hidden={!aberta} inert={!aberta}>
                  <div className="min-h-0 overflow-hidden">
                  {(aberta || comparadas.has(v.numero)) && (
                    <ul className="mt-3 space-y-3 rounded-xl border border-slate-100 bg-white p-3 text-xs leading-relaxed">
                      {lista.length === 0 && <li className="text-slate-500">Igual à versão atual.</li>}
                      {lista.map(a => (
                        <li key={a.chave} className="flex flex-wrap items-baseline gap-1.5">
                          <span className="font-semibold text-slate-600">{a.rotulo}:</span>
                          {a.texto
                            ? <span className="text-slate-500">texto diferente</span>
                            : <>
                                {a.antes ? <del className="rounded bg-rose-50 px-1 text-rose-700">{a.antes}</del> : <span className="text-slate-400">vazio</span>}
                                <span className="text-slate-400">→</span>
                                {a.depois ? <ins className="rounded bg-emerald-50 px-1 text-emerald-800 no-underline">{a.depois}</ins> : <span className="text-slate-400">vazio</span>}
                              </>}
                        </li>
                      ))}
                    </ul>
                  )}
                  </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
