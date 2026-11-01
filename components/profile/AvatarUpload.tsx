'use client'

import { useState, useEffect } from 'react'
import GlassImageUpload from '@/components/ui/GlassImageUpload'

interface AvatarUploadProps {
  name: string
  avatarUrl?: string | null
  onChange?: (url: string) => void
  disabled?: boolean
}

export default function AvatarUpload({ name, avatarUrl: initialAvatarUrl, onChange, disabled }: AvatarUploadProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  // Mantém o preenchimento assíncrono dos formulários que compartilham este campo.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setAvatarUrl(initialAvatarUrl) }, [initialAvatarUrl])

  return <GlassImageUpload context="profile" nome={name} url={avatarUrl ?? ''} disabled={disabled}
    onChange={url => { setAvatarUrl(url); onChange?.(url) }} />
}
