'use client'

import { forwardRef } from 'react'
import { X } from 'lucide-react'
import GlassButton, { type GlassButtonProps } from './GlassButton'

type GlassCloseButtonProps = Omit<GlassButtonProps, 'variant' | 'children'> & { label?: string }

/** Fechar em vidro, preservando referências para foco em painéis e modais. */
const GlassCloseButton = forwardRef<HTMLButtonElement, GlassCloseButtonProps>(function GlassCloseButton({ label = 'Fechar', className = '', ...props }, ref) {
  return <GlassButton ref={ref} variant="icon" aria-label={label} className={`glass-close-button ${className}`} {...props}><X className="h-4 w-4" strokeWidth={1.7} /></GlassButton>
})
export default GlassCloseButton
