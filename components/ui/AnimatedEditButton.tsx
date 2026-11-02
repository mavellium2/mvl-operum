'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import GlassButton from './GlassButton'
import './AnimatedEditButton.css'

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { label?: string }

/** Ação de edição compartilhada: vidro, lápis e resposta suave sem atrasar o clique. */
const AnimatedEditButton = forwardRef<HTMLButtonElement, Props>(function AnimatedEditButton({ label = 'Editar', className = '', ...props }, ref) {
  return <GlassButton ref={ref} variant="icon" title={label} aria-label={label} {...props} className={`animated-edit ${className}`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
      <path className="edit-stroke" d="M4 21h12" />
      <g className="edit-pencil"><path d="m5 16 11-11a2.12 2.12 0 0 1 3 3L8 19l-4 1 1-4Z" /><path d="m14.5 6.5 3 3M5 16l3 3" /></g>
      <path className="edit-spark" d="M5 4v4M3 6h4" />
    </svg>
  </GlassButton>
})
export default AnimatedEditButton
