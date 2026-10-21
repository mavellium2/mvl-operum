'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
import { alturaUtilDaPaginaMm } from '@/lib/printPageStyle'

interface Props {
  children: React.ReactNode
  /** Mesmas opções do printPageStyle do documento. */
  landscape?: boolean
  marginTopMm?: number
}

/** Quantas páginas a folha ocupa; folga de 0,5 mm contra arredondamento de px. */
export function contarPaginas(alturaMm: number, utilMm: number): number {
  if (!(utilMm > 0) || !(alturaMm > 0)) return 1
  return Math.max(1, Math.ceil((alturaMm - 0.5) / utilMm))
}

/**
 * Prévia paginada (cards "Documentos: separar visualmente as páginas na prévia"
 * e "mostrar numeração das páginas antes do download"). Envolve a folha
 * (`data-print-sheet`), usa a mesma altura útil da impressão e desenha, sem
 * cobrir o conteúdo, a linha onde cada folha termina e a numeração
 * "Página X de Y" no canto inferior direito de cada página, como no PDF.
 */
export default function PaginasDaPrevia({ children, landscape = false, marginTopMm = 0 }: Props) {
  const escopo = `previa-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const caixa = useRef<HTMLDivElement>(null)
  const regua = useRef<HTMLDivElement>(null)
  const [alturaMm, setAlturaMm] = useState(0)
  const util = alturaUtilDaPaginaMm({ landscape, marginTopMm })

  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => {
      const pxPorMm = (regua.current?.getBoundingClientRect().height ?? 0) / 100 || 96 / 25.4
      setAlturaMm(el.getBoundingClientRect().height / pxPorMm)
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const total = contarPaginas(alturaMm, util)
  const paginas = Array.from({ length: total }, (_, i) => i + 1)

  return (
    <div ref={caixa} className={`${escopo} relative`} data-testid="paginas-da-previa" data-paginas={total}>
      {/* Na tela, a folha tem a mesma altura mínima da impressão: 1 página = 1 página. */}
      <style>{`.${escopo} [data-print-sheet] { min-height: ${util}mm !important; }`}</style>
      <div ref={regua} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', height: '100mm', width: 0 }} />
      {children}
      {paginas.map(n => {
        const fim = Math.min(n * util, Math.max(alturaMm, util))
        return (
          <div key={n} aria-hidden="true" className="pointer-events-none print:hidden">
            {n < total && (
              <div
                data-testid="quebra-de-pagina"
                className="absolute inset-x-0 border-t-2 border-dashed border-slate-400"
                style={{ top: `${n * util}mm` }}
              />
            )}
            <span
              data-testid="numero-da-pagina"
              className="absolute rounded bg-white/90 px-1 text-slate-500"
              style={{ top: `calc(${fim}mm - 5mm)`, right: '2mm', font: '7pt Arial, Helvetica, sans-serif' }}
            >
              Página {n} de {total}
            </span>
          </div>
        )
      })}
      <p className="sr-only" aria-live="polite">{`Prévia com ${total} ${total === 1 ? 'página' : 'páginas'}`}</p>
    </div>
  )
}
