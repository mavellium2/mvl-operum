import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ default: {} }))
vi.mock('@/lib/minio', () => ({ assinador: {}, s3: {}, BUCKET: 'b' }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: vi.fn() }))

import { nomeNaChave } from '@/services/arquivosProjetoService'

describe('nome do arquivo na chave do storage', () => {
  it('pontos repetidos no nome viram um só (não confundem com "..")', () => {
    expect(nomeNaChave('Convite Programação v.f..png')).toBe('Convite-Programacao-v.f.png')
    expect(nomeNaChave('foto...final.jpg')).toBe('foto.final.jpg')
    expect(nomeNaChave('../../etc.png')).not.toContain('..')
  })
})
