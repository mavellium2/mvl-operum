'use client'

import Select from '@/components/ui/Select'
import { useCallback, useEffect, useRef, useState } from 'react'
import SignaturePad from 'signature_pad'
import ReactCrop, { type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import Modal from '@/components/ui/Modal'
import { exportSignature, MAX_PAGES, validateDimensions, validateFile, validateImageHeader } from './imagem'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFWorker, RenderTask } from 'pdfjs-dist'

const button = 'rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50'
type PdfResource = { task?: PDFDocumentLoadingTask; worker: PDFWorker; port: Worker }
async function disposePdf(resource: PdfResource | null) {
  if (!resource) return
  try { await resource.task?.destroy() } catch { /* A cancelled load may already be destroyed. */ }
  finally { resource.worker.destroy(); resource.port.terminate() }
}
const fullCrop: PercentCrop = { unit: '%', x: 0, y: 0, width: 100, height: 100 }

export default function SignatureEditor({ onClose, onSave }: { onClose: () => void; onSave: (file: File) => Promise<void> }) {
  const [mode, setMode] = useState<'draw' | 'upload'>('draw')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const bindCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas
    setCanvasReady(Boolean(canvas))
  }, [])
  const pad = useRef<SignaturePad | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const [source, setSource] = useState('')
  const [crop, setCrop] = useState<PercentCrop>(fullCrop)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const mounted = useRef(true)
  const resource = useRef<PdfResource | null>(null)
  const render = useRef<RenderTask | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // This is a request-generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      sequence.current++
      render.current?.cancel()
      void disposePdf(resource.current)
      resource.current = null
    }
  }, [])
  useEffect(() => {
    if (mode !== 'draw' || !canvasReady || !canvasRef.current) return
    const canvas = canvasRef.current
    const instance = new SignaturePad(canvas, { penColor: '#111827', minWidth: 1.2, maxWidth: 3 })
    pad.current = instance
    let previousWidth = 0
    const resize = () => {
      const width = canvas.getBoundingClientRect().width
      if (!width || width === previousWidth) return
      const strokes = instance.toData()
      const factor = previousWidth ? width / previousWidth : 1
      for (const stroke of strokes) for (const point of stroke.points) { point.x *= factor; point.y *= factor }
      const ratio = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(width / 3 * ratio)
      canvas.getContext('2d')?.scale(ratio, ratio)
      instance.clear(); instance.fromData(strokes)
      previousWidth = width
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => { observer.disconnect(); instance.off(); pad.current = null }
  }, [mode, canvasReady])
  useEffect(() => {
    if (!source.startsWith('blob:')) return
    return () => URL.revokeObjectURL(source)
  }, [source])

  async function showPage(doc: PDFDocumentProxy, number: number, id: number) {
    const pdfPage = await doc.getPage(number)
    if (id !== sequence.current) return
    const original = pdfPage.getViewport({ scale: 1 })
    validateDimensions(original.width, original.height)
    const viewport = pdfPage.getViewport({ scale: Math.min(2, 2000 / Math.max(original.width, original.height)) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    const task = pdfPage.render({ canvas, viewport })
    render.current = task
    await task.promise
    if (id !== sequence.current) return
    setSource(canvas.toDataURL('image/png')); setCrop(fullCrop)
    pdfPage.cleanup()
  }

  async function selectFile(file: File) {
    const id = ++sequence.current
    render.current?.cancel()
    setBusy(true); setError(''); setSource(''); setPdf(null)
    try {
      const previous = resource.current
      resource.current = null
      await disposePdf(previous)
      if (id !== sequence.current) return
      validateFile(file)
      if (id !== sequence.current) return
      if (file.type === 'application/pdf') {
        const pdfjs = await import('pdfjs-dist')
        if (id !== sequence.current) return
        const port = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
        const pdfWorker = pdfjs.PDFWorker.create({ port })
        resource.current = { worker: pdfWorker, port }
        const bytes = await file.arrayBuffer()
        if (id !== sequence.current) return
        const task = pdfjs.getDocument({ data: bytes, worker: pdfWorker, enableXfa: false, useWasm: false })
        resource.current.task = task
        const doc = await task.promise
        if (id !== sequence.current) return
        if (doc.numPages > MAX_PAGES) throw new Error('PDF deve ter no máximo 50 páginas.')
        setPdf(doc); setPage(1)
        await showPage(doc, 1, id)
      } else {
        validateImageHeader(new Uint8Array(await file.arrayBuffer()), file.type)
        if (id !== sequence.current) return
        const bitmap = await createImageBitmap(file)
        try { validateDimensions(bitmap.width, bitmap.height) } finally { bitmap.close() }
        if (id !== sequence.current) return
        setSource(URL.createObjectURL(file)); setCrop(fullCrop)
      }
    } catch (e) {
      if (id === sequence.current) { setPdf(null); setSource(''); setError(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.'); void disposePdf(resource.current); resource.current = null }
    } finally { if (id === sequence.current) setBusy(false) }
  }
  async function changePage(number: number) {
    if (!pdf) return
    const id = ++sequence.current
    render.current?.cancel(); setPage(number); setSource(''); setBusy(true); setError('')
    try { await showPage(pdf, number, id) }
    catch { if (id === sequence.current) setError('Não foi possível abrir essa página.') }
    finally { if (id === sequence.current) setBusy(false) }
  }
  async function save() {
    setSaving(true); setError('')
    try {
      let canvas: HTMLCanvasElement
      if (mode === 'draw') {
        if (!pad.current || pad.current.isEmpty() || !canvasRef.current) throw new Error('Desenhe sua assinatura antes de salvar.')
        canvas = canvasRef.current
      } else {
        const image = imageRef.current
        if (!image || !image.complete || !image.naturalWidth || !crop.width || !crop.height) throw new Error('Selecione e recorte a assinatura antes de salvar.')
        canvas = document.createElement('canvas')
        const x = Math.round(image.naturalWidth * crop.x / 100), y = Math.round(image.naturalHeight * crop.y / 100)
        const width = Math.min(image.naturalWidth - x, Math.round(image.naturalWidth * crop.width / 100))
        const height = Math.min(image.naturalHeight - y, Math.round(image.naturalHeight * crop.height / 100))
        validateDimensions(width, height)
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(image, x, y, width, height, 0, 0, width, height)
      }
      await onSave(await exportSignature(canvas))
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Falha ao salvar assinatura. Tente novamente.') }
    finally { if (mounted.current) setSaving(false) }
  }
  return <Modal isOpen onClose={() => { if (!saving) onClose() }} title="Assinatura manuscrita" maxWidth="max-w-2xl">
    <div className="space-y-4" aria-busy={busy || saving}>
      <div className="flex gap-2">
        <button className={button} disabled={saving} aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>Desenhar</button>
        <button className={button} disabled={saving} aria-pressed={mode === 'upload'} onClick={() => setMode('upload')}>Enviar arquivo</button>
      </div>
      {mode === 'draw' ? <>
        <p className="text-sm text-gray-600">Assine com mouse, dedo ou caneta. O fundo será transparente.</p>
        <canvas ref={bindCanvas} aria-label="Área para desenhar assinatura" className="w-full touch-none rounded-lg border border-gray-300 bg-white" style={{ aspectRatio: '3 / 1' }} />
        <div className="flex gap-2"><button className={button} disabled={saving} onClick={() => { const data = pad.current?.toData(); if (data) { data.pop(); pad.current?.fromData(data) } }}>Desfazer traço</button><button className={button} disabled={saving} onClick={() => pad.current?.clear()}>Limpar</button></div>
      </> : <>
        <label className="block text-sm">PNG, JPG ou PDF — até 10 MB; PDF até 50 páginas.
          <input className="mt-2 block w-full" type="file" accept="image/png,image/jpeg,application/pdf" disabled={saving} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void selectFile(file) }} />
        </label>
        {pdf && <div className="flex items-center gap-2 text-sm">Página <Select ariaLabel="Página do PDF" className="w-24" searchable={pdf.numPages > 10} value={String(page)} disabled={busy || saving} onChange={v => void changePage(Number(v))} options={Array.from({ length: pdf.numPages }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} /> de {pdf.numPages}</div>}
        {busy && <p role="status">Preparando prévia…</p>}
        {source && <><p className="text-sm">Arraste as bordas para selecionar apenas sua assinatura.</p><ReactCrop crop={crop} disabled={saving || busy} onChange={(_, percent) => setCrop(percent)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img ref={imageRef} src={source} alt="Prévia para recortar a assinatura" onError={() => { setSource(''); setError('Não foi possível exibir a imagem. Selecione outro arquivo.') }} style={{ maxHeight: 380, maxWidth: '100%' }} />
        </ReactCrop></>}
      </>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2"><button className={button} disabled={saving} onClick={onClose}>Cancelar</button><button className={`${button} bg-slate-900 text-white`} disabled={busy || saving || (mode === 'upload' && !source)} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar assinatura'}</button></div>
    </div>
  </Modal>
}
