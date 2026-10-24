import type { Metadata } from 'next'
import ConfiguracoesNav from '@/components/configuracoes/ConfiguracoesNav'

export const metadata: Metadata = { title: { default: 'Configurações', template: '%s · Configurações | Operum' } }

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Configurações</h1>
        <div className="flex flex-col gap-6 md:flex-row md:gap-8">
          <ConfiguracoesNav />
          <div className="min-w-0 flex-1 space-y-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
