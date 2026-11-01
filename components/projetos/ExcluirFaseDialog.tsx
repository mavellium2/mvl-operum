'use client'

import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GlassButton from '@/components/ui/GlassButton'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileText, Kanban, ListTree, Wallet } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { excluirFaseAction, impactoExclusaoFaseAction, type ImpactoExclusaoFase } from '@/app/actions/projetoEdicao'
import type { RegistroVersao } from '@/services/projetoVersoes'

const MOTIVO_MINIMO = 5
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const horas = (s: number) => `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * Confirmação de exclusão de uma macro fase já salva: mostra o impacto na EAP, nas
 * sprints, nas tarefas, na planilha e no Termo, pede motivo quando a sprint tem dados
 * e exclui na hora pelo mesmo caminho da aba EAP/WBS.
 */
export default function ExcluirFaseDialog({ projetoId, fase, versao, onFechar, onExcluida }: {
  projetoId: string
  /** Fase a excluir (item da EAP); nulo fecha o diálogo. */
  fase: { nodeId: string; nome: string; numero: string } | null
  /** Versão do histórico gravada junto com a exclusão. */
  versao: () => RegistroVersao | undefined
  onFechar: () => void
  onExcluida: () => void
}) {
  const [impacto, setImpacto] = useState<ImpactoExclusaoFase | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const motivoRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!fase || !impacto?.exigeMotivo) return
    const frame = requestAnimationFrame(() => motivoRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [fase, impacto])
  const [excluindo, setExcluindo] = useState(false)

  useEffect(() => {
    if (!fase) return
    let ativo = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia ao abrir para outra fase
    setImpacto(null); setErro(null); setMotivo('')
    impactoExclusaoFaseAction(projetoId, fase.nodeId).then(r => {
      if (!ativo) return
      if ('error' in r) setErro(r.error)
      else setImpacto(r.impacto)
    })
    return () => { ativo = false }
  }, [fase, projetoId])

  async function excluir() {
    if (!fase) return
    setExcluindo(true)
    setErro(null)
    const r = await excluirFaseAction(projetoId, fase.nodeId, motivo, versao())
    setExcluindo(false)
    if ('error' in r) { setErro(r.error); return }
    onExcluida()
  }

  const faltaMotivo = !!impacto?.exigeMotivo && motivo.trim().length < MOTIVO_MINIMO
  const itens = impacto ? [
    { Icone: ListTree, titulo: 'Estrutura e tarefas', texto: [
      impacto.itensEap ? `Remove a fase e ${plural(impacto.itensEap, 'item da EAP', 'itens da EAP')}.` : 'Remove a fase da EAP.',
      impacto.tarefas ? `Exclui ${plural(impacto.tarefas, 'tarefa vinculada', 'tarefas vinculadas')}.` : '',
    ].filter(Boolean).join(' '), alerta: impacto.tarefas > 0 },
    ...impacto.sprints.map(s => ({
      Icone: Kanban, titulo: `Sprint ${s.nome}`,
      texto: `Exclui a sprint${s.tarefas ? ` com ${plural(s.tarefas, 'tarefa', 'tarefas')}` : ''}${s.segundosRegistrados ? ` e ${horas(s.segundosRegistrados)} registradas` : ''}. Tarefas fora da EAP voltam ao backlog. O histórico registra a exclusão.`,
      alerta: s.comDados,
    })),
    { Icone: Wallet, titulo: 'Impacto nos custos', texto: impacto.orcado || impacto.realizado
      ? `${brl(impacto.orcado)} orçados e ${brl(impacto.realizado)} realizados deixam de compor os totais do projeto.`
      : 'Remove a fase da planilha. Não há valores lançados.' },
    { Icone: FileText, titulo: 'Termo de Abertura', texto: 'Remove a fase do cronograma do documento.' },
  ] : []

  return (
    <Modal isOpen={!!fase} onClose={() => !excluindo && onFechar()} title={fase ? `Excluir a fase ${fase.numero} ${fase.nome}?` : 'Excluir fase'} maxWidth="max-w-3xl" scrollContent={false} hideHeader className="phase-delete-dialog">
      <div className="phase-delete-content px-6 pb-6 pt-6 sm:px-8 sm:pt-7">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <p className="phase-delete-danger mb-2 flex items-center gap-2 text-xs font-medium"><AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.7} />Confirmação de exclusão</p>
            <h2 className="phase-delete-heading text-2xl font-semibold tracking-tight">Excluir a fase {fase?.numero}?</h2>
          </div>
          <GlassCloseButton label="Fechar modal" onClick={onFechar} disabled={excluindo} />
        </div>
        <p className="phase-delete-project mb-1 break-words text-base font-medium">{fase?.nome}</p>
      {!impacto && !erro && <p className="py-6 text-center text-sm text-slate-500">Calculando o impacto da exclusão…</p>}
      {impacto && (
        <>
          <div className="phase-delete-warning my-5 flex items-start gap-3 rounded-2xl px-4 py-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            <div>
              <p className="text-[13px] font-semibold">A exclusão acontece assim que você confirmar.</p>
              <p className="mt-1 text-xs leading-relaxed opacity-80">Sair sem salvar depois não desfaz esta ação. Confira os dados afetados antes de continuar.</p>
            </div>
          </div>
          <dl className="phase-delete-metrics mb-5 grid grid-cols-3 gap-3 border-b pb-5">
            <div><dt className="phase-delete-muted text-[11px]">Tarefas excluídas</dt><dd className="phase-delete-heading mt-1 text-xl font-semibold tabular-nums">{impacto.tarefas}</dd></div>
            <div><dt className="phase-delete-muted text-[11px]">Sprints excluídas</dt><dd className="phase-delete-heading mt-1 text-xl font-semibold tabular-nums">{impacto.sprints.length}</dd></div>
            <div><dt className="phase-delete-muted text-[11px]">Custo realizado afetado</dt><dd className="phase-delete-heading mt-1 text-sm font-semibold tabular-nums">{brl(impacto.realizado)}</dd></div>
          </dl>
          <h3 className="phase-delete-heading mb-2 text-sm font-semibold">O que será removido ou alterado</h3>
          <ul className="phase-delete-consequences" data-testid="impacto-exclusao">
            {itens.map((it, i) => (
              <li key={i} className="phase-delete-impact flex gap-3 border-b px-1 py-3 text-sm last:border-b-0" data-warning={'alerta' in it && it.alerta}>
                <span className="phase-impact-icon mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"><it.Icone className="h-4 w-4" strokeWidth={1.6} /></span>
                <div><p className="phase-delete-heading text-[13px] font-medium">{it.titulo}</p><p className="phase-delete-muted mt-1 text-[13px] leading-relaxed">{it.texto}</p></div>
              </li>
            ))}
          </ul>
          {impacto.exigeMotivo && (
            <div className="phase-delete-reason mt-5">
              <label htmlFor="motivo-exclusao-fase" className="mb-1 block text-sm font-medium text-slate-700">Registre o motivo <span className="phase-delete-muted text-xs font-normal">Obrigatório</span></label>
              <textarea ref={motivoRef} required aria-describedby="motivo-exclusao-ajuda" id="motivo-exclusao-fase" value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={1000}
                placeholder="Descreva o motivo da exclusão…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300/40" />
              <p id="motivo-exclusao-ajuda" className="phase-delete-muted mt-2 text-xs">Use pelo menos {MOTIVO_MINIMO} caracteres. O motivo fica registrado no histórico das sprints.</p>
            </div>
          )}
        </>
      )}
      {erro && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-600"><AlertTriangle className="h-4 w-4 shrink-0" />{erro}</p>}
      <div className="phase-delete-actions mt-5 flex justify-end gap-2 border-t pt-5">
        <GlassButton className="phase-delete-cancel" variant="custom" autoFocus onClick={onFechar} disabled={excluindo}>Cancelar</GlassButton>
        <GlassButton className="phase-delete-confirm" variant="custom" onClick={() => void excluir()} disabled={!impacto || faltaMotivo || excluindo}>{excluindo ? 'Excluindo…' : 'Confirmar exclusão'}</GlassButton>
      </div>
      </div>
    </Modal>
  )
}
