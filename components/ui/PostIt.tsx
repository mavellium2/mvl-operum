import type { CSSProperties, ReactNode } from 'react'
import './PostIt.css'

export type PostItProps = {
  children?: ReactNode
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  foldSize?: CSSProperties['width']
  placeholder?: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

/** Cartão amarelo com canto dobrado, redimensionável sem perder o aspecto de post-it. */
export default function PostIt({
  children,
  width = 240,
  height = 180,
  foldSize = 24,
  placeholder = 'Escreva aqui...',
  className,
  style,
  ariaLabel,
}: PostItProps) {
  const classes = ['post-it', className].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      style={{ ...style, width, height, '--post-it-fold-size': typeof foldSize === 'number' ? `${foldSize}px` : foldSize } as CSSProperties}
      aria-label={ariaLabel}
    >
      <div className="post-it__face" aria-hidden="true" />
      <div className="post-it__fold" aria-hidden="true" />
      <div className="post-it__content">
        {children ?? <span className="post-it__placeholder">{placeholder}</span>}
      </div>
    </div>
  )
}
