'use client'

import { AlertTriangle, FileText, Layers, Save, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GlassButton from '@/components/ui/GlassButton'

export default function RestaurarVersaoDialog({ numero, fasesMantidas, alteracoesPendentes, ocupado = false, erro, onClose, onConfirm }: {
  ocupado?: boolean
  erro?: string
  numero: number
  fasesMantidas: string[]
  alteracoesPendentes: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return <Modal isOpen onClose={() => { if (!ocupado) onClose() }} title={`Restaurar versão ${numero}?`} hideHeader scrollContent={false} maxWidth="max-w-2xl" className="phase-delete-dialog restore-version-dialog">
    <div className="px-6 py-6 sm:px-8">
      <div className="flex items-start justify-between gap-4">
        <div><p className="phase-delete-muted mb-2 text-xs">Histórico do projeto</p><h2 className="phase-delete-heading text-2xl font-semibold tracking-tight">Restaurar a versão {numero}?</h2></div>
        <GlassCloseButton label="Fechar confirmação" disabled={ocupado} onClick={onClose} />
      </div>
      <p className="phase-delete-muted mt-3 text-sm leading-relaxed">Ao confirmar, esta versão se torna a ativa e seus dados são aplicados ao projeto. Nenhuma versão nova é criada; todas as outras permanecem recuperáveis no histórico.</p>
      {alteracoesPendentes && <div className="phase-delete-warning mt-5 flex gap-3 rounded-2xl px-4 py-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p className="text-sm leading-relaxed">As edições ainda não salvas neste formulário serão substituídas, incluindo fases novas que você ainda não salvou.</p></div>}
      <h3 className="phase-delete-heading mb-3 mt-5 text-sm font-semibold">O que acontece ao restaurar</h3>
      <ul className="space-y-3">
        {[
          { Icon: FileText, title: 'Dados e cronograma', text: 'Os campos do projeto e as fases da versão escolhida serão restaurados. Prazos e custos dessas fases passam a usar os valores daquela versão.' },
          { Icon: Layers, title: 'Fases já salvas são preservadas', text: 'Fases atuais que não existiam nesta versão continuam no projeto. A restauração não as exclui nem remove seus vínculos. Para removê-las, use a lixeira de cada fase.' },
          { Icon: Save, title: 'O histórico continua preservado', text: 'A confirmação ativa a versão escolhida sem apagar as demais. O próximo salvamento pede confirmação e cria a próxima versão.' },
        ].map(({ Icon, title, text }) => <li key={title} className="restore-consequence flex gap-3 rounded-2xl px-4 py-3"><span className="phase-impact-icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Icon size={16} strokeWidth={1.6} /></span><div><p className="phase-delete-heading text-sm font-medium">{title}</p><p className="phase-delete-muted mt-1 text-xs leading-relaxed">{text}</p></div></li>)}
      </ul>
      {fasesMantidas.length > 0 && <div className="phase-delete-summary mt-5 rounded-2xl px-4 py-3"><p className="phase-delete-heading text-xs font-semibold">Fases que serão mantidas ({fasesMantidas.length})</p><ul className="phase-delete-muted mt-2 flex flex-wrap gap-2 text-xs leading-relaxed">{fasesMantidas.map((fase, i) => <li key={i} className="restore-retained-phase max-w-full break-words rounded-lg px-2.5 py-1">{fase}</li>)}</ul></div>}
      {erro && <p role="alert" className="phase-delete-warning mt-4 rounded-xl px-4 py-3 text-sm">{erro}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5"><GlassButton variant="primary" autoFocus disabled={ocupado} onClick={onClose}>Cancelar</GlassButton><GlassButton className="restore-version-confirm" disabled={ocupado} aria-busy={ocupado} onClick={onConfirm}>{ocupado ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <RotateCcw size={15} />}{ocupado ? 'Restaurando…' : 'Ativar esta versão'}</GlassButton></div>
    </div>
  </Modal>
}
