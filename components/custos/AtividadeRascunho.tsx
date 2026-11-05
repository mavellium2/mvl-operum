'use client'

import { useEffect, useMemo } from 'react'
import CardModal from '@/components/card/CardModal'
import type { AtividadeDetalhe } from './AtividadeDetalhesPainel'

export interface ArquivoRascunho { id: string; file: File; name: string }

/** Reutiliza o editor do card, mantendo arquivos locais até Salvar na planilha. */
export default function AtividadeRascunho({ atividade, files, onFilesChange, onDescriptionChange, onTitleChange, priority, onPriorityChange, canEdit }: {
  atividade: AtividadeDetalhe; files: ArquivoRascunho[]; onFilesChange: (files: ArquivoRascunho[]) => void
  onDescriptionChange: (value: string) => void; onTitleChange: (value: string) => void
  priority: string; onPriorityChange: (value: string) => void; canEdit: boolean
}) {
  const attachments = useMemo(() => files.map(item => ({ id: item.id, fileName: item.name, fileSize: item.file.size, fileType: item.file.type, filePath: URL.createObjectURL(item.file), uploadedAt: 0 })), [files])
  useEffect(() => () => { attachments.forEach(item => URL.revokeObjectURL(item.filePath)) }, [attachments])
  return <>
    <p className="atividade-detalhes-ajuda">Descrição e anexos são salvos automaticamente após uma pausa na edição.</p>
    <CardModal isOpen embedded readOnly={!canEdit} onClose={() => {}} commentsTarget={null} commentsVisible={false}
      initialCard={{ id: atividade.nodeId, title: atividade.titulo, eapCode: atividade.codigo, description: atividade.descricao, priority, color: '#94a3b8', createdAt: 0, updatedAt: 0 }}
      onDescriptionDraftChange={canEdit ? onDescriptionChange : undefined}
      attachments={attachments}
      onPatch={canEdit ? async patch => { if (patch.description !== undefined) onDescriptionChange(patch.description) } : undefined}
      onPriorityChange={canEdit ? async value => { onPriorityChange(value) } : undefined}
      onAttachmentUpload={canEdit ? file => { onFilesChange([...files, { id: crypto.randomUUID(), file, name: file.name }]) } : undefined}
      onAttachmentDelete={canEdit ? id => onFilesChange(files.filter(item => item.id !== id)) : undefined}
      onAttachmentRename={canEdit ? (id, name) => onFilesChange(files.map(item => item.id === id ? { ...item, name } : item)) : undefined}
      onSubmit={async ({ title, description }) => { onTitleChange(title); onDescriptionChange(description); return { success: true } }}
    />
  </>
}
