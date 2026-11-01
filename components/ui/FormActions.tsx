'use client'

import type { HTMLAttributes } from 'react'
import './FormActions.css'

/** Ações no rodapé da área rolável, preservando o formulário e seu submit nativo. */
export default function FormActions({ as: Tag = 'div', compact = false, surface = 'glass', className = '', style, ...props }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'footer' | 'span'; compact?: boolean; surface?: 'glass' | 'none' }) {
  return <Tag {...props} style={surface === 'none' ? { ...style, background: 'transparent', boxShadow: 'none', backdropFilter: 'none', WebkitBackdropFilter: 'none', border: 0, transition: 'none' } : style} className={`form-actions ${compact ? 'form-actions--compact' : ''} ${className}`} />
}

/** Conteúdo rolável separado das ações, para formulários em painéis e modais. */
export function FormBody({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`form-body ${className}`} />
}
