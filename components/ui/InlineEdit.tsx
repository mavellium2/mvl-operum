'use client'

import { Input as OperumInput } from '@/components/ui/Field'
import { useState, useRef, useEffect } from 'react'

interface InlineEditProps {
  value: string
  onSave: (value: string) => void
  className?: string
  inputClassName?: string
  placeholder?: string
}

export default function InlineEdit({ value, onSave, className = '', inputClassName = '', placeholder }: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.select()
    }
  }, [isEditing])

  const save = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onSave(trimmed)
    else setDraft(value)
    setIsEditing(false)
  }

  const cancel = () => {
    setDraft(value)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <OperumInput
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') cancel()
        }}
        className={`bg-white border border-blue-400 rounded px-2 py-0.5 outline-none ring-2 ring-blue-200 ${inputClassName}`}
        placeholder={placeholder}
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(value); setIsEditing(true) }}
      className={`cursor-pointer hover:bg-black/5 rounded px-1 py-0.5 transition-colors ${className}`}
      title="Clique para editar"
    >
      {value || <span className="text-gray-400 italic">{placeholder}</span>}
    </span>
  )
}
