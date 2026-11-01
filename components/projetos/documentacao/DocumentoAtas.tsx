'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CalendarDays, CheckCircle2, Clock, Download, FileText, History, ListChecks, MapPin, MoreHorizontal,
  Paperclip, Plus, Search, Trash2, Users, XCircle,
} from 'lucide-react'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import { removerAtaAction } from '@/app/actions/atas'
import { fetchWithSession } from '@/lib/clientFetch'
import { filtrarAtas, statusPorAta, type AtaListItem, type FiltroAtas, type StatusAta } from '@/lib/atasLista'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import Tooltip from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'

export type { AtaListItem }

interface Props {
  projetoId: string
  atas: AtaListItem[]
  /** Mantido por compatibilidade; a exclusão segue a permissão `documentos:excluir`. */
  gerente?: boolean
}

const STATUS: Record<StatusAta, { rotulo: string; cls: string; Icone: typeof CheckCircle2 }> = {
  APPROVED: { rotulo: 'Aprovada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icone: CheckCircle2 },
  PENDING: { rotulo: 'Aguardando aprovação', cls: 'bg-amber-50 text-amber-800 ring-amber-200', Icone: Clock },
  REJECTED: { rotulo: 'Versão rejeitada', cls: 'bg-red-50 text-red-700 ring-red-200', Icone: XCircle },
  NONE: { rotulo: 'Sem versão enviada', cls: 'bg-slate-100 text-slate-600 ring-slate-200', Icone: FileText },
}

const numeroAta = (n: number) => String(n).padStart(2, '0')
/** "seg., 14 de set. de 2026" — a data da reunião é um dia, sem fuso. */
const diaPorExtenso = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const diaCurto = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const botaoIcone = 'flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-500'

/** Abre o painel "Propostas e registro" (DocumentacaoLayout), da lista toda ou de uma ata. */
function abrirHistorico(projetoId: string, resourceId?: string) {
  window.dispatchEvent(new CustomEvent('operum:revisar-propostas', { detail: { projetoId, resourceId } }))
}

function MenuAta({ href, podeExcluir, onExcluir, numero }: { href: string; podeExcluir: boolean; onExcluir: () => void; numero: number }) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  return (
    <div ref={raiz} className="relative">
      <Tooltip label="Mais ações">
        <button type="button" aria-label={`Mais ações da ata ${numeroAta(numero)}`} aria-haspopup="menu" aria-expanded={aberto} onClick={() => setAberto(a => !a)} className={botaoIcone}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </Tooltip>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-slate-100 bg-white py-1 text-sm shadow-xl">
          <Link role="menuitem" href={href} className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"><FileText className="h-4 w-4" />Abrir e editar</Link>
          {podeExcluir && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <button role="menuitem" type="button" onClick={() => { setAberto(false); onExcluir() }} className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" />Excluir ata…</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CartaoAta({ ata, projetoId, status, podeExcluir, onExcluir }: { ata: AtaListItem; projetoId: string; status: StatusAta; podeExcluir: boolean; onExcluir: () => void }) {
  const s = STATUS[status]
  const href = `/projetos/${projetoId}/atas/${ata.id}`
  return (
    <li data-testid="ata-item" className="group relative flex items-stretch gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50 text-blue-700" aria-hidden="true">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Nº</span>
        <span className="text-xl font-bold leading-none">{numeroAta(ata.numero)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* O link cobre o cartão inteiro; os botões à direita ficam por cima. */}
          <Link href={href} aria-label={`Abrir ata ${numeroAta(ata.numero)} de ${diaCurto(ata.data)}`} className="font-semibold text-slate-900 after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-blue-500">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" />{diaPorExtenso(ata.data)}</span>
          </Link>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}><s.Icone className="h-3.5 w-3.5" />{s.rotulo}</span>
        </div>
        <p className={`mt-1 truncate text-sm ${ata.assunto ? 'text-slate-700' : 'italic text-slate-400'}`} title={ata.assunto || undefined}>
          {ata.assunto || 'Sem assuntos registrados'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {ata.local && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{ata.local}</span>}
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{plural(ata.presentes.length, 'presente', 'presentes')}</span>
          <span className="inline-flex items-center gap-1"><ListChecks className="h-3.5 w-3.5" />{plural(ata.acoes, 'ação', 'ações')}</span>
          {ata.acoesVencidas > 0 && <span className="inline-flex items-center gap-1 font-medium text-red-600"><AlertTriangle className="h-3.5 w-3.5" />{ata.acoesVencidas} com prazo vencido</span>}
          {ata.anexos > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />{plural(ata.anexos, 'anexo', 'anexos')}</span>}
          {ata.elaboradoPor && <span>Elaborada por {ata.elaboradoPor}</span>}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1 self-center">
        <Tooltip label="Baixar Word">
          <a href={`/api/atas/${ata.id}/export`} download aria-label={`Baixar Word da ata ${numeroAta(ata.numero)}`} className={botaoIcone}><Download className="h-4 w-4" /></a>
        </Tooltip>
        <Tooltip label="Histórico da ata">
          <button type="button" aria-label={`Histórico da ata ${numeroAta(ata.numero)}`} onClick={() => abrirHistorico(projetoId, ata.id)} className={botaoIcone}><History className="h-4 w-4" /></button>
        </Tooltip>
        <MenuAta href={href} podeExcluir={podeExcluir} onExcluir={onExcluir} numero={ata.numero} />
      </div>
    </li>
  )
}

export default function DocumentoAtas({ projetoId, atas }: Props) {
  const permissions = useProjectPermissions()
  const canEdit = permissions.has('documentos:editar')
  // Mesma permissão que a exclusão exige no servidor.
  const podeExcluir = permissions.has('documentos:excluir')
  const router = useRouter()
  const { toast } = useToast()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroAtas>('todas')
  const [status, setStatus] = useState<Record<string, StatusAta>>({})
  const [excluir, setExcluir] = useState<AtaListItem | null>(null)

  // Status de cada ata: versão mais recente enviada para aprovação.
  const carregarStatus = useCallback(async () => {
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/revisions?type=ATA&tab=historico`)
      if (!r.ok) return
      const dados = await r.json()
      setStatus(statusPorAta(Array.isArray(dados?.versions) ? dados.versions : []))
    } catch { /* sem status: as atas aparecem como "Sem versão enviada" */ }
  }, [projetoId])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega ao abrir e quando uma versão muda
    void carregarStatus()
    const recarregar = () => void carregarStatus()
    window.addEventListener('operum:document-version', recarregar)
    window.addEventListener('operum:document-published', recarregar)
    return () => {
      window.removeEventListener('operum:document-version', recarregar)
      window.removeEventListener('operum:document-published', recarregar)
    }
  }, [carregarStatus])

  const statusDe = (id: string): StatusAta => status[id] ?? 'NONE'
  const pendentes = atas.filter(a => statusDe(a.id) === 'PENDING').length
  const comVencidas = atas.filter(a => a.acoesVencidas > 0).length
  const visiveis = useMemo(() => filtrarAtas(atas, busca, filtro, status), [atas, busca, filtro, status])
  const ultima = atas.reduce<string | null>((m, a) => (!m || a.data > m ? a.data : m), null)

  async function confirmarExclusao(ata: AtaListItem) {
    const r = await removerAtaAction(ata.id, projetoId)
    if ('error' in r) { toast(r.error ?? 'Não foi possível excluir a ata.', 'error'); return }
    toast(`Ata ${numeroAta(ata.numero)} excluída.`, 'success')
    router.refresh()
  }

  const filtros: { id: FiltroAtas; rotulo: string; total: number }[] = [
    { id: 'todas', rotulo: 'Todas', total: atas.length },
    { id: 'pendentes', rotulo: 'Aguardando aprovação', total: pendentes },
    { id: 'vencidas', rotulo: 'Com ações vencidas', total: comVencidas },
  ]

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Atas de Reunião</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {atas.length === 0 ? 'Registro das reuniões do projeto.' : `${plural(atas.length, 'ata', 'atas')}${ultima ? ` · última reunião em ${diaCurto(ultima)}` : ''}`}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {atas.length > 0 && (
              <label className="relative flex-1 sm:flex-none">
                <span className="sr-only">Buscar atas</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por assunto, pessoa ou nº"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 sm:w-72"
                />
              </label>
            )}
            {canEdit ? (
              <Link href={`/projetos/${projetoId}/atas/nova`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
                <Plus className="h-4 w-4" />Nova ata
              </Link>
            ) : (
              <Tooltip label="Sem permissão para criar atas">
                <span aria-disabled="true" className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg bg-slate-200 px-4 text-sm font-medium text-slate-500"><Plus className="h-4 w-4" />Nova ata</span>
              </Tooltip>
            )}
          </div>
        </header>

        {pendentes > 0 && (
          <div role="status" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="flex-1"><strong>{pendentes === 1 ? '1 ata aguardando aprovação.' : `${pendentes} atas aguardando aprovação.`}</strong> A versão vigente não muda até a aprovação.</span>
            <button type="button" onClick={() => abrirHistorico(projetoId)} className="rounded-lg bg-white px-3 py-1.5 font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100">Revisar</button>
          </div>
        )}

        {atas.length === 0 ? (
          <EmptyState
            className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white"
            icon={<FileText className="mx-auto mb-4 h-12 w-12 text-slate-300" />}
            heading="Nenhuma ata registrada ainda"
            subtext="Registre cada reunião com presentes, assuntos, decisões e as ações com prazo e responsável."
            action={canEdit ? { label: 'Nova ata', href: `/projetos/${projetoId}/atas/nova` } : undefined}
          />
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Filtrar atas">
              {filtros.map(f => (
                <button
                  key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}
                  className={`rounded-full px-3 py-1 ${filtro === f.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {f.rotulo} ({f.total})
                </button>
              ))}
            </div>
            {visiveis.length === 0 ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                Nenhuma ata encontrada.{' '}
                <button type="button" onClick={() => { setBusca(''); setFiltro('todas') }} className="font-medium text-blue-600 hover:underline">Limpar busca e filtros</button>
              </div>
            ) : (
              <ul className="mt-3 space-y-2">
                {visiveis.map(a => (
                  <CartaoAta key={a.id} ata={a} projetoId={projetoId} status={statusDe(a.id)} podeExcluir={podeExcluir} onExcluir={() => setExcluir(a)} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={() => { if (excluir) void confirmarExclusao(excluir) }}
        title={excluir ? `Excluir a ata ${numeroAta(excluir.numero)}?` : 'Excluir ata'}
        message="A ata sai da lista do projeto, e as propostas dela que ainda aguardavam aprovação são descartadas. A exclusão fica no registro do documento."
        confirmLabel="Excluir ata"
      />
    </div>
  )
}
