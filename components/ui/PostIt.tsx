import { useId, type CSSProperties, type ReactNode } from 'react'
import './PostIt.css'

export type PostItProps = {
  children?: ReactNode
  width?: CSSProperties['width']
  height?: CSSProperties['height']
  /** Tamanho fixo do canto dobrado. Sem ele, a dobra acompanha o tamanho do post-it. */
  foldSize?: CSSProperties['width']
  placeholder?: string
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

/**
 * Cartão amarelo com o canto inferior direito dobrado por cima da folha, como
 * um post-it: a aba aponta para dentro do cartão, em tom mais escuro, com
 * contorno e sombra. A dobra acompanha o tamanho do cartão (proporcional ao
 * lado menor) e é SVG, então não perde o aspecto ao redimensionar.
 */
export default function PostIt({
  children,
  width,
  height,
  foldSize,
  placeholder = 'Escreva aqui...',
  className,
  style,
  ariaLabel,
}: PostItProps) {
  const classes = ['post-it', className].filter(Boolean).join(' ')
  const gradiente = `post-it-dobra-${useId().replace(/:/g, '')}`

  return (
    <div
      className={classes}
      style={{ ...style, width: width ?? style?.width ?? 240, height: height ?? style?.height ?? 180, ...(foldSize !== undefined ? { '--post-it-fold-size': typeof foldSize === 'number' ? `${foldSize}px` : foldSize } : {}) } as CSSProperties}
      aria-label={ariaLabel}
    >
      <div className="post-it__face" aria-hidden="true" />
      <div className="post-it__content">
        {children ?? <span className="post-it__placeholder">{placeholder}</span>}
      </div>
      {/* Aba dobrada: o canto vai para dentro (vértice em cima à esquerda), com a borda levemente curva. */}
      <svg className="post-it__fold" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradiente} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#e4e4b6" />
            <stop offset="0.55" stopColor="#cfcfa4" />
            <stop offset="1" stopColor="#b9b98f" />
          </linearGradient>
        </defs>
        <path className="post-it__fold-sombra" d="M100 4 L6 4 Q14 52 4 100 Z" />
        <path d="M100 0 L4 4 Q12 50 0 100 Z" fill={`url(#${gradiente})`} stroke="var(--post-it-ink)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}
