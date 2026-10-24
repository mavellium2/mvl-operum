import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar'

function installFakeServiceWorker(opts: { controller: boolean; waiting?: { postMessage: ReturnType<typeof vi.fn> } | null }) {
  const registration = {
    waiting: opts.waiting ?? null,
    installing: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(true),
  }
  const container = {
    controller: opts.controller ? {} : null,
    register: vi.fn().mockResolvedValue(registration),
    getRegistrations: vi.fn().mockResolvedValue([registration]),
    addEventListener: vi.fn(),
  }
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })
  return { container, registration }
}

beforeEach(() => vi.unstubAllEnvs())
afterEach(() => {
  vi.unstubAllEnvs()
  // @ts-expect-error limpeza do stub
  delete navigator.serviceWorker
})

describe('ServiceWorkerRegistrar', () => {
  it('em desenvolvimento não registra e remove worker antigo', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const { container, registration } = installFakeServiceWorker({ controller: false })
    render(<ServiceWorkerRegistrar />)
    await waitFor(() => expect(registration.unregister).toHaveBeenCalled())
    expect(container.register).not.toHaveBeenCalled()
  })

  it('em produção registra /sw.js no escopo raiz, sem cache do script', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { container } = installFakeServiceWorker({ controller: false })
    render(<ServiceWorkerRegistrar />)
    await waitFor(() => expect(container.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' }))
  })

  it('primeira instalação não mostra aviso', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const waiting = { postMessage: vi.fn() }
    const { container } = installFakeServiceWorker({ controller: false, waiting })
    render(<ServiceWorkerRegistrar />)
    await waitFor(() => expect(container.register).toHaveBeenCalled())
    expect(screen.queryByText(/Nova versão/)).toBeNull()
  })

  it('versão nova esperando: só atualiza quando o usuário pede', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const waiting = { postMessage: vi.fn() }
    const { container } = installFakeServiceWorker({ controller: true, waiting })
    render(<ServiceWorkerRegistrar />)

    expect(await screen.findByText('Nova versão do Operum disponível.')).toBeTruthy()
    expect(waiting.postMessage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(container.addEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function), { once: true })
  })

  it('"Atualizar depois" esconde o aviso sem atualizar', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const waiting = { postMessage: vi.fn() }
    installFakeServiceWorker({ controller: true, waiting })
    render(<ServiceWorkerRegistrar />)

    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar depois' }))
    expect(screen.queryByText(/Nova versão/)).toBeNull()
    expect(waiting.postMessage).not.toHaveBeenCalled()
  })
})
