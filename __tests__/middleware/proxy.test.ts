// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Set SESSION_SECRET before any module is imported so verifyToken's HS256 branch runs
vi.hoisted(() => {
  process.env.SESSION_SECRET = 'test-session-secret-32-chars-minimum!'
})

// Mock jwtVerify so tests control whether the token is accepted or rejected
vi.mock('jose', async (importOriginal) => {
  const original = await importOriginal<typeof import('jose')>()
  return { ...original, jwtVerify: vi.fn() }
})

import { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'
import { proxy } from '@/proxy'

function makeRequest(path: string, cookie?: string) {
  const url = `http://localhost${path}`
  const headers: Record<string, string> = {}
  if (cookie) headers['cookie'] = cookie
  return new NextRequest(url, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('proxy middleware', () => {
  it('calls next() when token is valid', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { userId: 'u1' } } as never)

    const req = makeRequest('/dashboard', 'session=valid-token')
    const res = await proxy(req)

    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects to /login and deletes cookie when token is invalid', async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error('invalid token'))

    const req = makeRequest('/dashboard', 'session=bad-token')
    const res = await proxy(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toMatch(/session/)
  })

  it('redirects to /login immediately when no session cookie present', async () => {
    const req = makeRequest('/dashboard')
    const res = await proxy(req)

    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(jwtVerify).not.toHaveBeenCalled()
  })

  it('includes original path as ?from= param on redirect', async () => {
    const req = makeRequest('/sprints/s1')
    const res = await proxy(req)

    const location = res.headers.get('location') ?? ''
    expect(location).toContain('from=%2Fsprints%2Fs1')
  })

  describe('sessão por inatividade', () => {
    const MIN = 60_000

    function reqCom(path: string, lastSeen: number | null, headers: Record<string, string> = {}) {
      const cookie = ['session=valid-token', lastSeen !== null ? `last_seen=${lastSeen}` : ''].filter(Boolean).join('; ')
      return new NextRequest(`http://localhost${path}`, { headers: { cookie, ...headers } })
    }

    beforeEach(() => {
      vi.mocked(jwtVerify).mockResolvedValue({ payload: { userId: 'u1' } } as never)
    })

    it('mais de 30 min sem atividade: apaga a sessão e volta ao login com from e motivo', async () => {
      const res = await proxy(reqCom('/projetos/p1', Date.now() - 31 * MIN))
      expect(res.status).toBe(307)
      const location = res.headers.get('location') ?? ''
      expect(location).toContain('/login')
      expect(location).toContain('from=%2Fprojetos%2Fp1')
      expect(location).toContain('motivo=inatividade')
      expect(res.headers.get('set-cookie')).toMatch(/session=;/)
    })

    it('dentro do limite: segue e renova o last_seen', async () => {
      const res = await proxy(reqCom('/projetos/p1', Date.now() - 5 * MIN))
      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toMatch(/last_seen=\d+/)
    })

    it('sessão sem last_seen (anterior à mudança) não é derrubada; o cookie é criado', async () => {
      const res = await proxy(reqCom('/projetos', null))
      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toMatch(/last_seen=\d+/)
    })

    it('polling de notificações e prefetch não renovam a atividade', async () => {
      const lastSeen = Date.now() - 5 * MIN
      const polling = await proxy(reqCom('/api/notificacoes/count', lastSeen))
      expect(polling.status).toBe(200)
      expect(polling.headers.get('set-cookie') ?? '').not.toMatch(/last_seen/)

      const prefetch = await proxy(reqCom('/projetos', lastSeen, { 'next-router-prefetch': '1' }))
      expect(prefetch.headers.get('set-cookie') ?? '').not.toMatch(/last_seen/)
    })
  })
})

describe('proxy — volta para a autorização OAuth depois do login', () => {
  it('sem sessão em /oauth/autorizar, guarda caminho e query no from', async () => {
    const res = await proxy(makeRequest('/oauth/autorizar?client_id=https%3A%2F%2Fclaude.ai%2Fx&state=abc'))
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/login')
    expect(location.searchParams.get('from')).toBe('/oauth/autorizar?client_id=https%3A%2F%2Fclaude.ai%2Fx&state=abc')
  })

  it('nas demais páginas, continua só com o caminho', async () => {
    const res = await proxy(makeRequest('/projetos?aba=x'))
    expect(new URL(res.headers.get('location')!).searchParams.get('from')).toBe('/projetos')
  })
})
