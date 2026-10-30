import { AlignmentType, ImageRun, Paragraph } from 'docx'

/**
 * Imagem (logo, assinatura) para os documentos Word, sem depender de APIs do
 * navegador: o tipo e o tamanho saem dos próprios bytes. Serve tanto para o Word
 * gerado no navegador quanto para o exportado pelo servidor.
 */

export type TipoImagem = 'png' | 'jpg' | 'gif'
export interface InfoImagem { tipo: TipoImagem; largura: number; altura: number }

/** Lê tipo e dimensões (px) do cabeçalho PNG, JPEG ou GIF; null para outros formatos. */
export function infoDaImagem(b: Uint8Array): InfoImagem | null {
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
  const u16 = (i: number) => (b[i] << 8) | b[i + 1]
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { tipo: 'png', largura: u32(16), altura: u32(20) }
  }
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { tipo: 'gif', largura: b[6] | (b[7] << 8), altura: b[8] | (b[9] << 8) }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const marcador = b[i + 1]
      // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC)
      if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
        return { tipo: 'jpg', altura: u16(i + 5), largura: u16(i + 7) }
      }
      i += 2 + u16(i + 2)
    }
  }
  return null
}

/** Imagem inline reduzida para caber na caixa, mantendo a proporção. */
export function runDaImagem(bytes: Uint8Array, caixa: { maxW: number; maxH: number }): ImageRun | undefined {
  const info = infoDaImagem(bytes)
  if (!info || !info.largura || !info.altura) return undefined
  const escala = Math.min(caixa.maxW / info.largura, caixa.maxH / info.altura, 1)
  return new ImageRun({ type: info.tipo, data: bytes, transformation: { width: Math.round(info.largura * escala), height: Math.round(info.altura * escala) } })
}
/** Parágrafo com a imagem reduzida para caber em maxW × maxH (px), mantendo a proporção. */
export function paragrafoDaImagem(bytes: Uint8Array, caixa: { maxW: number; maxH: number; centro?: boolean }): Paragraph[] {
  const run = runDaImagem(bytes, caixa)
  return run ? [new Paragraph({ alignment: caixa.centro ? AlignmentType.CENTER : undefined, children: [run] })] : []
}

const LIMITE_BYTES = 5e6

/** Baixa a imagem com limite de tempo e de tamanho; null se indisponível. */
export async function baixarImagem(url: string, init: RequestInit = {}): Promise<Uint8Array | null> {
  try {
    const resposta = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) })
    if (!resposta.ok || Number(resposta.headers.get('content-length')) > LIMITE_BYTES) return null
    const leitor = resposta.body?.getReader()
    if (!leitor) return null
    const partes: Uint8Array[] = []
    let tamanho = 0
    try {
      while (true) {
        const { done, value } = await leitor.read()
        if (done) break
        tamanho += value.length
        if (tamanho > LIMITE_BYTES) return null
        partes.push(value)
      }
    } finally { await leitor.cancel().catch(() => {}) }
    const bytes = new Uint8Array(tamanho)
    let pos = 0
    for (const p of partes) { bytes.set(p, pos); pos += p.length }
    return bytes
  } catch {
    return null
  }
}

/** Caixas usadas nos documentos (px a 96 dpi). */
export const CAIXA_LOGO_ATA = { maxW: 125, maxH: 72 }
export const CAIXA_ASSINATURA = { maxW: 150, maxH: 45, centro: true }

/** Assinatura inline no quadro inicial, separada da grade dos presentes. */
export const CAIXA_ASSINATURA_GERENTE = { maxW: 170, maxH: 30 }
