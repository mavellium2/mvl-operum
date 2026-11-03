import { verifySession } from '@/lib/dal'
import { redirect } from 'next/navigation'
import { getProjectsWhereManager } from '@/services/projectRoleService'
import prisma from '@/lib/prisma'
import { filesApi } from '@/lib/api-client'
import ArquivosClient from '@/components/arquivos/ArquivosClient'
import Link from 'next/link'
import type { Metadata } from 'next'
import { isLinkAttachment } from '@/lib/attachmentTypes'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Arquivos' }

/** Quantos ids de card vão em cada chamada a /files/by-cards (limite de URL). */
const CARDS_POR_LOTE = 100

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function listarAnexos(ids: string[]) {
  try {
    return await filesApi.listByCards(ids)
  } catch (error) {
    // O file-service pode responder 503 enquanto a conferência do card no
    // sprint-service ainda está iniciando. Repetir uma vez mantém a página útil.
    if (!(error instanceof Error && 'status' in error && error.status === 503)) throw error
    await new Promise(resolve => setTimeout(resolve, 250))
    return filesApi.listByCards(ids)
  }
}

export default async function ArquivosPage() {
  const { role, userId, tenantId } = await verifySession()
  if (role !== 'admin') {
    const manages = await getProjectsWhereManager(userId)
    if (manages.length === 0) redirect('/projetos')
  }

  // Os anexos ficam no file-service (schema `files`); o app só conhece os
  // cards. Antes a página lia public."Attachment", que não existe mais.
  const cards = await prisma.card.findMany({
    where: {
      deletedAt: null,
      OR: [{ project: { tenantId } }, { sprint: { project: { tenantId } } }],
    },
    select: {
      id: true,
      title: true,
      projectId: true,
      sprint: { select: { id: true, name: true, projectId: true } },
      responsibles: {
        select: { user: { select: { id: true, name: true } } },
        take: 1,
      },
    },
  })
  const cardById = new Map(cards.map(c => [c.id, c]))

  const lotes = await Promise.all(
    chunk(cards.map(c => c.id), CARDS_POR_LOTE).map(ids =>
      listarAnexos(ids)
        .then(items => ({ ok: true, items }))
        .catch(err => {
          console.warn('[arquivos] anexos indisponíveis', err instanceof Error && 'status' in err ? { status: err.status } : { type: 'network' })
          return { ok: false, items: [] as Awaited<ReturnType<typeof filesApi.listByCards>> }
        }),
    ),
  )
  const falhaAoCarregar = lotes.some(l => !l.ok)

  const data = lotes
    .flatMap(l => l.items)
    .filter(a => cardById.has(a.cardId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(a => {
      const card = cardById.get(a.cardId)!
      return {
        id: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: a.fileSize,
        fileSizeFormatted: isLinkAttachment(a.fileType) ? 'Link' : formatBytes(a.fileSize),
        filePath: a.filePath,
        isCover: a.isCover,
        uploadedAt: new Date(a.createdAt).toISOString(),
        card: {
          id: card.id,
          title: card.title,
          // Card do backlog não tem sprint.
          sprintId: card.sprint?.id ?? null,
          sprintName: card.sprint?.name ?? null,
          projectId: card.sprint?.projectId ?? card.projectId,
        },
        uploadedBy: card.responsibles[0]?.user?.name ?? null,
      }
    })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={role === 'admin' ? '/admin' : '/projetos'} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Arquivos</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {falhaAoCarregar && (
          <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Não foi possível carregar todos os anexos agora. A lista pode estar incompleta; tente recarregar a página.
          </p>
        )}
        <ArquivosClient initialAttachments={data} />
      </main>
    </div>
  )
}
