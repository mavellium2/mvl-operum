import { describe, it, expect } from 'vitest'
import { nomeRenomeado } from '@/lib/arquivosProjeto'

describe('nomeRenomeado', () => {
  it('mantém a extensão quando o novo nome vem sem ela', () => {
    expect(nomeRenomeado('IMG_0001.JPG', 'Fachada da obra')).toBe('Fachada da obra.JPG')
  })
  it('respeita a extensão digitada', () => {
    expect(nomeRenomeado('video.mov', 'visita.mp4')).toBe('visita.mp4')
  })
  it('tira espaços e caracteres de controle', () => {
    expect(nomeRenomeado('a.png', '  nova\u0007 foto  ')).toBe('nova foto.png')
  })
  it('recusa nome vazio ou só a extensão', () => {
    expect(nomeRenomeado('a.png', '   ')).toBeNull()
    expect(nomeRenomeado('a.png', '.png')).toBeNull()
  })
  it('limita a 255 caracteres', () => {
    expect(nomeRenomeado('a.png', 'x'.repeat(300))).toHaveLength(255)
  })
})
