'use client'

import GlassImageUpload from '@/components/ui/GlassImageUpload'
import type { ComponentProps } from 'react'

export default function ProjetoLogoUpload(props: Omit<ComponentProps<typeof GlassImageUpload>, 'context'>) {
  return <GlassImageUpload {...props} />
}
