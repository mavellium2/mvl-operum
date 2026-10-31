'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, History, RotateCcw, X } from 'lucide-react'
import { listarVersoesProjetoAction } from '@/app/actions/projetoEdicao'
import { listarAlteracoes, type FaseForm, type FormProjeto } from '@/lib/alteracoesProjeto'
import type { VersaoProjeto } from '@/services/projetoVersoes'

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Histórico do Editar projeto, linear como commits: a versão mais recente é a
 * atual. "Restaurar" carrega uma versão antiga no formulário; salvar cria uma
 * versão nova (nunca duas atuais).
 */
export default function HistoricoProjeto({ projetoId, aberto, salvo, nomeDoUsuario, onFechar, onRestaurar, recarregar }: {
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
  const [versoes, setVersoes] = useState<VersaoProjeto[] | null>(null)
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
    })
    return () => { ativo = false }
  }, [aberto, projetoId, recarregar])

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
    <div
      role="dialog" aria-label="Histórico de versões" aria-hidden={!aberto} inert={!aberto}
      className={`absolute inset-x-0 bottom-full mb-2 flex max-h-[60vh] origin-bottom flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 [transition-timing-function:var(--ease-suave)] ${aberto ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-[0.98] opacity-0'}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><History className="h-4 w-4 text-slate-400" />Histórico de versões</h3>
        <button type="button" aria-label="Fechar histórico" onClick={onFechar} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {erro && <p role="alert" className="px-3 py-4 text-sm text-red-600">{erro}</p>}
        {!erro && versoes === null && <p className="px-3 py-4 text-sm text-slate-500">Carregando…</p>}
        {versoes?.length === 0 && <p className="px-3 py-4 text-sm text-slate-500">Ainda não há versões. Cada vez que você salvar, uma versão nova entra aqui.</p>}
        <ol className="relative">
          {versoes?.map((v, i) => {
            const atual = i === 0
            const aberta = comparando === v.numero
            const lista = aberta || comparadas.has(v.numero) ? diferencas(v) : []
            return (
              <li key={v.numero} className="relative pl-7" data-testid="versao">
                {/* Linha do tempo, como num histórico de commits. */}
                <span aria-hidden="true" className={`absolute left-3 top-0 w-px bg-slate-200 ${i === versoes.length - 1 ? 'h-4' : 'h-full'}`} />
                <span aria-hidden="true" className={`absolute left-[7px] top-3.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${atual ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <div className="rounded-xl px-3 py-2.5 transition-colors duration-200 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">v{v.numero}</span>
                    {atual && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">Atual</span>}
                    {v.restauradaDe && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">restaurada da v{v.restauradaDe}</span>}
                    <span className="text-xs text-slate-500">{quando(v.createdAt)}{v.autorNome ? ` · ${v.autorNome}` : ''}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    {v.alteracoes.length ? v.alteracoes.slice(0, 4).join(' · ') + (v.alteracoes.length > 4 ? ` · +${v.alteracoes.length - 4}` : '') : 'Estado inicial registrado'}
                  </p>
                  {!atual && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setComparadas(c => new Set(c).add(v.numero)); setComparando(aberta ? null : v.numero) }} aria-expanded={aberta} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${aberta ? 'rotate-180' : ''}`} />Comparar com a atual
                      </button>
                      <button type="button" onClick={() => onRestaurar(v)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50">
                        <RotateCcw className="h-3.5 w-3.5" />Restaurar esta versão
                      </button>
                    </div>
                  )}
                  <div className={`grid transition-[grid-template-rows,opacity] duration-300 [transition-timing-function:var(--ease-suave)] ${aberta ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`} aria-hidden={!aberta}>
                  <div className="min-h-0 overflow-hidden">
                  {(aberta || comparadas.has(v.numero)) && (
                    <ul className="mt-2 space-y-1.5 rounded-lg border border-slate-100 bg-white p-2 text-xs">
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
