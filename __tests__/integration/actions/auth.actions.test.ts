// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/authClient', () => ({
  authServiceRegister: vi.fn(),
  authServiceLogin: vi.fn(),
  authServiceLogout: vi.fn(),
  authServiceRequestReset: vi.fn(),
  authServiceValidateCode: vi.fn(),
  authServiceResetPassword: vi.fn(),
}))
vi.mock('@/lib/session', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn().mockResolvedValue(null),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}))
vi.mock('@/lib/api-client', () => ({
  projectsApi: {
    getUserProjects: vi.fn(),
  },
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { signupAction, loginAction, logoutAction } from '@/app/actions/auth'
import { authServiceRegister, authServiceLogin, authServiceLogout } from '@/lib/authClient'
import { encrypt } from '@/lib/session'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { projectsApi } from '@/lib/api-client'

const mockRegister = authServiceRegister as ReturnType<typeof vi.fn>
const mockLogin = authServiceLogin as ReturnType<typeof vi.fn>
const _mockLogout = authServiceLogout as ReturnType<typeof vi.fn>
const mockEncrypt = encrypt as ReturnType<typeof vi.fn>
const mockCookies = cookies as ReturnType<typeof vi.fn>
const mockHeaders = headers as ReturnType<typeof vi.fn>
const mockRedirect = redirect as ReturnType<typeof vi.fn>

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(data).forEach(([k, v]) => fd.set(k, v))
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DEFAULT_TENANT_ID = 't1'
  mockHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue(null) })
  vi.mocked(projectsApi.getUserProjects).mockResolvedValue([])
})

describe('signupAction', () => {
  it('returns error state when registration fails', async () => {
    mockRegister.mockRejectedValue(new Error('Email já cadastrado'))
    const result = await signupAction(undefined, makeFormData({ name: 'Ana', email: 'ana@x.com', password: 'Test@1234' }))
    expect(result?.message).toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('sets session cookie and redirects on success', async () => {
    mockRegister.mockResolvedValue({ id: 'u1', name: 'Ana', email: 'ana@x.com', role: 'member', tenantId: 't1', tokenVersion: 0 })
    mockLogin.mockResolvedValue({ token: 'jwt-token' })
    mockEncrypt.mockResolvedValue('local-token-must-not-be-used')
    const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() }
    mockCookies.mockResolvedValue(cookieStore)

    await signupAction(undefined, makeFormData({ name: 'Ana', email: 'ana@x.com', password: 'Test@1234' }))
    expect(cookieStore.set).toHaveBeenCalledWith(
      'session',
      'jwt-token',
      expect.objectContaining({ httpOnly: true }),
    )
    expect(mockLogin).toHaveBeenCalledWith('ana@x.com', 'Test@1234')
    expect(mockEncrypt).not.toHaveBeenCalled()
    // Cookie de sessão do navegador: some ao fechar o navegador (inatividade no proxy).
    expect(cookieStore.set.mock.calls[0][2]).not.toHaveProperty('maxAge')
    expect(cookieStore.set).toHaveBeenCalledWith(
      'session',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    )
  })
})

describe('loginAction', () => {
  it('returns error state for invalid credentials', async () => {
    mockLogin.mockRejectedValue(new Error('Credenciais inválidas'))
    const result = await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'wrong' }))
    expect(result?.message).toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('sets session cookie on valid login', async () => {
    mockLogin.mockResolvedValue({
      token: 'jwt-token',
      forcePasswordChange: false,
      user: { role: 'member', id: 'u1' },
    })
    const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() }
    mockCookies.mockResolvedValue(cookieStore)

    await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'Test@1234' }))
    expect(cookieStore.set).toHaveBeenCalledWith(
      'session',
      'jwt-token',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }),
    )
    expect(cookieStore.set.mock.calls[0][2]).not.toHaveProperty('maxAge')
  })

  it('volta para a página de origem (from) depois do login; ignora destino externo', async () => {
    mockLogin.mockResolvedValue({ token: 'jwt-token', forcePasswordChange: false, user: { role: 'admin', id: 'u1' } })
    mockCookies.mockResolvedValue({ set: vi.fn(), delete: vi.fn(), get: vi.fn() })

    await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'Test@1234', from: '/projetos/p1/sprints/s1' }))
    expect(mockRedirect).toHaveBeenLastCalledWith('/projetos/p1/sprints/s1')

    await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'Test@1234', from: '//evil.com' }))
    expect(mockRedirect).toHaveBeenLastCalledWith('/projetos')
  })

  it('extrai o subdomain do host e o repassa a authServiceLogin', async () => {
    mockHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue('b.example.com') })
    mockLogin.mockResolvedValue({
      token: 'jwt-token',
      forcePasswordChange: false,
      user: { role: 'member', id: 'u1' },
    })
    const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() }
    mockCookies.mockResolvedValue(cookieStore)

    await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'Test@1234' }))

    expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'Test@1234', 'b', undefined)
  })

  it('host sem subdomínio (ex.: localhost) repassa subdomain undefined', async () => {
    mockHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue('localhost') })
    mockLogin.mockResolvedValue({
      token: 'jwt-token',
      forcePasswordChange: false,
      user: { role: 'member', id: 'u1' },
    })
    const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() }
    mockCookies.mockResolvedValue(cookieStore)

    await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'Test@1234' }))

    expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'Test@1234', undefined, undefined)
  })

  it('host com porta (ex.: localhost:3000, dev local) também repassa subdomain undefined', async () => {
    mockHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue('localhost:3000') })
    mockLogin.mockResolvedValue({
      token: 'jwt-token',
      forcePasswordChange: false,
      user: { role: 'member', id: 'u1' },
    })
    const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() }
    mockCookies.mockResolvedValue(cookieStore)

    await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'Test@1234' }))

    expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'Test@1234', undefined, undefined)
  })

  it('host com subdomínio e porta (ex.: b.example.com:3000) extrai só o subdomínio', async () => {
    mockHeaders.mockResolvedValue({ get: vi.fn().mockReturnValue('b.example.com:3000') })
    mockLogin.mockResolvedValue({
      token: 'jwt-token',
      forcePasswordChange: false,
      user: { role: 'member', id: 'u1' },
    })
    const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn() }
    mockCookies.mockResolvedValue(cookieStore)

    await loginAction(undefined, makeFormData({ email: 'a@b.com', password: 'Test@1234' }))

    expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'Test@1234', 'b', undefined)
  })
})

describe('logoutAction', () => {
  it('deletes session cookie', async () => {
    const cookieStore = { set: vi.fn(), delete: vi.fn(), get: vi.fn().mockReturnValue(undefined) }
    mockCookies.mockResolvedValue(cookieStore)
    await logoutAction()
    expect(cookieStore.delete).toHaveBeenCalledWith('session')
  })
})
