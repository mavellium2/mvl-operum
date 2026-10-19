export default function StakeholdersLoading() {
  return (
    <div role="status" aria-label="Carregando pessoas do projeto" className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <p className="text-base font-medium text-gray-700">Carregando pessoas do projeto…</p>
        <div aria-hidden="true" className="mt-6 space-y-4 motion-safe:animate-pulse">
          {[0, 1, 2, 3].map(row => <div key={row} className="h-20 rounded-lg bg-gray-100" />)}
        </div>
      </div>
    </div>
  )
}
