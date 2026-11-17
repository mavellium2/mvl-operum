'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock, FileText, History, Plus, ShieldAlert, Trash2, User, XCircle } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EmptyState from '@/components/ui/EmptyState'
import Tooltip from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import { abrirPropostas } from '@/hooks/useVersoesDocumento'
import { criarRiscoAction, excluirRiscoAction } from '@/app/actions/riscos'
import type { RiscoListItem } from '@/services/documentRevisionService'
import type { MembroEquipeOption } from '../MembroEquipeSelect'
import { DOCUMENTO_RISCOS, FormularioRisco, numeroRisco } from './FormulariosRiscos'

export type { RiscoListItem }

const STATUS: Record<RiscoListItem['status'], { rotulo: string; cls: string; Icone: typeof CheckCircle2 }> = {
  APPROVED: { rotulo: 'Aprovado', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icone: CheckCircle2 },
  PENDING: { rotulo: 'Aguardando aprovação', cls: 'bg-amber-50 text-amber-800 ring-amber-200', Icone: Clock },
  REJECTED: { rotulo: 'Versão rejeitada', cls: 'bg-red-50 text-red-700 ring-red-200', Icone: XCircle },
  NONE: { rotulo: 'Sem versão enviada', cls: 'bg-slate-100 text-slate-600 ring-slate-200', Icone: FileText },
}
const IMPACTO: Record<number, string> = { 5: 'alto', 4: 'médio/alto', 3: 'médio', 2: 'médio/baixo', 1: 'baixo' }
const PROBABILIDADE: Record<number, string> = { 5: 'alta', 4: 'média/alta', 3: 'média', 2: 'média/baixa', 1: 'baixa' }
const botaoIcone = 'flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-500'

const hrefRisco = (id?: string) => `?doc=riscos${id ? `&risco=${encodeURIComponent(id)}` : ''}`

