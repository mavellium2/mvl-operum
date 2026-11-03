import type { WbsLayoutOrientation } from '@/types/wbs'

/**
 * Ícones do menu Organizar desenhados pelo usuário (15/10), sem alterar a geometria.
 * O desenho da EAP em cada formato está em lib/wbsLayout.ts (ADR-047).
 */
const BASE = {
  viewBox: '0 0 32 32', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}
const CAIXA = 'var(--ap-input, #F3F4F6)'

function Icone({ size, children }: { size: number; children: React.ReactNode }) {
  return <svg {...BASE} width={size} height={size} aria-hidden="true" focusable="false">{children}</svg>
}

export function IconeOrganizar({ layout, size = 32 }: { layout: WbsLayoutOrientation; size?: number }) {
  switch (layout) {
    case 'DIREITA':
      return (
        <Icone size={size}>
          <path d="M9 8v18.5M9 16.5h5M9 26.5h5" />
          <rect x="3" y="3" width="12" height="5" rx="1.2" fill={CAIXA} />
          <rect x="14" y="14" width="14" height="5" rx="1.2" fill={CAIXA} />
          <rect x="14" y="24" width="14" height="5" rx="1.2" fill={CAIXA} />
        </Icone>
      )
    case 'ESQUERDA':
      return (
        <Icone size={size}>
          <path d="M23 8v18.5M23 16.5h-5M23 26.5h-5" />
          <rect x="17" y="3" width="12" height="5" rx="1.2" fill={CAIXA} />
          <rect x="4" y="14" width="14" height="5" rx="1.2" fill={CAIXA} />
          <rect x="4" y="24" width="14" height="5" rx="1.2" fill={CAIXA} />
        </Icone>
      )
    case 'HORIZONTAL':
      return (
        <Icone size={size}>
          <path d="M12 16h3M15 8.5v15M15 8.5h3M15 23.5h3" />
          <rect x="2" y="13.5" width="10" height="5" rx="1.2" fill={CAIXA} />
          <rect x="18" y="6" width="12" height="5" rx="1.2" fill={CAIXA} />
          <rect x="18" y="21" width="12" height="5" rx="1.2" fill={CAIXA} />
        </Icone>
      )
    default:
      return (
        <Icone size={size}>
          <path d="M16 9v4M8 13h16M8 13v3M24 13v3" />
          <rect x="10" y="4" width="12" height="5" rx="1.2" fill={CAIXA} />
          <rect x="2" y="16" width="12" height="5" rx="1.2" fill={CAIXA} />
          <rect x="18" y="16" width="12" height="5" rx="1.2" fill={CAIXA} />
        </Icone>
      )
  }
}

/** Formato da EAP inteira, na ordem do documento de 16/10 (Padrão, Esquerda, Direita, Horizontal). */
export const OPCOES_ORGANIZAR: { value: WbsLayoutOrientation; label: string }[] = [
  { value: 'LADO_A_LADO', label: 'Padrão' },
  { value: 'ESQUERDA', label: 'Esquerda' },
  { value: 'DIREITA', label: 'Direita' },
  { value: 'HORIZONTAL', label: 'Horizontal' },
]

/** Formato de uma fase: "Igual à EAP" é guardado como LADO_A_LADO (lib/wbsLayout.ts → formatoDaFase). */
export const OPCOES_FASE: { value: WbsLayoutOrientation; label: string }[] = [
  { value: 'LADO_A_LADO', label: 'Igual à EAP' },
  { value: 'ESQUERDA', label: 'Esquerda' },
  { value: 'DIREITA', label: 'Direita' },
]
