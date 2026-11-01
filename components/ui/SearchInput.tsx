'use client'

import { forwardRef, type InputHTMLAttributes } from 'react'
import { Search } from 'lucide-react'
import { Input } from './Field'

/** Busca compartilhada, com o mesmo vidro e estados de interação dos demais campos. */
const SearchInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }>(function SearchInput({ label, className = '', ...props }, ref) {
  return <div className="relative">
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
    <Input {...props} ref={ref} type="search" aria-label={label} className={`w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm ${className}`} />
  </div>
})
export default SearchInput
