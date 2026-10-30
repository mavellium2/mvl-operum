'use client'

import Select from '@/components/ui/Select'
import { useId } from 'react'

interface User {
  id: string
  name: string
  email: string
}

interface UserSelectorProps {
  users: User[]
  value: string | null
  onChange: (userId: string | null) => void
  label?: string
}

export default function UserSelector({ users, value, onChange, label }: UserSelectorProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</label>}
      <Select
        id={id}
        ariaLabel={label ?? 'Responsável'}
        value={value}
        onChange={id => onChange(id || null)}
        placeholder="Nenhum responsável"
        options={[{ value: '', label: 'Nenhum responsável' }, ...users.map(u => ({ value: u.id, label: u.name, description: u.email }))]}
      />
    </div>
  )
}
