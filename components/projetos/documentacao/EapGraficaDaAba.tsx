'use client'

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { computeLayout, NODE_H } from '@/lib/wbsLayout'
import { measureNodeWidths } from '@/lib/wbsMedidas'
import { fitScale } from '@/lib/eapLayout'
import type { WbsNodeClient } from '@/types/wbs'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface ArvoreDaAba {
  rootId: string | null
  nodes: Record<string, WbsNodeClient>
}

interface Props {
  arvore: ArvoreDaAba
  /** Área disponível na página, em px. */
  larguraMax: number
  alturaMax: number
}

/**
 * EAP gráfica do documento desenhada como a aba EAP/WBS (card "Documento EAP:
 * reproduzir fielmente a aba EAP"): mesmo formato do menu Organizar (Padrão,
 * Esquerda, Direita, Horizontal e o formato próprio das fases), mesmas larguras
 * dos blocos, cores e bordas de cada nó, conectores e o texto "código título".
 * No documento a árvore aparece inteira (nós recolhidos na aba são expandidos).
 */
export default function EapGraficaDaAba({ arvore, larguraMax, alturaMax }: Props) {
  // Documento mostra a estrutura completa: nada fica escondido por estar recolhido na aba.
  const nodes = useMemo(
    () => Object.fromEntries(Object.entries(arvore.nodes).map(([id, n]) => [id, { ...n, collapsed: false }])),
    [arvore.nodes],
  )
  const [larguras, setLarguras] = useState<Record<string, number>>({})
  useIsomorphicLayoutEffect(() => { setLarguras(measureNodeWidths(nodes)) }, [nodes])
  const layout = useMemo(() => computeLayout(nodes, arvore.rootId, larguras, NODE_H, { raizEmPe: true }), [nodes, arvore.rootId, larguras])

  // Folga para a pílula/sombra que a aba desenha fora do bloco.
  const M = 12
  const W = layout.bounds.width + M * 2
  const H = layout.bounds.height + M * 2
  const escala = fitScale(W, H, larguraMax, alturaMax)

  return (
    <svg
      data-testid="eap-grafica-da-aba"
      viewBox={`${-M} ${-M} ${W} ${H}`}
      width={W * escala}
      height={H * escala}
      style={{ display: 'block', margin: '0 auto' }}
      role="tree"
      aria-label="EAP gráfica"
    >
      {layout.connectors.map(c => (
        <path key={`${c.fromId}-${c.toId}`} d={c.path} stroke="#cbd5e1" strokeWidth={1.5} fill="none" />
      ))}
      {Object.entries(layout.geometry).map(([id, g]) => {
        const node = nodes[id]
        if (!node) return null
        const s = node.style
        const cx = g.x + g.width / 2
        const cy = g.y + g.height / 2
        return (
          <g key={id} role="treeitem" aria-label={`${node.code} ${node.title}`.trim()}>
            <rect
              x={g.x} y={g.y} width={g.width} height={g.height}
              fill={s.backgroundColor} stroke={s.borderColor} strokeWidth={s.borderWidth} rx={s.borderRadius}
            />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={s.fontSize}
              fontWeight={500}
              fill={s.textColor}
              // Raiz em pé do Horizontal: lida de baixo para cima, como na aba.
              transform={g.vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
              style={{ fontFamily: 'inherit' }}
            >
              {`${node.code} ${node.title}`.trim()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
