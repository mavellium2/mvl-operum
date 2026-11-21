import type { Metadata } from 'next'
import SecaoArquivosPage from '@/components/projetos/arquivos/SecaoArquivosPage'
import { SECOES_ARQUIVOS } from '@/lib/arquivosProjeto'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: SECOES_ARQUIVOS.PESQUISAS.titulo }

export default function Page({ params }: { params: Promise<{ projetoId: string }> }) {
  return <SecaoArquivosPage params={params} categoria="PESQUISAS" />
}
