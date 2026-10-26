'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export default function CopyConnectionValue({ value, label }: { value: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setStatus('copied')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <code className="min-w-0 flex-1 whitespace-pre-wrap break-all text-xs leading-6 text-gray-700">{value}</code>
        <button type="button" onClick={copy} aria-label={`Copiar ${label}`} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-gray-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {status === 'copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          {status === 'copied' ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p role="status" className="text-xs text-gray-500">
        {status === 'error' ? 'Não foi possível copiar. Selecione o texto acima e copie manualmente.' : status === 'copied' ? `${label} copiado.` : ''}
      </p>
    </div>
  )
}
