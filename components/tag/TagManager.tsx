'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useState, useTransition } from 'react'
import { TagBadge } from './TagBadge'
import { createTagAction } from '@/app/actions/tags'

interface Tag {
  id: string
  name: string
  color: string
}

interface TagManagerProps {
  tags: Tag[]
}

const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280']

export function TagManager({ tags: initialTags }: TagManagerProps) {
  const [tags, setTags] = useState(initialTags)
  const [newName, setNewName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0])
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(async () => {
      const result = await createTagAction({ name: newName.trim(), color: selectedColor })
      if (result?.tag) {
        setTags((prev) => [...prev, result.tag as Tag])
        setNewName('')
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-700">Tags</h3>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <TagBadge key={tag.id} name={tag.name} color={tag.color} />
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <OperumInput
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome da tag"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-900"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
        <div className="flex gap-1">
          {PRESET_COLORS.map((color) => (
            <OperumButton variant="custom"
              key={color}
              type="button"
              onClick={() => setSelectedColor(color)}
              className={`h-5 w-5 rounded-full ${selectedColor === color ? 'ring-2 ring-offset-1' : ''}`}
              style={{ backgroundColor: color }}
              aria-label={`Cor ${color}`}
            />
          ))}
        </div>
        <OperumButton variant="primary"
          type="button"
          onClick={handleCreate}
          disabled={isPending || !newName.trim()}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Criar
        </OperumButton>
      </div>
    </div>
  )
}
