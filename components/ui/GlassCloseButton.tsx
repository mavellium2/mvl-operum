'use client'

import { X } from 'lucide-react'
import GlassButton, { type GlassButtonProps } from './GlassButton'

/** Fechar em vidro com o mesmo acabamento em painéis e modais. */
export default function GlassCloseButton({ label = 'Fechar', className = '', ...props }: Omit<GlassButtonProps, 'variant' | 'children'> & { label?: string }) {
  return <GlassButton variant="icon" aria-label={label} className={`glass-close-button ${className}`} {...props}><X className="h-4 w-4" strokeWidth={1.7} /></GlassButton>
}
