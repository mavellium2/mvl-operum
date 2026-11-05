'use client'

import { useEffect, useRef, useState } from 'react'
import { listarHistoricoPlanilhaAction, restaurarHistoricoPlanilhaAction } from '@/app/actions/planilhaHistorico'
import DetailPanel from '@/components/ui/DetailPanel'
import GlassButton from '@/components/ui/GlassButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { rotuloVersaoPlanilha } from '@/lib/planilhaVersion'

export default function HistoricoPlanilha({ projectId, canRestore, onClose, onRestored }: {
  projectId: string; canRestore: boolean; onClose: () => void; onRestored: (numero: number) => void
}) {
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => { body.current?.focus() }, [])
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof listarHistoricoPlanilhaAction>>>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [target, setTarget] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    listarHistoricoPlanilhaAction(projectId).then(items => { if (active) { setVersions(items); setHasMore(items.length === 50) } }).catch(() => { if (active) setError('Não foi possível carregar o histórico.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [projectId])
  return <DetailPanel floating title="Histórico da planilha" label="Histórico de versões da planilha" onClose={onClose}>
    <div ref={body} tabIndex={-1} className="space-y-3 p-4 outline-none" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose() } }}>
      <p className="text-sm text-[var(--ap-muted)]">As alterações são salvas automaticamente após uma pausa. Restaurar cria uma nova versão e preserva o histórico.</p>
      {loading && <p role="status">Carregando versões…</p>}
      {error && <p role="alert">{error}</p>}
      {versions.map((version, index) => <div key={version.numero} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ap-border)] p-3">
        <div><strong>{rotuloVersaoPlanilha(version.numero)}{index === 0 ? ' · Atual' : ''}</strong><p className="text-xs text-[var(--ap-muted)]">{new Date(version.createdAt).toLocaleString('pt-BR')} · {version.autorNome}</p>{version.restauradaDe && <p className="text-xs">Restaurada de {rotuloVersaoPlanilha(version.restauradaDe)}</p>}</div>
        {canRestore && index > 0 && <GlassButton type="button" disabled={busy} onClick={() => setTarget(version.numero)}>Restaurar</GlassButton>}
      </div>)}
      {hasMore && <GlassButton type="button" disabled={loading || busy} onClick={() => {
        setLoading(true)
        void listarHistoricoPlanilhaAction(projectId, versions.at(-1)?.numero).then(items => { setVersions(previous => [...previous, ...items]); setHasMore(items.length === 50) }).catch(() => setError('Não foi possível carregar mais versões.')).finally(() => setLoading(false))
      }}>Carregar versões anteriores</GlassButton>}
      {!loading && versions.length === 0 && <p>Nenhuma versão registrada.</p>}
    </div>
    <ConfirmDialog isOpen={target !== null} title="Restaurar versão da planilha" message={`Restaurar ${target ? rotuloVersaoPlanilha(target) : ''}? A estrutura, campos, responsáveis, anexos, comentários e lançamentos encerrados voltarão a essa versão. O estado atual será preservado no histórico.`}
      onClose={() => { if (!busy) setTarget(null) }} onConfirm={() => {
        if (!target || busy) return
        setBusy(true)
        void restaurarHistoricoPlanilhaAction(projectId, target, versions[0].numero).then(result => {
          if (result.error) { setError(result.error); return }
          onRestored(result.numero!)
          onClose()
        }).catch(() => setError('Não foi possível restaurar a versão.')).finally(() => { setBusy(false); setTarget(null) })
      }} />
  </DetailPanel>
}
