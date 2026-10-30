'use client'

import Select from '@/components/ui/Select'

export type MemberOption = {
  id: string
  name: string
  setor: string | null
  signatureUrl?: string | null
}

interface Props {
  members: MemberOption[]
  value?: string | null
  onChange?: (member: MemberOption | null) => void
  placeholder?: string
  className?: string
  name?: string
}

export default function MemberSelect({
  members,
  value,
  onChange,
  placeholder = 'Selecionar membro',
  className,
  name,
}: Props) {
  const current = members.find(m => m.id === value)

  function handleChange(id: string) {
    const member = members.find(m => m.id === id) ?? null
    onChange?.(member)
  }

  return (
    <Select name={name} ariaLabel={placeholder} value={current?.id ?? ''} onChange={handleChange} placeholder={placeholder} className={className}
      options={[{ value: '', label: 'Nenhuma pessoa selecionada' }, ...members.map(m => ({ value: m.id, label: m.name, description: m.setor || undefined }))]} />
  )
}
