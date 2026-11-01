'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useState, useTransition } from 'react'
import { repetirSincronizacaoAction } from '@/app/actions/sincronizacao'
import type { StatusSincronizacao as Status } from '@/services/sincronizacaoStatus'

interface Props {
  projectId: string
  inicial: Status | null
  /** Usuário pode sincronizar (projeto:editar + quadro:cards). */
  podeSincronizar: boolean
  /** Flutuante sobre telas de tela cheia (EAP). */
  flutuante?: boolean
}

const dataHora = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—'

const ESTILO = {
  OK: { caixa: 'border-green-200 bg-green-50 text-green-800', ponto: 'bg-green-500' },
  PENDENCIAS: { caixa: 'border-amber-200 bg-amber-50 text-amber-900', ponto: 'bg-amber-500' },
  FALHA: { caixa: 'border-red-200 bg-red-50 text-red-800', ponto: 'bg-red-500' },
  NUNCA: { caixa: 'border-slate-200 bg-white text-slate-700', ponto: 'bg-slate-400' },
} as const

/**
 * Estado da sincronização EAP ↔ planilha ↔ sprints: situação, última conclusão,
 * pendências e "Sincronizar agora". Só diz "Sincronizado" sem pendências e sem erro.
 */
export default function StatusSincronizacao({ projectId, inicial, podeSincronizar, flutuante = false }: Props) {
  const [status, setStatus] = useState<Status | null>(inicial)
  const [aberto, setAberto] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const situacao = status?.situacao ?? 'NUNCA'
  const estilo = ESTILO[situacao]
  const titulo = situacao === 'OK'
    ? 'EAP, planilha e sprints sincronizadas'
    : situacao === 'PENDENCIAS'
      ? `Sincronizado com ${status!.pendencias.length === 1 ? '1 pendência' : `${status!.pendencias.length} pendências`}`
      : situacao === 'FALHA'
        ? 'Falha na última sincronização'
        : 'Sincronização ainda não registrada'

  function sincronizar() {
    setMensagem(null)
    startTransition(async () => {
      const r = await repetirSincronizacaoAction(projectId)
      if ('error' in r) {
        setMensagem(r.error)
        if (r.status) setStatus(r.status)
        setAberto(true)
        return
      }
      setStatus(r.status)
      setAberto(r.status.situacao !== 'OK')
    })
  }

  return (
    <section
      aria-label="Estado da sincronização"
      className={`${flutuante ? 'fixed bottom-4 left-4 z-40 max-w-sm shadow-lg' : 'w-full'} rounded-xl border px-3 py-2 text-sm ${estilo.caixa}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${estilo.ponto}`} aria-hidden="true" />
        <span className="font-semibold" role="status">{pendente ? 'Sincronizando…' : titulo}</span>
        {status?.ultimaConclusaoEm && <span className="text-xs opacity-80">Última conclusão: {dataHora(status.ultimaConclusaoEm)}</span>}
        <span className="ml-auto flex items-center gap-2">
          {(status?.pendencias.length || status?.erro || mensagem) ? (
            <OperumButton variant="custom" type="button" onClick={() => setAberto(a => !a)} aria-expanded={aberto} className="text-xs font-medium underline">
              {aberto ? 'Ocultar detalhes' : 'Ver detalhes'}
            </OperumButton>
          ) : null}
          {podeSincronizar && (
            <OperumButton variant="default"
              type="button"
              onClick={sincronizar}
              disabled={pendente}
              className="rounded-lg border border-current/20 bg-white/70 px-2 py-1 text-xs font-semibold hover:bg-white disabled:opacity-60"
            >
              {situacao === 'FALHA' ? 'Tentar novamente' : 'Sincronizar agora'}
            </OperumButton>
          )}
        </span>
      </div>
      {aberto && (
        <div className="mt-2 space-y-1 text-xs">
          {mensagem && <p role="alert">{mensagem}</p>}
          {status?.erro && <p><strong>Motivo:</strong> {status.erro} <span className="opacity-80">(tentativa em {dataHora(status.ultimaTentativaEm)})</span></p>}
          {status?.pendencias.length ? (
            <ul className="list-disc pl-4">
              {status.pendencias.map(p => <li key={p.tipo}>{p.mensagem}</li>)}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  )
}
