import { buildServiceWorkerScript } from '@/lib/pwa/serviceWorker'

/**
 * Service worker do PWA em /sw.js (escopo "/"). Gerado a partir da versão do
 * app: cada versão nova muda o script, o navegador instala o worker novo e o
 * aviso de atualização aparece (ServiceWorkerRegistrar).
 */
export function GET() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev'
  return new Response(buildServiceWorkerScript(version), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
