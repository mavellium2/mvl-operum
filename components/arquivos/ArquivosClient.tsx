'use client'

import Select from '@/components/ui/Select'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { sprintPath } from '@/lib/sprintPath'
import { isLinkAttachment, linkHost, linkHref } from '@/lib/attachmentTypes'
import ListaArquivos, { type CategoriaVisual, type ItemArquivo } from './ListaArquivos'

interface Attachment {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  fileSizeFormatted: string
  filePath: string
  isCover: boolean
  uploadedAt: string
  card: {
    id: string
    title: string
    sprintId: string | null
    sprintName: string | null
    projectId?: string | null
  }
  uploadedBy: string | null
}

interface Props {
  initialAttachments: Attachment[]
}

function getFileCategory(fileType: string): CategoriaVisual {
  if (isLinkAttachment(fileType)) return 'link'
  if (fileType.startsWith('image/')) return 'imagem'
  if (fileType === 'application/pdf') return 'pdf'
  return 'outro'
}

export default function ArquivosClient({ initialAttachments }: Props) {
  const [filterSprint, setFilterSprint] = useState('')

  const sprints = useMemo(() => {
    const map = new Map<string, string>()
    initialAttachments.forEach(a => { if (a.card.sprintId) map.set(a.card.sprintId, a.card.sprintName ?? '') })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [initialAttachments])

  const sprintDe = useMemo(() => new Map(initialAttachments.map(a => [a.id, a.card.sprintId])), [initialAttachments])

  const itens: ItemArquivo[] = initialAttachments.map(a => {
    // Link: abre a URL (só http/https). Arquivo: pela rota que confere a
    // sessão e redireciona para a URL assinada (o filePath não abre direto).
    const link = isLinkAttachment(a.fileType)
    const href = link ? linkHref(a.filePath) : `/api/files/${a.id}/download?cardId=${encodeURIComponent(a.card.id)}`
    return {
      id: a.id,
      nome: a.fileName,
      subtitulo: link ? linkHost(a.filePath) : a.fileType,
      categoria: getFileCategory(a.fileType),
      tamanho: a.fileSizeFormatted,
      tamanhoBytes: a.fileSize,
      enviadoPor: a.uploadedBy,
      data: a.uploadedAt,
      busca: a.card.title,
      extra: <>
        <p className="max-w-[180px] truncate text-gray-700">{a.card.title}</p>
        <p className="text-xs text-gray-400">{a.card.sprintName ?? 'Backlog'}</p>
      </>,
      acoes: <>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
            {link ? 'Abrir' : 'Download'}
          </a>
        )}
        {a.card.sprintId && (
          <Link href={sprintPath(a.card.sprintId, a.card.projectId, a.card.id)} className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50">
            Ver card
          </Link>
        )}
      </>,
    }
  })

  return (
    <ListaArquivos
      itens={itens}
      tipos={['imagem', 'pdf', 'link', 'outro']}
      colunaExtra="Card / Sprint"
      placeholderBusca="Buscar por nome ou card…"
      filtroExtra={{
        ativo: !!filterSprint,
        aceita: item => !filterSprint || sprintDe.get(item.id) === filterSprint,
        elemento: (
          <Select
            ariaLabel="Filtrar por sprint"
            className="sm:w-52"
            value={filterSprint}
            onChange={setFilterSprint}
            placeholder="Todas as sprints"
            options={[{ value: '', label: 'Todas as sprints' }, ...sprints.map(s => ({ value: s.id, label: s.name }))]}
          />
        ),
      }}
    />
  )
}
