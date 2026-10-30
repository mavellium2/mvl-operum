'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWithSession } from '@/lib/clientFetch'

type Version = {
  id: string
  versao?: string
  commitTitle: string
  status: string
  createdAt: string
  elaboradoPor?: string
  author?: { name: string } | null
  payload: unknown
  resourceId: string
}
type Log = {
  id: string
  action: string
  timestamp: string
  userId: string | null
  userName?: string | null
  details: unknown
}
const labels: Record<string, string> = {
  DOCUMENTO_VERSAO: 'Versão salva',
  DOCUMENTO_RASCUNHO: 'Rascunho editado',
  DOCUMENTO_APROVAR: 'Versão aprovada',
  DOCUMENTO_REJEITAR: 'Versão rejeitada',
  DOCUMENTO_EXCLUIR: 'Ata excluída',
  DOCUMENTO_EXCLUIR_VERSAO: 'Versão excluída',
  CHARTER: 'Termo de Abertura',
  STAKEHOLDER: 'Partes interessadas',
  EAP: 'EAP',
  ATA: 'Atas',
  PENDING: 'Pendente de aprovação',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  header: 'Cabeçalho',
  stakeholders: 'Partes interessadas',
  nodes: 'Estrutura da EAP',
  title: 'Título',
  projectName: 'Nome do projeto',
  projectManager: 'Gerente do projeto',
  preparedBy: 'Elaborado por',
  approvedBy: 'Aprovado por',
  approvalDate: 'Data de aprovação',
  children: 'Itens',
  nome: 'Nome',
  empresaEquipe: 'Empresa / equipe',
  cargoCompetencia: 'Cargo / competência',
  telefoneFax: 'Telefone',
  endereco: 'Endereço',
  observacoes: 'Observações',
  presentes: 'Presentes',
  acoes: 'Ações',
  anexos: 'Anexos',
  macroFases: 'Macro fases',
  elaboradoPor: 'Elaborado por',
  aprovadoPor: 'Aprovado por',
  dataAprovacao: 'Data de aprovação',
  descricaoProduto: 'Descrição do produto',
  limitesAutoridade: 'Limites de autoridade',
  assuntosTratados: 'Assuntos tratados',
  decisoesTomadas: 'Decisões tomadas',
  payload: 'Conteúdo',
}
function Conteudo({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>—</span>
  if (Array.isArray(value))
    return (
      <ol className="space-y-2 border-l pl-3">
        {value.map((v, i) => (
          <li key={i}>
            <Conteudo value={v} />
          </li>
        ))}
      </ol>
    )
  if (typeof value === 'object')
    return (
      <dl className="space-y-2">
        {Object.entries(value)
          .filter(
            ([key]) =>
              ![
                'id',
                'parentId',
                'projectId',
                'tenantId',
                'templateId',
                'level',
                'order',
              ].includes(key),
          )
          .map(([k, v]) => (
            <div key={k}>
              <dt className="font-medium">
                {labels[k] ?? k.replace(/([A-Z])/g, ' $1')}
              </dt>
              <dd className="whitespace-pre-wrap pl-3 text-gray-700">
                <Conteudo value={v} />
              </dd>
            </div>
          ))}
      </dl>
    )
  return <span>{String(value)}</span>
}
export default function HistoricoDocumento({
  projetoId,
  type,
  resourceId = '',
  embutido = false,
}: {
  projetoId: string
  type: string
  resourceId?: string
  /** Dentro de um painel (Revisar proposta pendente): sem o <details>, carrega ao abrir. */
  embutido?: boolean
}) {
  const router = useRouter()
  const [versions, setVersions] = useState<Version[]>([])
  const [logs, setLogs] = useState<Log[]>([])
  const [tab, setTab] = useState<'historico' | 'registro'>('historico')
  const [canDelete, setCanDelete] = useState(false)
  const [canApprove, setCanApprove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(
    async (next: 'historico' | 'registro' = tab) => {
      setTab(next)
      setBusy(true)
      setError('')
      try {
        const r = await fetchWithSession(
          `/api/projects/${projetoId}/revisions?type=${type}&resourceId=${encodeURIComponent(resourceId)}&tab=${next}`,
        )
        const data = await r.json()
        if (!r.ok) throw new Error(data.error)
        if (next === 'registro') setLogs(data)
        else {
          setVersions(data.versions)
          setCanApprove(data.canApprove)
          setCanDelete(data.canDelete)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar histórico')
      } finally {
        setBusy(false)
      }
    },
    [projetoId, type, resourceId, tab],
  )
  useEffect(() => {
    const refresh = (event: Event) => {
      if (
        (event as CustomEvent<{ projetoId: string }>).detail?.projetoId ===
        projetoId
      )
        void load()
    }
    window.addEventListener('operum:document-version', refresh)
    return () => window.removeEventListener('operum:document-version', refresh)
  }, [load, projetoId])
  const carregouEmbutido = useRef(false)
  useEffect(() => {
    if (!embutido || carregouEmbutido.current) return
    carregouEmbutido.current = true
    void load('historico')
  }, [embutido, load])
  async function review(versionId: string, action: 'approve' | 'reject') {
    setBusy(true)
    setError('')
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/revisions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId, action }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      await load()
      router.refresh()
      if (action === 'approve')
        window.dispatchEvent(
          new CustomEvent('operum:document-published', {
            detail: { projetoId, type },
          }),
        )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao revisar')
    } finally {
      setBusy(false)
    }
  }
  async function remove(versionId: string) {
    setBusy(true)
    setError('')
    try {
      const response = await fetchWithSession(
        `/api/projects/${projetoId}/revisions`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ versionId }),
        },
      )
      if (!response.ok) throw new Error((await response.json()).error)
      await load()
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Erro ao excluir versão',
      )
    } finally {
      setBusy(false)
    }
  }
  const Raiz = embutido ? 'div' : 'details'
  return (
    <Raiz
      className={embutido ? 'p-4' : 'm-4 rounded-xl border border-gray-200 bg-white p-4'}
      {...(embutido ? {} : {
        onToggle: (e: React.SyntheticEvent<HTMLElement>) => {
          if ((e.currentTarget as HTMLDetailsElement).open) void load()
        },
      })}
    >
      {!embutido && (
        <summary className="cursor-pointer font-semibold">
          Histórico e registro — {labels[type] ?? type}
        </summary>
      )}
      <p className="my-3 text-sm text-gray-600">
        Versões pendentes não alteram o documento vigente. Abra o conteúdo para
        conferir a proposta antes de aprovar.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => load('historico')}
          aria-pressed={tab === 'historico'}
          className="rounded border px-3 py-2"
        >
          Histórico
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => load('registro')}
          aria-pressed={tab === 'registro'}
          className="rounded border px-3 py-2"
        >
          Registro
        </button>
      </div>
      {busy && <p role="status">Carregando…</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {tab === 'historico' ? (
        <div className="space-y-3 py-3">
          {versions.length === 0 && <p>Nenhuma versão registrada.</p>}
          {versions.map((v) => (
            <article
              key={v.id}
              className={`rounded border p-3 ${v.status === 'PENDING' ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
            >
              <strong>{v.commitTitle}</strong>
              {v.versao && <p className="text-sm">Versão {v.versao}</p>}
              <p className="text-sm">
                {labels[v.status]} · {v.elaboradoPor || v.author?.name || 'Autor não disponível'}{' '}
                · {new Date(v.createdAt).toLocaleString('pt-BR')}
              </p>
              <details className="my-2 text-sm">
                <summary className="cursor-pointer text-blue-700">
                  Ver conteúdo desta versão
                </summary>
                <Conteudo value={v.payload} />
              </details>
              {!v.payload && (
                <p className="text-sm text-gray-600">
                  Registro antigo sem conteúdo preservado. Crie uma nova versão
                  para aprovação.
                </p>
              )}
              {canDelete && v.status !== 'APPROVED' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(v.id)}
                  className="my-2 text-sm text-red-700"
                >
                  Excluir versão
                </button>
              )}
              {canApprove && v.status === 'PENDING' && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={busy || !v.payload}
                    onClick={() => review(v.id, 'approve')}
                    className="rounded bg-blue-600 px-3 py-1 text-white"
                  >
                    Aprovar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => review(v.id, 'reject')}
                    className="rounded border px-3 py-1"
                  >
                    Rejeitar
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <ul className="space-y-2 py-3">
          {logs.length === 0 && <li>Nenhum registro.</li>}
          {logs.map((l) => (
            <li key={l.id} className="rounded border p-2 text-sm">
              <strong>{labels[l.action] ?? l.action}</strong> ·{' '}
              {new Date(l.timestamp).toLocaleString('pt-BR')} ·{' '}
              {l.userName ?? l.userId ?? 'Usuário indisponível'}
              <details>
                <summary>Detalhes</summary>
                <Conteudo value={l.details} />
              </details>
            </li>
          ))}
        </ul>
      )}
    </Raiz>
  )
}
