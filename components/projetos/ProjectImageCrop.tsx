'use client'

import GlassButton from '@/components/ui/GlassButton'

import { useEffect, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'

export default function ProjectImageCrop({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (file: File) => void }) {
  const image = useRef<HTMLImageElement>(null)
  const [url, setUrl] = useState('')
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState(1)
  const [x, setX] = useState(50)
  const [y, setY] = useState(50)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- cria e revoga o recurso de prévia local com o ciclo de vida do arquivo
  useEffect(() => { const source = URL.createObjectURL(file); setUrl(source); return () => URL.revokeObjectURL(source) }, [file])
  const minimum = Math.min(size.width, size.height) || 1
  const width = size.width / minimum * 240 * zoom
  const height = size.height / minimum * 240 * zoom
  function confirm() {
    if (!image.current || !size.width || busy) return
    setBusy(true)
    const canvas = document.createElement('canvas')
    canvas.width = 512; canvas.height = 512
    const context = canvas.getContext('2d')
    if (!context) { setError('Não foi possível preparar a imagem.'); setBusy(false); return }
    const source = minimum / zoom
    context.drawImage(image.current, (size.width - source) * x / 100, (size.height - source) * y / 100, source, source, 0, 0, 512, 512)
    canvas.toBlob(blob => {
      if (blob) onConfirm(new File([blob], 'projeto.png', { type: 'image/png' }))
      else { setError('Não foi possível preparar a imagem.'); setBusy(false) }
    }, 'image/png')
  }
  return <Modal isOpen onClose={() => !busy && onCancel()} title="Ajustar imagem do projeto" className="phase-delete-dialog">
    <p className="phase-delete-muted mb-4 text-sm">Ajuste o enquadramento antes de enviar.</p>
    <div className="relative mx-auto overflow-hidden rounded-2xl border border-white/20" style={{ width: 240, height: 240 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img ref={image} src={url} alt="Prévia do recorte" onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={() => setError('Este formato não pôde ser aberto. Use PNG, JPEG ou WebP.')} style={{ position: 'absolute', width, height, maxWidth: 'none', left: -(width - 240) * x / 100, top: -(height - 240) * y / 100 }} />}
    </div>
    <div className="mt-5 space-y-3 text-sm">
      <label className="block">Zoom<input aria-label="Zoom da imagem" className="mt-1 block w-full accent-violet-400" type="range" min="1" max="3" step="0.01" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label>
      <label className="block">Posição horizontal<input aria-label="Posição horizontal" className="mt-1 block w-full accent-violet-400" type="range" min="0" max="100" value={x} onChange={e => setX(Number(e.target.value))} /></label>
      <label className="block">Posição vertical<input aria-label="Posição vertical" className="mt-1 block w-full accent-violet-400" type="range" min="0" max="100" value={y} onChange={e => setY(Number(e.target.value))} /></label>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
    <div className="phase-delete-actions mt-5 flex justify-end gap-2 pb-2"><GlassButton variant="custom" type="button" className="phase-delete-confirm rounded-xl px-4 py-2" onClick={onCancel} disabled={busy}>Cancelar</GlassButton><GlassButton variant="custom" type="button" className="phase-delete-cancel rounded-xl px-4 py-2" onClick={confirm} disabled={!size.width || busy || !!error}>{busy ? 'Preparando…' : 'Usar imagem'}</GlassButton></div>
  </Modal>
}
