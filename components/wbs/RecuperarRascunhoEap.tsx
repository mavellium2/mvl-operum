'use client'

import { useMemo, useState } from 'react'
import { alteracoesLocais, mesclarRascunho, type Alteracao, type ArvoreEap, type ResultadoMescla } from '@/lib/wbsMerge'
import type { RascunhoEap } from '@/lib/wbsRascunho'

interface Props {
  rascunho: RascunhoEap
  /** Versão atual no editor (a do servidor depois do conflito). */
  atual: ArvoreEap
  onAplicar: (resultado: ResultadoMescla) => void
  onDescartar: () => void
}

const ROTULO: Record<Alteracao['tipo'], string> = { criado: 'Criado', removido: 'Removido', alterado: 'Alterado', movido: 'Movido' }

function Lista({ itens, vazio }: { itens: Alteracao[]; vazio: string }) {
  if (!itens.length) return <p className="text-xs text-slate-500">{vazio}</p>
  return (
    <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs">
      {itens.map((a, i) => (
        <li key={`${a.nodeId}-${a.tipo}-${i}`}>
          <span className="font-semibold">{ROTULO[a.tipo]}:</span> {a.titulo || '(sem título)'}
          {a.motivo && <span className="text-slate-500"> — {a.motivo}</span>}
        </li>
      ))}
    </ul>
  )
}

/**
 * Painel de recuperação do rascunho da EAP (salvamento em conflito ou falha).
 * Mostra o que ficou pendente, o que dá para reaplicar sobre a versão atual e o
 * que conflita com mudanças de outra pessoa (fica a versão do servidor).
 */
export default function RecuperarRascunhoEap({ rascunho, atual, onAplicar, onDescartar }: Props) {
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  const pendentes = useMemo(() => alteracoesLocais(rascunho.base, rascunho.local), [rascunho])
  const previa = useMemo(() => mesclarRascunho(rascunho.base, rascunho.local, atual), [rascunho, atual])
  const quando = new Date(rascunho.salvoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="rascunho-eap-titulo"
      className="fixed left-1/2 top-20 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-amber-300 bg-white p-4 text-sm shadow-2xl"
    >
      <h2 id="rascunho-eap-titulo" className="mb-1 text-base font-bold text-slate-900">Alterações não salvas preservadas</h2>
      <p className="mb-3 text-slate-600">
        {rascunho.motivo === 'conflito'
          ? 'A EAP foi alterada no servidor enquanto você editava. Suas alterações foram guardadas'
          : 'Não foi possível salvar. Suas alterações foram guardadas'} neste navegador em {quando}. Revise e reaplique sobre a versão atual.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-2">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Suas alterações ({pendentes.length})</h3>
          <Lista itens={pendentes} vazio="Nenhuma alteração pendente." />
        </div>
        <div className="space-y-2">
          <div className="rounded-lg bg-green-50 p-2">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-green-800">Podem ser reaplicadas ({previa.aplicadas.length})</h3>
            <Lista itens={previa.aplicadas} vazio="Nada a reaplicar." />
          </div>
          <div className="rounded-lg bg-amber-50 p-2">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-800">Conflitam com o servidor ({previa.conflitos.length})</h3>
            <Lista itens={previa.conflitos} vazio="Nenhum conflito." />
          </div>
        </div>
      </div>
      {previa.conflitos.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">Nos conflitos fica a versão atual do servidor, para não sobrescrever o trabalho de outra pessoa; refaça esses itens à mão se ainda forem necessários.</p>
      )}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {confirmarDescarte ? (
          <>
            <span className="self-center text-xs text-red-700">Descartar apaga suas alterações guardadas.</span>
            <button type="button" onClick={() => setConfirmarDescarte(false)} className="rounded-lg border px-3 py-1.5 text-sm">Voltar</button>
            <button type="button" onClick={onDescartar} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white">Descartar alterações</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setConfirmarDescarte(true)} className="rounded-lg border px-3 py-1.5 text-sm">Descartar</button>
            <button
              type="button"
              onClick={() => onAplicar(previa)}
              disabled={previa.aplicadas.length === 0}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Reaplicar minhas alterações
            </button>
          </>
        )}
      </div>
    </section>
  )
}
