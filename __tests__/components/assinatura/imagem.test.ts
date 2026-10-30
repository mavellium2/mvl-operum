import { describe, expect, it, vi } from 'vitest'
import { exportSignature, MAX_INPUT_BYTES, validateDimensions, validateFile, validateImageHeader } from '@/components/assinatura/imagem'

describe('preparação de assinatura', () => {
  it('aceita somente arquivos de imagem e PDF limitados', () => {
    expect(() => validateFile(new File(['pdf'], 'a.pdf', { type: 'application/pdf' }))).not.toThrow()
    expect(() => validateFile(new File([], 'vazio.png', { type: 'image/png' }))).toThrow()
    expect(() => validateFile(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }))).toThrow()
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: MAX_INPUT_BYTES + 1 })
    expect(() => validateFile(file)).toThrow('10 MB')
  })
  it('rejeita dimensões excessivas, vazias e inválidas', () => {
    for (const [w, h] of [[0, 5], [NaN, 5], [5000, 5000], [17000, 1]]) expect(() => validateDimensions(w, h)).toThrow()
    expect(() => validateDimensions(2000, 2000)).not.toThrow()
  })
  it('valida dimensões PNG antes de decodificar e não confia no MIME', () => {
    const bytes = new Uint8Array(24), view = new DataView(bytes.buffer)
    view.setUint32(0, 0x89504e47); view.setUint32(4, 0x0d0a1a0a)
    view.setUint32(16, 800); view.setUint32(20, 200)
    expect(() => validateImageHeader(bytes, 'image/png')).not.toThrow()
    expect(() => validateImageHeader(bytes, 'image/jpeg')).toThrow()
    view.setUint32(16, 100000)
    expect(() => validateImageHeader(bytes, 'image/png')).toThrow()
  })
  it('valida JPEG e rejeita segmentos truncados', () => {
    const bytes = new Uint8Array([255, 216, 255, 192, 0, 8, 8, 0, 100, 1, 44, 0])
    expect(() => validateImageHeader(bytes, 'image/jpeg')).not.toThrow()
    expect(() => validateImageHeader(bytes.slice(0, 9), 'image/jpeg')).toThrow()
  })
  function canvas(data: number[], size = 10) {
    return { width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data }) }), toBlob: vi.fn(cb => cb(new Blob([new Uint8Array(size)], { type: 'image/png' }))) } as unknown as HTMLCanvasElement
  }
  it('impede salvar transparência e área branca vazia', async () => {
    await expect(exportSignature(canvas([0, 0, 0, 0]))).rejects.toThrow('vazia')
    await expect(exportSignature(canvas([255, 255, 255, 255]))).rejects.toThrow('vazia')
  })
  it('exporta somente PNG e preserva o limite de 2MB do servidor', async () => {
    const file = await exportSignature(canvas([0, 0, 0, 255]))
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('assinatura.png')
    await expect(exportSignature(canvas([0, 0, 0, 255], 2 * 1024 * 1024 + 1))).rejects.toThrow('2 MB')
  })
})
