'use client'

import { type HTMLAttributes } from 'react'
import './GlassCard.css'

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article'
  variant?: 'default' | 'floating'
  interactive?: boolean
}

/** Superfície de vidro compartilhada; as paletas vêm da aparência do editor. */
export default function GlassCard({ as: Tag = 'section', variant = 'default', interactive = false, className = '', children, ...props }: GlassCardProps) {
  return <Tag data-interactive={interactive || undefined} className={`glass-card ${variant === 'floating' ? 'vidro-flutuante' : 'vidro'} rounded-[22px] ${className}`} {...props}>{children}</Tag>
}
