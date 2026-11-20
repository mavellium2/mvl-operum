import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { canProjectPermission } from '@/services/projectAccess'
import { listarArquivos } from '@/services/arquivosProjetoService'
import type { CategoriaArquivoProjeto } from '@/lib/arquivosProjeto'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import ArquivosProjetoClient from './ArquivosProjetoClient'

/** Página de uma seção de arquivos do projeto (carrega a lista no servidor). */
export default async function SecaoArquivosPage({ params, categoria }: { params: Promise<{ projetoId: string }>; categoria: CategoriaArquivoProjeto }) {
  const { projetoId } = await params
  const { tenantId, role, userId } = await verifySession()
  const sessao = { tenantId, role, userId }
  if (!(await canProjectPermission(sessao, projetoId, 'documentos:ver'))) notFound()
  let arquivos: Awaited<ReturnType<typeof listarArquivos>> = []
  try {
    arquivos = await listarArquivos(sessao, projetoId, categoria)
  } catch (err) {
    console.error('[SecaoArquivosPage] falha ao listar arquivos:', err instanceof Error ? err.message : err)
    notFound()
  }
  return (
    <div className="arq-pagina h-full overflow-y-auto">
      {/* Aparência do projeto (manhã/dia/tarde/noite), como nas demais telas do projeto. */}
      <ProjectAppearance enabled>
      <ArquivosProjetoClient
        key={categoria}
        projetoId={projetoId}
        categoria={categoria}
        iniciais={arquivos.map(a => ({ id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, enviadoEm: a.createdAt.toISOString(), enviadoPor: a.enviadoPor?.name ?? null, enviadoPorAvatar: a.enviadoPor?.avatarUrl ?? null, favorito: a.favorito }))}
      />
      </ProjectAppearance>
    </div>
  )
}
