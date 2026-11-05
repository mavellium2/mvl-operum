'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Textarea as OperumTextarea } from '@/components/ui/Field'
import MarkdownText from '@/components/ui/MarkdownText'

interface CardDescriptionProps {
  draftDescription: string
  compactEdit?: boolean
  readOnly: boolean
  isEditingDesc: boolean
  hasUnsavedDescription: boolean
  autosaveEnabled?: boolean
  autosaveInfo?: { cls: string; text: string } | null
  canRetry?: boolean
  saving?: boolean
  onEdit: () => void
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  onFlush?: () => void
  onInsertMarkdown?: (prefix: string, suffix?: string) => void
}

export default function CardDescription({
  draftDescription, compactEdit = false, readOnly, isEditingDesc, hasUnsavedDescription, autosaveEnabled, autosaveInfo,
  canRetry, saving, onEdit, onChange, onSave, onCancel, onFlush, onInsertMarkdown,
}: CardDescriptionProps) {
  return (
    <section className={compactEdit ? "atividade-card-descricao" : undefined}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descrição</h3>
        <div className="flex items-center gap-2">
          {autosaveInfo && (
            <OperumButton variant={compactEdit ? "custom" : "default"}
              type="button"
              aria-live="polite"
              disabled={!canRetry}
              onClick={() => { onFlush?.() }}
              className={`text-[11px] font-medium ${autosaveInfo.cls}`}
            >
              {autosaveInfo.text}
            </OperumButton>
          )}
          {!autosaveEnabled && hasUnsavedDescription && !isEditingDesc && (
            <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">não salvo</span>
          )}
          {!isEditingDesc && !readOnly && (
            <OperumButton variant={compactEdit ? "custom" : "default"} type="button"
              onClick={() => onEdit()}
              className={compactEdit ? "atividade-card-acao-compacta" : "text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"}
            >
              Editar
            </OperumButton>
          )}
        </div>
      </div>

      {readOnly ? (
        <div className="card-descricao-leitura min-h-[72px] p-3 rounded-lg bg-slate-50 text-sm text-slate-700 border border-slate-200">
          {draftDescription
            ? <MarkdownText>{draftDescription}</MarkdownText>
            : <span className="text-slate-400 text-sm">Sem descrição.</span>
          }
        </div>
      ) : isEditingDesc ? (
        <div className="card-descricao-editor border border-blue-400 rounded-lg overflow-hidden bg-white ring-1 ring-blue-400">
          {onInsertMarkdown && <div className="card-descricao-formatacao flex items-center gap-1 p-1.5 bg-slate-50 border-b border-slate-200">
            <OperumButton variant="default" type="button" onClick={() => onInsertMarkdown?.('**', '**')} className="px-2 py-1 text-xs hover:bg-slate-200 rounded font-bold text-slate-600 cursor-pointer">B</OperumButton>
            <OperumButton variant="default" type="button" onClick={() => onInsertMarkdown?.('*', '*')} className="px-2 py-1 text-xs hover:bg-slate-200 rounded italic text-slate-600 cursor-pointer">I</OperumButton>
            <OperumButton variant="default" type="button" onClick={() => onInsertMarkdown?.('- ')} className="px-2 py-1 text-xs hover:bg-slate-200 rounded text-slate-600 cursor-pointer">• Lista</OperumButton>
          </div>}
          <OperumTextarea
            aria-label="Descrição do card"
            autoFocus
            value={draftDescription}
            disabled={saving}
            onChange={e => onChange(e.target.value)}
            onBlur={() => { onFlush?.() }}
            placeholder="Adicione detalhes, critérios de aceite..."
            className="w-full p-3 text-sm text-slate-700 outline-none min-h-[120px] resize-y"
          />
          <FormActions className="card-descricao-rodape flex gap-2 p-2 bg-slate-50 border-t border-slate-200">
            {autosaveEnabled ? (
              <>
                <OperumButton variant="primary" type="button" onClick={onSave} disabled={saving} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer">Concluir</OperumButton>
                {compactEdit && <OperumButton variant="default" type="button" onClick={onCancel} disabled={saving}>Descartar</OperumButton>}
              </>
            ) : (
              <>
                <OperumButton variant="primary" type="button" onClick={onSave} disabled={saving} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer">Salvar</OperumButton>
                <OperumButton variant="default" type="button" onClick={onCancel} disabled={saving} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs rounded-md transition-colors cursor-pointer">Cancelar</OperumButton>
              </>
            )}
          </FormActions>
        </div>
      ) : (
        <div
          onClick={() => onEdit()}
          className="card-descricao-leitura min-h-[72px] p-3 rounded-lg cursor-text bg-slate-50 hover:bg-slate-100 text-sm text-slate-700 transition-colors border border-slate-200"
        >
          {draftDescription
            ? <MarkdownText>{draftDescription}</MarkdownText>
            : <span className="text-slate-400 text-sm">Clique para adicionar uma descrição...</span>
          }
        </div>
      )}
    </section>
  )
}
