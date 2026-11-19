import type { Metadata } from 'next'
import SecaoArquivosPage from '@/components/projetos/arquivos/SecaoArquivosPage'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Apresentação e Vídeo' }

export default function Page({ params }: { params: Promise<{ projetoId: string }> }) {
  return <SecaoArquivosPage params={params} categoria="APRESENTACAO" />
}
