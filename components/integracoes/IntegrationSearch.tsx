'use client'

import { createContext, useContext } from 'react'

export const IntegrationSearchContext = createContext({ query: '', setQuery: (_query: string) => {} })
export const useIntegrationSearch = () => useContext(IntegrationSearchContext)
export { matchesSearch as matchesIntegrationSearch } from '@/lib/search'
