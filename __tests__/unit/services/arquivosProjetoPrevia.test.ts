// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const h = vi.hoisted(() => ({ objetos: new Map<string, Buffer>(), enviados: [] as string[], achar: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ default: { arquivoProjeto: { findFirst: h.achar }, project: { findFirst: vi.fn().mockResolvedValue({ id: 'p1' }) } } }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: vi.fn() }))
vi.mock('@/services/authz', () => ({ exigirPermissao: vi.fn() }))
vi.mock('@/lib/minio', () => ({
  assinador: {}, BUCKET: 'b',
  s3: {
    send: vi.fn(async (cmd: { constructor: { name: string }; input: { Key: string; Body?: Buffer } }) => {
      if (cmd.constructor.name === 'PutObjectCommand') { h.objetos.set(cmd.input.Key, cmd.input.Body!); h.enviados.push(cmd.input.Key); return {} }
      const corpo = h.objetos.get(cmd.input.Key)
      if (!corpo) throw Object.assign(new Error('não existe'), { name: 'NoSuchKey' })
      return { Body: { transformToByteArray: async () => new Uint8Array(corpo) } }
    }),
  },
}))

import { chaveDaPrevia, imagemParaPrevia } from '@/services/arquivosProjetoService'

const sessao = { tenantId: 't1', role: 'member', userId: 'u1' }

beforeEach(async () => {
  h.objetos.clear(); h.enviados.length = 0
  h.objetos.set('t1/p1/foto.png', await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#3366aa' } }).png().toBuffer())
  h.achar.mockResolvedValue({ tipo: 'image/png', chave: 't1/p1/foto.png' })
})

describe('miniatura de imagem', () => {
  it('reduz para 480 px em WebP, guarda no storage e reaproveita na próxima vez', async () => {
    const primeira = await imagemParaPrevia(sessao, 'p1', 'a1')
    expect(primeira?.tipo).toBe('image/webp')
    const meta = await sharp(primeira!.corpo).metadata()
    expect(meta.width).toBe(480)
    expect(primeira!.corpo.length).toBeLessThan(h.objetos.get('t1/p1/foto.png')!.length)
    expect(h.enviados).toEqual([chaveDaPrevia('t1/p1/foto.png')])

    const segunda = await imagemParaPrevia(sessao, 'p1', 'a1')
    expect(segunda?.corpo.equals(primeira!.corpo)).toBe(true)
    expect(h.enviados).toHaveLength(1)
  })

  it('imagem que o sharp não lê: envia o original', async () => {
    h.objetos.set('t1/p1/foto.png', Buffer.from('não é imagem'))
    const r = await imagemParaPrevia(sessao, 'p1', 'a1')
    expect(r?.tipo).toBe('image/png')
    expect(r?.corpo.toString()).toBe('não é imagem')
  })

  it('SVG e não imagens ficam fora', async () => {
    h.achar.mockResolvedValue({ tipo: 'image/svg+xml', chave: 'x.svg' })
    expect(await imagemParaPrevia(sessao, 'p1', 'a1')).toBeNull()
    h.achar.mockResolvedValue({ tipo: 'application/pdf', chave: 'x.pdf' })
    expect(await imagemParaPrevia(sessao, 'p1', 'a1')).toBeNull()
  })
})
