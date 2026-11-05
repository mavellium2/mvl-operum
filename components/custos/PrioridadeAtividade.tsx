'use client'

import { useRef, useState } from 'react'
import { Flag } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import GlassPopover from '@/components/ui/GlassPopover'
import CardPriority from '@/components/card/CardPriority'
import { useToast } from '@/components/ui/Toast'
import { patchCardAction } from '@/app/actions/sprintBoard'
import { PRIORITY_LABELS } from '@/lib/cardUtils'
import type { CardDaAtividade } from '@/lib/planilhaCustos'

export default function PrioridadeAtividade({ card, nome, canEdit, onChanged, draftPriority, onDraft }: {
  card?: CardDaAtividade; draftPriority?: string; onDraft?: (value: string) => void; nome: string; canEdit: boolean; onChanged: () => void
}) {
  const anchor = useRef<HTMLButtonElement>(null)
  const saving = useRef(false)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savedPriority, setPriority] = useState(draftPriority ?? card?.priority ?? 'baixa')
  const priority = onDraft ? draftPriority ?? 'baixa' : savedPriority
  const { toast } = useToast()
  const label = PRIORITY_LABELS[priority]?.label ?? 'Sem prioridade'
  const icon = <Flag className="h-4 w-4" strokeWidth={1.65} aria-hidden="true" />
  if (!canEdit) return <span className="planilha-prioridade" data-prioridade={priority} title={`Prioridade ${label}`} role="img" aria-label={`Prioridade ${label}`}>{icon}</span>
  return <>
    <GlassButton ref={anchor} variant="custom" type="button" className="planilha-prioridade rounded p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2" data-prioridade={priority}
      title={`Alterar prioridade: ${label}`} aria-label={`Prioridade de ${nome}: ${label}`} aria-haspopup="dialog" aria-expanded={open} disabled={busy} onClick={() => setOpen(value => !value)}>{icon}</GlassButton>
    <GlassPopover open={open} onClose={() => { if (!saving.current) setOpen(false) }} anchor={anchor} label={`Prioridade de ${nome}`}>
      <fieldset disabled={busy} aria-busy={busy}>
        <CardPriority priority={priority} onChange={async value => {
          if (saving.current) return
          if (value === priority) { setOpen(false); anchor.current?.focus(); return }
          if (onDraft) { onDraft(value); setPriority(value); setOpen(false); anchor.current?.focus(); return }
          if (!card) return
          saving.current = true
          setBusy(true)
          try {
            const result = await patchCardAction(card.sprintId ?? '', card.id, { priority: value as 'baixa' | 'media' | 'alta' })
            if (result.error) { toast(result.error, 'error'); return }
            setPriority(value)
            setOpen(false)
            onChanged()
          } catch {
            toast('Não foi possível atualizar a prioridade. Tente novamente.', 'error')
          } finally {
            saving.current = false
            setBusy(false)
            anchor.current?.focus()
          }
        }} />
      </fieldset>
    </GlassPopover>
  </>
}
