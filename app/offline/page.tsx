import type { Metadata } from 'next'
import TentarNovamente from './TentarNovamente'

export const metadata: Metadata = { title: 'Sem conexão' }

/**
 * Página pública e sem dados, guardada pelo service worker e mostrada quando
 * uma navegação falha por falta de rede (MOB-19).
 *
 * O worker a serve no endereço que falhou (ex.: /dashboard), então o AppShell
 * pode desenhar a casca daquela rota; a camada fixa cobre tudo.
 */
export default function OfflinePage() {
  return (
    <main className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- ícone estático já guardado no cache */}
        <img src="/icons/icon-192.png" alt="" width={56} height={56} className="mx-auto mb-5 rounded-2xl" />
        <h1 className="text-xl font-semibold text-slate-900">Sem conexão</h1>
        <p className="mt-2 text-base text-slate-600">
          Não foi possível abrir o Operum agora. Confira o Wi-Fi ou os dados móveis e tente de novo.
        </p>
        <TentarNovamente />
      </div>
    </main>
  )
}
