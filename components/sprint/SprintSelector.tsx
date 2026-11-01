'use client'

import OperumButton from '@/components/ui/GlassButton'
interface Sprint {
  id: string
  name: string
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED'
}

interface SprintSelectorProps {
  sprints: Sprint[]
  selectedSprintId: string | null
  onSelect: (sprintId: string | null) => void
}

export function SprintSelector({ sprints, selectedSprintId, onSelect }: SprintSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <OperumButton variant="default"
        type="button"
        onClick={() => onSelect(null)}
        className={`rounded px-3 py-1.5 text-sm text-left hover:bg-gray-100 ${
          selectedSprintId === null ? 'bg-gray-100 font-medium' : ''
        }`}
      >
        Nenhum sprint
      </OperumButton>
      {sprints.map((sprint) => (
        <OperumButton variant="default"
          key={sprint.id}
          type="button"
          data-selected={selectedSprintId === sprint.id ? 'true' : undefined}
          onClick={() => onSelect(sprint.id)}
          className={`rounded px-3 py-1.5 text-sm text-left hover:bg-blue-50 ${
            selectedSprintId === sprint.id ? 'bg-blue-100 font-medium text-blue-700' : ''
          }`}
        >
          {sprint.name}
          <span className="ml-2 text-xs text-gray-500">({sprint.status})</span>
        </OperumButton>
      ))}
    </div>
  )
}
