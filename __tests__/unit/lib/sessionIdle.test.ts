import { describe, it, expect } from 'vitest'
import { idleMinutes, isIdleExpired, isPassiveRequest, destinoInterno } from '@/lib/sessionIdle'

describe('idleMinutes', () => {
  it('padrão 30; aceita valor configurado; ignora inválido', () => {
    expect(idleMinutes(undefined)).toBe(30)
    expect(idleMinutes('15')).toBe(15)
    expect(idleMinutes('0')).toBe(30)
    expect(idleMinutes('abc')).toBe(30)
  })
})

describe('isIdleExpired', () => {
  const limite = 30 * 60_000
  const agora = 1_000_000_000_000

  it('expira depois do limite sem atividade', () => {
    expect(isIdleExpired(String(agora - limite - 1), agora, limite)).toBe(true)
    expect(isIdleExpired(String(agora - limite + 1000), agora, limite)).toBe(false)
  })

  it('sem cookie ou com valor inválido não expira (sessões antigas)', () => {
    expect(isIdleExpired(undefined, agora, limite)).toBe(false)
    expect(isIdleExpired('lixo', agora, limite)).toBe(false)
  })
})

describe('isPassiveRequest', () => {
  it('polling de notificações e prefetch não contam como atividade', () => {
    expect(isPassiveRequest('/api/notificacoes/count', new Headers())).toBe(true)
    expect(isPassiveRequest('/projetos', new Headers({ 'next-router-prefetch': '1' }))).toBe(true)
    expect(isPassiveRequest('/projetos', new Headers({ 'sec-purpose': 'prefetch;prerender' }))).toBe(true)
    expect(isPassiveRequest('/projetos', new Headers())).toBe(false)
  })
})

describe('destinoInterno', () => {
  it('só aceita caminhos internos', () => {
    expect(destinoInterno('/projetos/p1/sprints/s1')).toBe('/projetos/p1/sprints/s1')
    expect(destinoInterno('//evil.com')).toBeNull()
    expect(destinoInterno('/\\evil.com')).toBeNull()
    expect(destinoInterno('https://evil.com')).toBeNull()
    expect(destinoInterno(null)).toBeNull()
  })
  it('recusa caracteres que o parser de URL descarta (open redirect com tab)', () => {
    expect(destinoInterno('/\t/evil.com')).toBeNull()
    expect(destinoInterno('/\n/evil.com')).toBeNull()
    expect(destinoInterno('/%09/evil.com')).toBe('/%09/evil.com')
    expect(destinoInterno('/projetos?x=1#y')).toBe('/projetos?x=1#y')
  })
})
