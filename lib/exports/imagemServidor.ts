import 'server-only'
import type { Paragraph } from 'docx'
import { isSafeStorageUrl } from '@/lib/storageUrl'
import { baixarImagem, paragrafoDaImagem } from './imagemDocx'

/**
 * Imagem para o Word gerado no servidor. Só baixa do storage do Operum
 * (MINIO_PUBLIC_URL), para a exportação não buscar URLs arbitrárias (SSRF).
 * Falha (fora do storage, indisponível, formato não suportado) vira "sem imagem".
 */
export async function imagemDoStorage(url: string | null | undefined, caixa: { maxW: number; maxH: number; centro?: boolean }): Promise<Paragraph[]> {
  if (!url || !isSafeStorageUrl(url)) return []
  const bytes = await baixarImagem(url, { redirect: 'error' })
  return bytes ? paragrafoDaImagem(bytes, caixa) : []
}
