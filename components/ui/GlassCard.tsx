'use client'

import { type HTMLAttributes } from 'react'

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article'
  variant?: 'default' | 'floating'
}

/** Superfície de vidro compartilhada; as paletas vêm da aparência do editor. */
export default function GlassCard({ as: Tag = 'section', variant = 'default', className = '', children, ...props }: GlassCardProps) {
  return <Tag className={`${variant === 'floating' ? 'vidro-flutuante' : 'vidro'} rounded-[22px] ${className}`} {...props}>{children}</Tag>
}
