import type { HTMLAttributes } from 'react'
import './Skeleton.css'

/** Decorative placeholder; the containing region supplies its loading label. */
export default function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} aria-hidden="true" className={`operum-skeleton ${className}`} />
}
