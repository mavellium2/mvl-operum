/**
 * Imagem de assinatura (perfil e equipe): só PNG ou JPEG de até 2 MB, conferidos
 * pelos primeiros bytes. O tipo e a extensão gravados vêm do conteúdo, nunca do
 * nome ou do `type` enviados pelo navegador (um ".html" com type "image/png"
 * ficaria publicado no storage).
 */
export const ASSINATURA_MAX_BYTES = 2 * 1024 * 1024

export async function lerImagemAssinatura(file: File | null): Promise<{ body: Buffer; ext: 'png' | 'jpg'; contentType: 'image/png' | 'image/jpeg' } | { error: string }> {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) return { error: 'Arquivo inválido' }
  if (file.size > ASSINATURA_MAX_BYTES) return { error: 'Arquivo excede 2 MB' }
  const body = Buffer.from(await file.arrayBuffer())
  const png = body.length > 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (png) return { body, ext: 'png', contentType: 'image/png' }
  const jpeg = body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
  if (jpeg) return { body, ext: 'jpg', contentType: 'image/jpeg' }
  return { error: 'Apenas PNG e JPEG são aceitos' }
}
