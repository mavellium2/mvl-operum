// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { swMain, buildServiceWorkerScript, OFFLINE_PATH, type SwScope } from '@/lib/pwa/serviceWorker'

const ORIGIN = 'https://app.operum.test'
const VERSION = '9.9.9'

/** CacheStorage em memória, só com o que o worker usa. */
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>()
  const keyOf = (req: RequestInfo | URL) =>
    new URL(typeof req === 'string' ? req : req instanceof URL ? req.href : req.url, ORIGIN).href

  function open(name: string) {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)!
    const cache = {
      async put(req: RequestInfo, res: Response) { store.set(keyOf(req), res) },
      async add(req: string) {
        const res = await scope.fetch(new URL(req, ORIGIN).href)
        if (!res.ok) throw new Error('add failed')
        store.set(keyOf(req), res)
      },
      async match(req: RequestInfo) { return store.get(keyOf(req))?.clone() },
      async keys() { return [...store.keys()].map(k => new Request(k)) },
      async delete(req: RequestInfo) { return store.delete(keyOf(req)) },
    }
    return cache
  }

  const caches = {
    async open(name: string) { return open(name) },
    async keys() { return [...stores.keys()] },
    async delete(name: string) { return stores.delete(name) },
    async has(name: string) { return stores.has(name) },
    async match(req: RequestInfo, opts?: { cacheName?: string }) {
      const names = opts?.cacheName ? [opts.cacheName] : [...stores.keys()]
      for (const name of names) {
        const hit = stores.get(name)?.get(keyOf(req))
        if (hit) return hit.clone()
      }
      return undefined
    },
  }
  return { caches: caches as unknown as CacheStorage, stores }
}

type Listener = (event: unknown) => void
let listeners: Record<string, Listener>
let scope: SwScope & { fetch: ReturnType<typeof vi.fn> }
let stores: Map<string, Map<string, Response>>

beforeEach(() => {
  listeners = {}
  const fake = fakeCaches()
  stores = fake.stores
  scope = {
    location: { origin: ORIGIN },
    caches: fake.caches,
    fetch: vi.fn(),
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn },
  } as unknown as SwScope & { fetch: ReturnType<typeof vi.fn> }
  swMain(scope, VERSION, OFFLINE_PATH)
})

/** Dispara um fetch e devolve a resposta do worker, ou undefined se ele não interceptou. */
async function dispatchFetch(init: { url: string; mode?: RequestMode; method?: string; headers?: Record<string, string> }) {
  const request = { url: new URL(init.url, ORIGIN).href, mode: init.mode ?? 'cors', method: init.method ?? 'GET', headers: new Headers(init.headers) }
  let responded: Promise<Response> | undefined
  listeners.fetch({ request, respondWith: (p: Promise<Response>) => { responded = p } })
  return responded
}

async function dispatchLifecycle(type: 'install' | 'activate') {
  let pending: Promise<unknown> = Promise.resolve()
  listeners[type]({ waitUntil: (p: Promise<unknown>) => { pending = p } })
  await pending
}

const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } })
const asset = (body: string) => Object.defineProperty(new Response(body), 'type', { value: 'basic' })

