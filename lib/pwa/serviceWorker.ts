/**
 * Service worker do PWA (MOB-19), servido em /sw.js por app/sw.js/route.ts.
 *
 * O Operum é multi-tenant, com sessão por cookie: o worker NUNCA guarda HTML
 * autenticado, respostas de API, Server Actions nem anexos, para que um
 * aparelho compartilhado não mostre dados de outra pessoa ou instituição.
 * Ele só guarda:
 * - arquivos estáticos versionados (`/_next/static/*`, com hash no nome) e os
 *   ícones do app, servidos do cache primeiro;
 * - a página pública `/offline` (sem dados) e os estáticos que ela usa,
 *   mostrada quando uma navegação falha por falta de rede.
 *
 * `swMain` é serializada com `toString()` para dentro do script; por isso não
 * pode usar nada de fora dela (imports, constantes do módulo).
 */

export const OFFLINE_PATH = '/offline'

// Tipos mínimos do escopo do worker: o tsconfig do app não inclui a lib WebWorker.
interface SwEvent {
  waitUntil(promise: Promise<unknown>): void
}
interface SwFetchEvent extends SwEvent {
  request: Request
  respondWith(response: Promise<Response>): void
}
interface SwMessageEvent {
  data: unknown
}
export interface SwScope {
  location: { origin: string }
  caches: CacheStorage
  fetch: typeof fetch
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  addEventListener(type: 'install' | 'activate', listener: (event: SwEvent) => void): void
  addEventListener(type: 'fetch', listener: (event: SwFetchEvent) => void): void
  addEventListener(type: 'message', listener: (event: SwMessageEvent) => void): void
}

export function swMain(self: SwScope, version: string, offlinePath: string): void {
  const STATIC_CACHE = `operum-static-${version}`
  const OFFLINE_CACHE = `operum-offline-${version}`
  const KEEP = [STATIC_CACHE, OFFLINE_CACHE]
  // Teto de entradas no cache de estáticos: deploys sem troca de versão
  // acumulam chunks com hash novo.
  const MAX_STATIC_ENTRIES = 300

  function isCacheableStatic(url: URL): boolean {
    return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
  }

  async function trimStaticCache(cache: Cache): Promise<void> {
    const keys = await cache.keys()
    const excess = keys.length - MAX_STATIC_ENTRIES
    for (let i = 0; i < excess; i++) await cache.delete(keys[i])
  }

  async function precacheOffline(): Promise<void> {
    const cache = await self.caches.open(OFFLINE_CACHE)
    const response = await self.fetch(offlinePath, { cache: 'no-store', credentials: 'omit' })
    if (!response.ok) throw new Error(`offline page: HTTP ${response.status}`)
    const html = await response.clone().text()
    await cache.put(offlinePath, response)
    // CSS, JS e ícones da página offline, para ela abrir completa sem rede.
    const assets = Array.from(new Set(html.match(/\/(?:_next\/static|icons)\/[^"'\s)<>\\]+/g) ?? []))
    const staticCache = await self.caches.open(STATIC_CACHE)
    await Promise.all(assets.map(asset => staticCache.add(asset).catch(() => undefined)))
  }

  async function cacheFirst(request: Request): Promise<Response> {
    const cached = await self.caches.match(request)
    if (cached) return cached
    const response = await self.fetch(request)
    if (response.ok && response.type === 'basic') {
      const cache = await self.caches.open(STATIC_CACHE)
      await cache.put(request, response.clone())
      await trimStaticCache(cache)
    }
    return response
  }

  async function networkOrOffline(request: Request): Promise<Response> {
    try {
      return await self.fetch(request)
    } catch (error) {
      const offline = await self.caches.match(offlinePath, { cacheName: OFFLINE_CACHE })
      if (offline) return offline
      throw error
    }
  }

  self.addEventListener('install', event => {
    event.waitUntil(precacheOffline())
  })

  self.addEventListener('activate', event => {
    event.waitUntil((async () => {
      const names = await self.caches.keys()
      await Promise.all(
        names
          .filter(name => name.startsWith('operum-') && !KEEP.includes(name))
          .map(name => self.caches.delete(name)),
      )
      await self.clients.claim()
    })())
  })

  // A nova versão fica esperando até o usuário pedir para atualizar
  // (ServiceWorkerRegistrar), para não recarregar no meio de uma edição.
  self.addEventListener('message', event => {
    const data = event.data as { type?: string } | null
    if (data?.type === 'SKIP_WAITING') void self.skipWaiting()
  })

  self.addEventListener('fetch', event => {
    const { request } = event
    if (request.method !== 'GET') return
    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return

    if (request.mode === 'navigate') {
      // Páginas sempre da rede (sem cache de HTML autenticado); só a falta de
      // rede cai na página offline.
      event.respondWith(networkOrOffline(request))
      return
    }
    if (isCacheableStatic(url) && !request.headers.has('range')) {
      event.respondWith(cacheFirst(request))
    }
    // Todo o resto (APIs, RSC, Server Actions, anexos) segue direto para a rede.
  })
}

export function buildServiceWorkerScript(version: string): string {
  return `/* Operum ${version} */\n'use strict';\n(${swMain.toString()})(self, ${JSON.stringify(version)}, ${JSON.stringify(OFFLINE_PATH)});\n`
}
