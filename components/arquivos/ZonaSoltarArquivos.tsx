'use client'

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { ArrowUp, FolderUp } from 'lucide-react'
import './ZonaSoltarArquivos.css'

const temArquivos = (e: DragEvent | globalThis.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * Área que recebe arquivos arrastados do computador (como no Google Drive):
 * ao arrastar por cima, contorna a área e mostra a nuvem com "Solte os
 * arquivos…"; ao soltar, entrega a lista em `onSoltar`. Desativada, só
 * renderiza o conteúdo.
 */
export default function ZonaSoltarArquivos({ ativa, destino, onSoltar, children, className = '' }: {
  ativa: boolean
  /** Nome do lugar que recebe os arquivos (ex.: "Fotos e Vídeos"). */
  destino: string
  onSoltar: (arquivos: FileList) => void
  children: ReactNode
  className?: string
}) {
  const zona = useRef<HTMLDivElement>(null)
  // dragenter/dragleave disparam a cada filho: o contador evita piscar.
  const profundidade = useRef(0)
  const [arrastando, setArrastando] = useState(false)
  const [aviso, setAviso] = useState<{ left: number; bottom: number } | null>(null)

  // Soltar fora da área não deve abrir o arquivo no navegador e tirar a pessoa do Operum.
  useEffect(() => {
    if (!ativa) return
    const bloquear = (e: globalThis.DragEvent) => { if (temArquivos(e)) e.preventDefault() }
    window.addEventListener('dragover', bloquear)
    window.addEventListener('drop', bloquear)
    return () => { window.removeEventListener('dragover', bloquear); window.removeEventListener('drop', bloquear) }
  }, [ativa])

  function posicionarAviso() {
    const r = zona.current?.getBoundingClientRect()
    if (!r) return
    // O aviso fica no rodapé visível da área, mesmo com a lista rolando.
    setAviso({ left: r.left + r.width / 2, bottom: Math.max(16, window.innerHeight - Math.min(r.bottom, window.innerHeight) + 24) })
  }

  function terminar() { profundidade.current = 0; setArrastando(false) }

  if (!ativa) return <div className={className}>{children}</div>

  return (
    <div ref={zona} className={`zona-soltar relative ${className}`} data-arrastando={arrastando || undefined}
      onDragEnter={e => {
        if (!temArquivos(e)) return
        e.preventDefault()
        profundidade.current += 1
        if (!arrastando) { posicionarAviso(); setArrastando(true) }
      }}
      onDragOver={e => { if (temArquivos(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
      onDragLeave={e => {
        if (!temArquivos(e)) return
        profundidade.current = Math.max(0, profundidade.current - 1)
        if (profundidade.current === 0) setArrastando(false)
      }}
      onDrop={e => {
        if (!temArquivos(e)) return
        e.preventDefault()
        terminar()
        if (e.dataTransfer.files.length) onSoltar(e.dataTransfer.files)
      }}>
      {children}
      {arrastando && <>
        <div className="zona-soltar__contorno pointer-events-none absolute inset-0 rounded-2xl" aria-hidden="true" />
        {aviso && (
          <div className="zona-soltar__aviso pointer-events-none fixed z-[90] flex -translate-x-1/2 flex-col items-center" style={{ left: aviso.left, bottom: aviso.bottom }} role="status">
            <span className="zona-soltar__nuvem relative flex items-center justify-center" aria-hidden="true">
              <svg viewBox="0 0 64 44" className="h-14 w-20"><path fill="currentColor" d="M51.6 17.3A20 20 0 0 0 14.2 11 15.9 15.9 0 0 0 16 42.7h34.4a12.7 12.7 0 0 0 1.2-25.4Z" /></svg>
              <ArrowUp className="zona-soltar__seta absolute h-6 w-6" strokeWidth={3} />
            </span>
            <span className="zona-soltar__pilula -mt-1 rounded-[22px] px-6 py-3 text-center text-sm">
              Solte os arquivos para enviar em
              <span className="mt-1 flex items-center justify-center gap-1.5 font-semibold"><FolderUp className="h-4 w-4" aria-hidden="true" />{destino}</span>
            </span>
          </div>
        )}
      </>}
    </div>
  )
}
