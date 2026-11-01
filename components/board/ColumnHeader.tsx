'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useState } from 'react'
import InlineEdit from '@/components/ui/InlineEdit'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { ColumnSearchButton } from './ColumnSearch'
import ColumnColorButton from './ColumnColorButton'

interface ColumnHeaderProps {
  title: string
  /** Número exibido no selo; durante a busca, "encontrados/total". */
  cardCount: number | string
  onRename?: (title: string) => void
  /** Cor da coluna; null = aparência padrão. */
  color?: string | null
  onChangeColor?: (color: string | null) => void
  onDelete?: () => void
  searchOpen?: boolean
  onToggleSearch?: () => void
}

export default function ColumnHeader({ title, cardCount, onRename, color = null, onChangeColor, onDelete, searchOpen = false, onToggleSearch }: ColumnHeaderProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing border-b border-black/5 group"
        style={color ? { backgroundColor: `${color}26`, boxShadow: `inset 0 4px 0 ${color}` } : undefined}
      >

        {/* Lado Esquerdo: Título e Contador */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onRename ? (
            <InlineEdit
              value={title}
              onSave={onRename}
              className="font-bold text-gray-800 text-sm tracking-tight truncate hover:text-blue-600 transition-colors"
              inputClassName="font-bold text-gray-800 text-sm w-40 bg-white/50 rounded px-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          ) : (
            <span className="font-bold text-gray-800 text-sm tracking-tight truncate">{title}</span>
          )}
          <span className="bg-gray-200/50 backdrop-blur-sm text-gray-600 text-[10px] font-bold rounded-md px-1.5 py-0.5 min-w-[20px] text-center shadow-sm border border-black/5 shrink-0">
            {cardCount}
          </span>
        </div>

        {/* Lado Direito: Busca e Lixeira (apenas quando onDelete disponível) */}
        <div className="flex items-center gap-0.5 shrink-0">
        {onToggleSearch && (
          <ColumnSearchButton columnTitle={title} open={searchOpen} onToggle={onToggleSearch} />
        )}
        {onChangeColor && (
          <ColumnColorButton columnTitle={title} value={color} onChange={onChangeColor} />
        )}
        {onDelete && (
          <OperumButton variant="custom" type="button"
            onClick={e => { e.stopPropagation(); setConfirmOpen(true) }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
            aria-label={`Excluir coluna ${title}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </OperumButton>
        )}
        </div>

      </div>

      {/* Modal de Confirmação */}
      {onDelete && (
        <ConfirmDialog
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={onDelete}
          title="Excluir Coluna"
          message={`Tem certeza que deseja excluir a coluna "${title}"? Todos os cards dentro dela também serão apagados!`}
        />
      )}
    </>
  )
}
