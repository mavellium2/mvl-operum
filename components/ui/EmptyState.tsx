'use client'

import OperumButton from '@/components/ui/GlassButton'
import Link from 'next/link'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  heading: string
  subtext?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  size?: 'sm' | 'md'
  className?: string
}

const DefaultIcon = () => (
  <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

export default function EmptyState({
  icon,
  heading,
  subtext,
  action,
  size = 'md',
  className = '',
}: EmptyStateProps) {
  const padding = size === 'sm' ? 'p-8' : 'p-12'

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 ${padding} text-center ${className}`}>
      {icon ?? <DefaultIcon />}
      <p className="text-gray-500 font-medium">{heading}</p>
      {subtext && <p className="text-sm text-gray-400 mt-1">{subtext}</p>}
      {action && (
        action.href ? (
          <Link href={action.href} className="mt-2 inline-block text-blue-600 text-sm hover:underline">
            {action.label}
          </Link>
        ) : (
          <OperumButton variant="default" type="button" onClick={action.onClick} className="mt-2 text-blue-600 text-sm hover:underline">
            {action.label}
          </OperumButton>
        )
      )}
    </div>
  )
}
