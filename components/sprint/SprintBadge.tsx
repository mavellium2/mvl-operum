interface SprintBadgeProps {
  name: string
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED'
}

const statusColors = {
  PLANNED: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-800',
}

export function SprintBadge({ name, status }: SprintBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status]}`}>
      {name}
    </span>
  )
}
