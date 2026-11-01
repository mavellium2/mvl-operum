'use client'

import GlassButton, { type GlassButtonProps } from './GlassButton'

interface ButtonProps extends Omit<GlassButtonProps, 'variant'> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
}

/** API legada compatível; o material e as interações vêm do GlassButton. */
export default function Button({ variant = 'primary', size = 'md', type = 'submit', className = '', ...props }: ButtonProps) {
  return <GlassButton {...props} type={type} variant={variant === 'secondary' ? 'default' : variant}
    className={`${size === 'sm' ? 'glass-button--small' : ''} ${className}`} />
}