function CartaoRisco({ risco, projetoId, podeExcluir, onExcluir }: { risco: RiscoListItem; projetoId: string; podeExcluir: boolean; onExcluir: () => void }) {
  const s = STATUS[risco.status]
  const n = numeroRisco(risco.numero)
  return (
    <li data-testid="risco-item" className="documento-ata-card group relative flex items-stretch gap-4 rounded-xl border p-4 transition">
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50 text-blue-700" aria-hidden="true">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Nº</span>
        <span className="text-xl font-bold leading-none">{n}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* O link cobre o cartão inteiro; os botões à direita ficam por cima. */}
          <Link href={hrefRisco(risco.id)} aria-label={`Abrir risco ${n}`} className={`truncate font-semibold after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-blue-500 ${risco.denominacao ? 'text-slate-900' : 'italic text-slate-400'}`}>
            {risco.denominacao || 'Risco sem denominação'}
          </Link>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.cls}`}><s.Icone className="h-3.5 w-3.5" />{s.rotulo}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{risco.responsavel ? `Responsável: ${risco.responsavel}` : 'Sem responsável'}</span>
          {risco.impacto && <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" />Impacto {risco.impacto} ({IMPACTO[risco.impacto]})</span>}
          {risco.probabilidade && <span>Probabilidade {risco.probabilidade} ({PROBABILIDADE[risco.probabilidade]})</span>}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1 self-center">
        <Tooltip label="Histórico do risco">
          <GlassButton variant="custom" type="button" aria-label={`Histórico do risco ${n}`} onClick={() => abrirPropostas(projetoId, risco.id)} className={botaoIcone}><History className="h-4 w-4" /></GlassButton>
        </Tooltip>
        {podeExcluir && (
          <Tooltip label="Excluir risco">
            <GlassButton variant="custom" type="button" aria-label={`Excluir risco ${n}`} onClick={onExcluir} className={`${botaoIcone} hover:!bg-red-50 hover:!text-red-600`}><Trash2 className="h-4 w-4" /></GlassButton>
          </Tooltip>
        )}
      </div>
    </li>
  )
}

/**
 * Formulários de Riscos, como as Atas: cada risco é um documento próprio
 * (número, versões, aprovação e Word). Geralmente cada integrante cuida de 1 ou
 * 2 riscos. A lista abre o editor de um risco por `?doc=riscos&risco=<id>`.
 */
export default function DocumentoRiscos({ projetoId, riscos, membros = [] }: { projetoId: string; riscos: RiscoListItem[]; membros?: MembroEquipeOption[] }) {
  const permissions = useProjectPermissions()
  const canEdit = permissions.has('documentos:editar')
  const podeExcluir = permissions.has('documentos:excluir')
  const router = useRouter()
  const aberto = useSearchParams().get('risco')
  const { toast } = useToast()
  const [criando, iniciarCriacao] = useTransition()
  const [excluir, setExcluir] = useState<RiscoListItem | null>(null)

  function novoRisco() {
    if (criando) return
    iniciarCriacao(async () => {
      const r = await criarRiscoAction(projetoId)
      if ('error' in r) { toast(r.error ?? 'Não foi possível criar o risco.', 'error'); return }
      router.push(hrefRisco(r.id))
    })
  }

  async function confirmarExclusao(risco: RiscoListItem) {
    const r = await excluirRiscoAction(risco.id, projetoId)
    if ('error' in r) { toast(r.error ?? 'Não foi possível excluir o risco.', 'error'); return }
    toast(`Risco ${numeroRisco(risco.numero)} excluído.`, 'success')
    router.refresh()
  }

  if (aberto) {
    const risco = riscos.find(r => r.id === aberto)
    const voltar = (
      <Link href={hrefRisco()} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" />Todos os riscos
      </Link>
    )
    if (!risco) {
      return (
        <div className="px-4 py-6 sm:px-8">
          {voltar}
          <p role="status" className="mt-4 text-sm text-slate-500">Risco não encontrado. Ele pode ter sido excluído.</p>
        </div>
      )
    }
    return <FormularioRisco riscoId={risco.id} numero={risco.numero} membros={membros} topo={voltar} />
  }

  const pendentes = riscos.filter(r => r.status === 'PENDING').length
  const botaoNovo = canEdit ? (
    <GlassButton variant="primary" type="button" onClick={novoRisco} disabled={criando} aria-busy={criando} className="inline-flex h-9 items-center gap-1.5 px-4 text-sm">
      <Plus className="h-4 w-4" />{criando ? 'Criando…' : 'Novo risco'}
    </GlassButton>
  ) : (
    <Tooltip label="Sem permissão para criar riscos">
      <span aria-disabled="true" className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-lg bg-slate-200 px-4 text-sm font-medium text-slate-500"><Plus className="h-4 w-4" />Novo risco</span>
    </Tooltip>
  )

  return (
    <div className="documento-atas-page px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{DOCUMENTO_RISCOS}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {riscos.length === 0 ? 'Um formulário por risco. Geralmente cada integrante da equipe cuida de 1 ou 2 riscos.' : `${riscos.length} ${riscos.length === 1 ? 'risco' : 'riscos'}`}
            </p>
          </div>
          {botaoNovo}
        </header>

        {pendentes > 0 && (
          <div role="status" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="flex-1"><strong>{pendentes === 1 ? '1 risco aguardando aprovação.' : `${pendentes} riscos aguardando aprovação.`}</strong> A versão vigente não muda até a aprovação.</span>
            <GlassButton variant="default" type="button" onClick={() => abrirPropostas(projetoId)} className="rounded-lg bg-white px-3 py-1.5 font-medium text-amber-900 ring-1 ring-amber-300 hover:bg-amber-100">Revisar</GlassButton>
          </div>
        )}

        {riscos.length === 0 ? (
          <EmptyState
            className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white"
            icon={<ShieldAlert className="mx-auto mb-4 h-12 w-12 text-slate-300" />}
            heading="Nenhum risco registrado ainda"
            subtext="Cada risco tem o próprio formulário: identificação, avaliação, resposta com responsável e acompanhamento."
            action={canEdit ? { label: 'Novo risco', onClick: novoRisco } : undefined}
          />
        ) : (
          <ul className="mt-5 space-y-2">
            {riscos.map(r => <CartaoRisco key={r.id} risco={r} projetoId={projetoId} podeExcluir={podeExcluir} onExcluir={() => setExcluir(r)} />)}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={() => { if (excluir) void confirmarExclusao(excluir) }}
        title={excluir ? `Excluir o risco ${numeroRisco(excluir.numero)}?` : 'Excluir risco'}
        message="O risco sai da lista do projeto, e as propostas dele que ainda aguardavam aprovação são descartadas. O número não é reutilizado e a exclusão fica no registro do documento."
        confirmLabel="Excluir risco"
      />
    </div>
  )
}
