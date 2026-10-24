'use client'

/** Recarrega o endereço que falhou (o worker serve a página offline no lugar dele). */
export default function TentarNovamente() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-base font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      Tentar novamente
    </button>
  )
}
