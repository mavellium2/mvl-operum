export const MAX_INPUT_BYTES = 10 * 1024 * 1024
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024
export const MAX_PIXELS = 16_000_000
export const MAX_PAGES = 50

export function validateFile(file: File) {
  if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type)) throw new Error('Selecione PNG, JPG ou PDF.')
  if (!file.size || file.size > MAX_INPUT_BYTES) throw new Error('O arquivo deve ter conteúdo e no máximo 10 MB.')
}
export function validateDimensions(width: number, height: number) {
  if (!Number.isFinite(width * height) || width < 1 || height < 1 || width * height > MAX_PIXELS || Math.max(width, height) > 16384) throw new Error('Imagem muito grande. Limite: 16 milhões de pixels e 16384 pixels por lado.')
}
export async function exportSignature(canvas: HTMLCanvasElement): Promise<File> {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Seu navegador não conseguiu preparar a assinatura.')
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  let visible = false
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 10 && Math.min(data[i], data[i + 1], data[i + 2]) < 245) { visible = true; break }
  }
  if (!visible) throw new Error('A assinatura está vazia. Desenhe ou recorte uma área com a assinatura.')
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Falha ao gerar PNG.')), 'image/png'))
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error('O recorte excede 2 MB. Selecione uma área menor.')
  return new File([blob], 'assinatura.png', { type: 'image/png' })
}

// Check dimensions before asking the browser to allocate a decoded bitmap.
export function validateImageHeader(bytes: Uint8Array, mime: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mime === 'image/png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a) {
    validateDimensions(view.getUint32(16), view.getUint32(20)); return
  }
  if (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break
      while (bytes[offset] === 255) offset++
      const marker = bytes[offset++]
      if (marker === 217 || marker === 218) break
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue
      if (offset + 2 > bytes.length) break
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) break
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
        validateDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3)); return
      }
      offset += length
    }
  }
  throw new Error('Imagem inválida ou formato não suportado.')
}
