'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, FileText, Kanban, ListTree, Wallet } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
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
    { Icone: ListTree, titulo: 'EAP', texto: impacto.itensEap ? `A fase e ${plural(impacto.itensEap, 'item abaixo dela', 'itens abaixo dela')} saem da EAP.` : 'A fase sai da EAP.' },
    ...(impacto.sprints.length ? impacto.sprints.map(s => ({
      Icone: Kanban, titulo: `Sprint ${s.nome}`,
      texto: `É excluída${s.tarefas || s.segundosRegistrados ? ` (${plural(s.tarefas, 'tarefa', 'tarefas')}${s.segundosRegistrados ? `, ${horas(s.segundosRegistrados)} registradas` : ''})` : ''}. Tarefas que não estão na EAP voltam para o backlog; a exclusão fica no histórico das sprints.`,
      alerta: s.comDados,
    })) : []),
    ...(impacto.tarefas ? [{ Icone: Kanban, titulo: 'Tarefas', texto: `${plural(impacto.tarefas, 'tarefa ligada', 'tarefas ligadas')} aos itens da fase ${impacto.tarefas === 1 ? 'é excluída' : 'são excluídas'}.`, alerta: true }] : []),
    { Icone: Wallet, titulo: 'Planilha de custos', texto: impacto.orcado || impacto.realizado ? `Deixam de contar ${brl(impacto.orcado)} orçados e ${brl(impacto.realizado)} realizados.` : 'A fase sai da planilha (sem valores lançados).' },
    { Icone: FileText, titulo: 'Termo de Abertura', texto: 'A fase sai das macro fases do Termo.' },
  ] : []

  return (
    <Modal isOpen={!!fase} onClose={() => !excluindo && onFechar()} title={fase ? `Excluir a fase ${fase.numero} ${fase.nome}?` : 'Excluir fase'} maxWidth="max-w-lg">
      {!impacto && !erro && <p className="py-6 text-center text-sm text-slate-500">Calculando o impacto da exclusão…</p>}
      {impacto && (
        <>
          <p className="mb-3 text-sm text-slate-600">A exclusão é aplicada na hora (não depende de Salvar) e reflete em:</p>
          <ul className="space-y-2" data-testid="impacto-exclusao">
            {itens.map((it, i) => (
              <li key={i} className={`flex gap-3 rounded-xl border px-3 py-2.5 text-sm ${'alerta' in it && it.alerta ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50/60'}`}>
                <it.Icone className={`mt-0.5 h-4 w-4 shrink-0 ${'alerta' in it && it.alerta ? 'text-amber-600' : 'text-slate-400'}`} />
                <div><p className="font-semibold text-slate-800">{it.titulo}</p><p className="text-slate-600">{it.texto}</p></div>
              </li>
            ))}
          </ul>
          {impacto.exigeMotivo && (
            <div className="mt-4">
              <label htmlFor="motivo-exclusao-fase" className="mb-1 block text-sm font-medium text-slate-700">Motivo da exclusão *</label>
              <textarea id="motivo-exclusao-fase" value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={1000}
                placeholder="Por que esta fase está sendo excluída? Fica no histórico das sprints."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          )}
        </>
      )}
      {erro && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-600"><AlertTriangle className="h-4 w-4 shrink-0" />{erro}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" autoFocus onClick={onFechar} disabled={excluindo}>Cancelar</Button>
        <Button variant="danger" onClick={() => void excluir()} disabled={!impacto || faltaMotivo || excluindo}>{excluindo ? 'Excluindo…' : 'Excluir fase'}</Button>
      </div>
    </Modal>
  )
}
