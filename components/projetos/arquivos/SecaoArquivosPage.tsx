import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { canProjectPermission } from '@/services/projectAccess'
import { listarArquivos } from '@/services/arquivosProjetoService'
import type { CategoriaArquivoProjeto } from '@/lib/arquivosProjeto'
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
    <div className="h-full overflow-y-auto">
      <ArquivosProjetoClient
        key={categoria}
        projetoId={projetoId}
        categoria={categoria}
        iniciais={arquivos.map(a => ({ id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, enviadoEm: a.createdAt.toISOString(), enviadoPor: a.enviadoPor?.name ?? null }))}
      />
    </div>
  )
}
