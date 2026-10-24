import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/notificacoes', () => ({}))

import { isSafeReference } from '@/components/notificacoes/NotificacaoList'

describe('isSafeReference — link "Ver" da notificação', () => {
  it.each(['/sprints/s1?card=c1', '/projetos/p1/documentacao', '/'])('aceita caminho do Operum %s', ref => {
    expect(isSafeReference(ref)).toBe(true)
  })

  it.each([
    '//evil.example/login',
    '/\\evil.example',
    '/\t/evil.example',
    'https://evil.example',
    'javascript:alert(1)',
    'cmabc123',
    '/a\nb',
  ])('recusa %s', ref => {
    expect(isSafeReference(ref)).toBe(false)
  })
})
