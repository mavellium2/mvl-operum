'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useRef } from 'react'
import { Attachment } from '@/types/kanban'
import { ATTACHMENT_ACCEPT } from '@/lib/attachmentTypes'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']

interface CardAttachmentsProps {
  attachments: Attachment[]
  onUpload: (file: File) => void
  onDelete: (attachmentId: string) => void
  onSetCover?: (attachmentId: string) => void
}

function FileIcon({ fileType }: { fileType: string }) {
  if (fileType.includes('pdf')) return <span className="text-red-500 text-xs font-bold">PDF</span>
  if (fileType.includes('word')) return <span className="text-blue-500 text-xs font-bold">DOC</span>
  if (fileType.includes('sheet')) return <span className="text-green-500 text-xs font-bold">XLS</span>
  return (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
    </svg>
  )
}

export default function CardAttachments({ attachments, onUpload, onDelete, onSetCover }: CardAttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium text-gray-700">Anexos</div>

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attachments.map(att => {
            const isImage = IMAGE_TYPES.includes(att.fileType)
            return (
              <li key={att.id} className="rounded-lg border border-gray-100 overflow-hidden">
                {isImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${att.id}/image`}
                    alt={att.fileName}
                    className="w-full max-h-32 object-cover"
                  />
                )}
                <div className="flex items-center gap-2 p-2">
                  {!isImage && <FileIcon fileType={att.fileType} />}
                  <a
                    href={att.filePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline truncate flex-1 text-sm"
                  >
                    {att.fileName}
                    {att.isCover && <span className="ml-1 text-xs text-amber-600 font-medium">(capa)</span>}
                  </a>
                  <div className="flex items-center gap-1 shrink-0">
                    {isImage && onSetCover && !att.isCover && (
                      <OperumButton variant="default"
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSetCover(att.id) }}
                        className="text-xs text-amber-600 hover:text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 hover:bg-amber-50"
                      >
                        Definir capa
                      </OperumButton>
                    )}
                    <OperumButton variant="danger"
                      type="button"
                      aria-label="Excluir anexo"
                      onClick={(e) => { e.stopPropagation(); onDelete(att.id) }}
                      className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50"
                    >
                      Excluir
                    </OperumButton>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        onChange={handleFileChange}
        className="text-sm text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
      />
    </div>
  )
}
