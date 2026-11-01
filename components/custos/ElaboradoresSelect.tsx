'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface Opcao { userId: string; name: string }

interface Props {
  /** Título da tarefa, para o rótulo acessível. */
  tarefa: string
  value: string[]
  options: Opcao[]
  onChange: (ids: string[]) => void
}

/**
 * "Elaborado por" com várias pessoas (= responsáveis do card, ADR-044). Cada marca
 * ou desmarca entra no rascunho da planilha e é salva pelo autosave.
 * A lista usa posição fixa: a tabela rola na horizontal e cortaria um popover comum.
 */
export default function ElaboradoresSelect({ tarefa, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const nomes = value.map(id => options.find(o => o.userId === id)?.name).filter(Boolean) as string[]

  useEffect(() => {
    if (!open) return
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (!rootRef.current?.contains(alvo) && !panelRef.current?.contains(alvo)) setOpen(false)
    }
    const fechar = () => setOpen(false)
    document.addEventListener('mousedown', fora)
    window.addEventListener('resize', fechar)
    window.addEventListener('scroll', fechar, true)
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('resize', fechar)
      window.removeEventListener('scroll', fechar, true)
    }
  }, [open])

  function abrir() {
    const r = buttonRef.current?.getBoundingClientRect()
    setPos(r ? { top: r.bottom + 4, left: r.left } : null)
    setOpen(true)
  }

  function alternar(id: string) {
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  }

  return (
    <div ref={rootRef} className="w-full">
      <OperumButton variant="custom"
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : abrir())}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Elaborado por — ${tarefa}: ${nomes.length ? nomes.join(', ') : 'ninguém'}`}
        title={nomes.join(', ') || undefined}
        className="flex w-full min-w-[110px] max-w-[220px] items-center gap-1 rounded border border-blue-200 bg-white px-1.5 py-0.5 text-left text-xs focus:border-blue-500 focus:outline-none"
      >
        <span className="flex-1 truncate">{nomes.length ? nomes.join(', ') : '—'}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
      </OperumButton>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={`Elaborado por — ${tarefa}`}
          onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus() } }}
          style={pos ? { top: pos.top, left: pos.left } : undefined}
          className="fixed z-50 max-h-64 min-w-[12rem] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">Nenhum membro no projeto.</p>}
          {options.map(o => (
            <label key={o.userId} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-800 hover:bg-blue-50">
              <input
                type="checkbox"
                checked={value.includes(o.userId)}
                onChange={() => alternar(o.userId)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
              />
              {o.name}
            </label>
          ))}
          <p className="border-t border-gray-100 px-3 pt-1.5 text-[10px] text-gray-500">São os responsáveis do card da tarefa.</p>
        </div>
      )}
    </div>
  )
}
