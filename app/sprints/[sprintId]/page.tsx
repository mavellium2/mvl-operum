
import { getSprintBoardAction } from '@/app/actions/sprintBoard'
import { getCurrentUserAction } from '@/app/actions/users'
import SprintBoard from '@/components/sprint/SprintBoard'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { sprintsApi } from '@/lib/api-client'
import { findById } from '@/services/projectService'
import { sprintPath } from '@/lib/sprintPath'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ sprintId: string }>
  searchParams: Promise<{ card?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sprintId } = await params
  try {
    const sprint = (await sprintsApi.get(sprintId)) as { name?: string; projectId?: string }
    const projectId = sprint.projectId
    let projectName: string | undefined
    if (projectId) {
      const projeto = await findById(projectId)
      projectName = projeto?.name
    }
    return { title: projectName ? `${sprint.name} - ${projectName}` : (sprint.name ?? 'Sprint') }
  } catch {
    return { title: 'Sprint' }
  }
}

export default async function SprintPage({ params, searchParams }: Props) {
  const { sprintId } = await params
  const { card: initialCardId } = await searchParams

  // Rota legada: se a sprint pertence a um projeto, redireciona para a URL
  // canônica (/projetos/:id/sprints/:sprintId), onde o menu lateral do projeto
  // é renderizado e o board abre o card apontado por ?card=.
  // O redirect() fica FORA do try: ele lança NEXT_REDIRECT, que o catch engoliria.
  let projectId: string | undefined
  try {
    const sprint = (await sprintsApi.get(sprintId)) as { projectId?: string }
    projectId = sprint.projectId
  } catch {
    // segue o fluxo: o board resolve e reporta o erro
  }
  if (projectId) redirect(sprintPath(sprintId, projectId, initialCardId))

  const [result, currentUser] = await Promise.all([
    getSprintBoardAction(sprintId),
    getCurrentUserAction(),
  ])

  if ('error' in result) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500">{result.error}</p>
        <Link href="/projetos" className="text-blue-600 hover:underline text-sm">Voltar aos projetos</Link>
      </div>
    )
  }

  return (
    <SprintBoard
      sprint={{
        ...result.sprint,
        status: result.sprint.status as 'PLANNED' | 'ACTIVE' | 'COMPLETED',
      }}
      columns={result.columns}
      backlogCards={result.backlogCards}
      backlogColor={result.backlogColor}
      projectId={(result.sprint as { projectId?: string }).projectId ?? ''}
      users={result.users}
      inactiveUserIds={result.inactiveUserIds}
      tags={result.tags}
      currentUser={currentUser}
      initialCardId={initialCardId}
    />
  )
}