describe('service worker do PWA — instalação', () => {
  it('guarda a página offline e os estáticos e ícones que ela usa', async () => {
    scope.fetch.mockImplementation(async (url: string) => {
      if (url === OFFLINE_PATH) return html('<link href="/_next/static/css/a1.css"><script src="/_next/static/chunks/b2.js"></script><img src="/icons/icon-192.png">')
      return asset(`conteúdo de ${url}`)
    })
    await dispatchLifecycle('install')

    expect(scope.fetch).toHaveBeenCalledWith(OFFLINE_PATH, { cache: 'no-store', credentials: 'omit' })
    expect([...stores.get(`operum-offline-${VERSION}`)!.keys()]).toEqual([`${ORIGIN}/offline`])
    expect([...stores.get(`operum-static-${VERSION}`)!.keys()].sort()).toEqual([
      `${ORIGIN}/_next/static/chunks/b2.js`,
      `${ORIGIN}/_next/static/css/a1.css`,
      `${ORIGIN}/icons/icon-192.png`,
    ])
  })

  it('busca a página offline sem cookies (nunca guarda conteúdo de sessão)', async () => {
    scope.fetch.mockResolvedValue(html(''))
    await dispatchLifecycle('install')
    expect(scope.fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit' })
  })
})

describe('service worker do PWA — requisições', () => {
  it('navegação vem sempre da rede e não é guardada', async () => {
    scope.fetch.mockResolvedValue(html('<p>quadro da sprint</p>'))
    const res = await dispatchFetch({ url: '/projetos/abc/sprints/1', mode: 'navigate' })
    expect(await res!.text()).toBe('<p>quadro da sprint</p>')
    expect(stores.size).toBe(0)
  })

  it('navegação sem rede mostra a página offline', async () => {
    await stores.set(`operum-offline-${VERSION}`, new Map([[`${ORIGIN}/offline`, html('offline')]]))
    scope.fetch.mockRejectedValue(new TypeError('Failed to fetch'))
    const res = await dispatchFetch({ url: '/dashboard', mode: 'navigate' })
    expect(await res!.text()).toBe('offline')
  })

  it('erro HTTP na navegação passa adiante (não vira página offline)', async () => {
    scope.fetch.mockResolvedValue(new Response('erro', { status: 500 }))
    const res = await dispatchFetch({ url: '/dashboard', mode: 'navigate' })
    expect(res!.status).toBe(500)
  })

  it('estático versionado: guarda na primeira vez e depois serve do cache', async () => {
    scope.fetch.mockResolvedValue(asset('js'))
    const first = await dispatchFetch({ url: '/_next/static/chunks/c3.js' })
    expect(await first!.text()).toBe('js')
    const second = await dispatchFetch({ url: '/_next/static/chunks/c3.js' })
    expect(await second!.text()).toBe('js')
    expect(scope.fetch).toHaveBeenCalledTimes(1)
  })

  it('estático com erro não é guardado', async () => {
    scope.fetch.mockResolvedValue(new Response('nope', { status: 404 }))
    await dispatchFetch({ url: '/_next/static/chunks/x.js' })
    expect(stores.get(`operum-static-${VERSION}`)?.size ?? 0).toBe(0)
  })

  it.each([
    { url: '/api/search?q=x' },
    { url: '/api/me' },
    { url: '/api/uploads/arquivo.pdf' },
    { url: '/projetos/abc?_rsc=1' },
    { url: '/dashboard', method: 'POST' },
    { url: 'https://api.operum.adm.br/cards/1' },
    { url: '/_next/static/media/video.mp4', headers: { range: 'bytes=0-' } },
  ])('não intercepta $url ($method)', async init => {
    expect(await dispatchFetch(init)).toBeUndefined()
    expect(scope.fetch).not.toHaveBeenCalled()
  })
})

describe('service worker do PWA — atualização', () => {
  it('ao ativar, apaga só os caches do Operum de outras versões', async () => {
    for (const name of ['operum-static-1.0.0', 'operum-offline-1.0.0', `operum-static-${VERSION}`, 'outro-cache']) stores.set(name, new Map())
    await dispatchLifecycle('activate')
    expect([...stores.keys()].sort()).toEqual([`operum-static-${VERSION}`, 'outro-cache'])
    expect(scope.clients.claim).toHaveBeenCalled()
  })

  it('só pula a espera quando a página pede', () => {
    listeners.message({ data: { type: 'OUTRA' } })
    expect(scope.skipWaiting).not.toHaveBeenCalled()
    listeners.message({ data: { type: 'SKIP_WAITING' } })
    expect(scope.skipWaiting).toHaveBeenCalled()
  })
})

describe('buildServiceWorkerScript', () => {
  it('gera um script válido e diferente por versão', () => {
    const a = buildServiceWorkerScript('1.0.0')
    expect(() => new Function('self', a)).not.toThrow()
    expect(a).toContain('"1.0.0"')
    expect(buildServiceWorkerScript('1.0.1')).not.toBe(a)
  })

  it('o script roda sozinho e registra os eventos', () => {
    const events: string[] = []
    new Function('self', buildServiceWorkerScript('1.0.0'))({ addEventListener: (t: string) => events.push(t), location: { origin: ORIGIN } })
    expect(events.sort()).toEqual(['activate', 'fetch', 'install', 'message'])
  })
})
