'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import './GlassButton.css'

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'icon' | 'custom'
}

const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton({ variant = 'default', className = '', type = 'button', children, ...props }, ref) {
  return <button ref={ref} type={type} className={`${variant === 'custom' ? 'glass-button-custom' : `glass-button glass-button--${variant}`} ${className}`} {...props}>{children}</button>
})
GlassButton.displayName = 'GlassButton'
export default GlassButton
