'use client'

import OperumButton from '@/components/ui/GlassButton'
interface TagBadgeProps {
  name: string
  color: string
  selected?: boolean
  onClick?: () => void
  className?: string
}

export function TagBadge({ name, color, selected, onClick, className = '' }: TagBadgeProps) {
  return (
    <OperumButton variant="default"
      type="button"
      aria-pressed={selected}
      data-selected={selected ? 'true' : undefined}
      onClick={onClick}
      // Se não tiver onClick, ele se comporta visualmente como uma tag estática, não um botão
      disabled={!onClick} 
      className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-[11px] font-bold text-white tracking-wide transition-all duration-200 
        ${onClick ? 'cursor-pointer' : 'cursor-default'}
        ${selected 
          ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-[#22272B] scale-105 shadow-sm' 
          : onClick ? 'opacity-85 hover:opacity-100 hover:scale-105' : 'opacity-90'
        } ${className}`}
      style={{ 
        backgroundColor: color,
        // Text shadow sutil garante que o texto branco seja legível mesmo se a cor da tag for amarela/clara
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        // Opcional: para garantir contraste, você pode adicionar uma borda sutil com a própria cor mais escura
        boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.1)` 
      }}
    >
      {name}
    </OperumButton>
  )
}