// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { lerImagemAssinatura, ASSINATURA_MAX_BYTES } from '@/lib/imagemAssinatura'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])

describe('lerImagemAssinatura', () => {
  it('aceita PNG e JPEG pelo conteúdo, com extensão e tipo do conteúdo', async () => {
    expect(await lerImagemAssinatura(new File([PNG], 'x.html', { type: 'text/html' }))).toMatchObject({ ext: 'png', contentType: 'image/png' })
    expect(await lerImagemAssinatura(new File([JPG], 'x', { type: '' }))).toMatchObject({ ext: 'jpg', contentType: 'image/jpeg' })
  })

  it('recusa HTML/SVG com type de imagem', async () => {
    expect(await lerImagemAssinatura(new File(['<html><script>alert(1)</script>'], 'a.png', { type: 'image/png' }))).toEqual({ error: 'Apenas PNG e JPEG são aceitos' })
    expect(await lerImagemAssinatura(new File(['<svg onload="x"/>'], 'a.svg', { type: 'image/png' }))).toEqual({ error: 'Apenas PNG e JPEG são aceitos' })
  })

  it('recusa vazio e acima de 2 MB', async () => {
    expect(await lerImagemAssinatura(null)).toEqual({ error: 'Arquivo inválido' })
    expect(await lerImagemAssinatura(new File([new Uint8Array(ASSINATURA_MAX_BYTES + 1)], 'g.png', { type: 'image/png' }))).toEqual({ error: 'Arquivo excede 2 MB' })
  })
})
