'use client'

import Button from '@/components/ui/Button'

export default function StakeholdersError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h1 className="text-xl font-semibold text-gray-900">Não foi possível carregar as pessoas</h1>
        <p className="mt-2 mb-4 text-sm text-gray-600">Tente novamente. Se o problema continuar, volte ao projeto e abra Stakeholders outra vez.</p>
        <Button onClick={retry}>Tentar novamente</Button>
      </div>
    </div>
  )
}
