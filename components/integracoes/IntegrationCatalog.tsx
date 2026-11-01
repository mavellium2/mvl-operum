'use client'

import { Children, type ReactNode } from 'react'
import EmptyState from '@/components/ui/EmptyState'
import { matchesIntegrationSearch, useIntegrationSearch } from './IntegrationSearch'

export default function IntegrationCatalog({ searchTexts, children }: { searchTexts: string[]; children: ReactNode }) {
  const { query, setQuery } = useIntegrationSearch()
  const cards = Children.toArray(children).filter((_, index) => matchesIntegrationSearch(searchTexts[index] ?? '', query))
  return <>
    {query.trim() && <p role="status" className="text-xs text-gray-500">{cards.length} {cards.length === 1 ? 'aplicativo encontrado' : 'aplicativos encontrados'}</p>}
    {cards.length ? <div className="grid items-stretch gap-4 lg:grid-cols-2">{cards}</div> : <EmptyState heading="Nenhum aplicativo encontrado" subtext="Tente outro nome ou termo de busca." action={{ label: 'Limpar pesquisa', onClick: () => setQuery('') }} />}
  </>
}
