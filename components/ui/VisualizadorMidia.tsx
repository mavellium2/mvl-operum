'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Film, ImageIcon, Loader2, Maximize, Minimize, Minus, Plus, ZoomIn } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import Tooltip from '@/components/ui/Tooltip'
import { useOverlay } from '@/hooks/useOverlay'
import './VisualizadorMidia.css'

export interface MidiaVisualizavel {
  id: string
  nome: string
  tipo: 'imagem' | 'video'
  /** URL que entrega o arquivo para exibição. */
  url: string
  /** URL de download (sem ela, o botão Baixar não aparece). */
  baixar?: string
  /** Texto pequeno ao lado do nome (ex.: tamanho). */
  detalhe?: string
}

const ZOOM_MIN = 1
const ZOOM_MAX = 5
const PASSO = 0.25
const limitar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))

/**
 * Visualizador de fotos e vídeos em tela cheia, dentro do Operum, no estilo do
 * Google Drive: barra com o nome no topo, ferramentas (baixar, tela cheia,
 * zoom) e setas laterais. Teclado: ←/→ navegam, +/−/0 controlam o zoom e Esc
 * fecha (o foco volta para onde estava).
 */
export default function VisualizadorMidia({ itens, indice, onIndice, onClose }: {
  itens: MidiaVisualizavel[]
  indice: number
  onIndice: (i: number) => void
  onClose: () => void
}) {
  const raiz = useRef<HTMLDivElement>(null)
  const [montado, setMontado] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal só depois de hidratar
  useEffect(() => { setMontado(true) }, [])
  const zIndex = useOverlay(raiz, onClose, montado)
  const [zoom, setZoom] = useState(1)
  const [telaCheia, setTelaCheia] = useState(false)
  const atual = itens[indice]
  const total = itens.length
  const temAnterior = indice > 0
  const temProximo = indice < total - 1
  const ehImagem = atual?.tipo === 'imagem'

  const irPara = useCallback((i: number) => { setZoom(1); onIndice(i) }, [onIndice])

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.closest?.('video')) return
      if (e.key === 'ArrowLeft' && temAnterior) { e.preventDefault(); irPara(indice - 1) }
      else if (e.key === 'ArrowRight' && temProximo) { e.preventDefault(); irPara(indice + 1) }
      else if (ehImagem && (e.key === '+' || e.key === '=')) { e.preventDefault(); setZoom(z => limitar(z + PASSO)) }
      else if (ehImagem && e.key === '-') { e.preventDefault(); setZoom(z => limitar(z - PASSO)) }
      else if (ehImagem && e.key === '0') { e.preventDefault(); setZoom(1) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [indice, temAnterior, temProximo, ehImagem, irPara])

  // Tela cheia do navegador: acompanha a saída pelo Esc do próprio navegador.
  useEffect(() => {
    const no = raiz.current
    const mudou = () => setTelaCheia(!!no && document.fullscreenElement === no)
    document.addEventListener('fullscreenchange', mudou)
    return () => {
      document.removeEventListener('fullscreenchange', mudou)
      if (no && document.fullscreenElement === no) void document.exitFullscreen().catch(() => {})
    }
  }, [montado])
  const alternarTelaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void raiz.current?.requestFullscreen?.().catch(() => {})
  }

  if (!montado || !atual) return null
  const IconeTipo = ehImagem ? ImageIcon : Film

  return createPortal(
    <div ref={raiz} role="dialog" aria-modal="true" aria-label={`Visualizar ${atual.nome}`} tabIndex={-1}
      style={{ zIndex }} className="visualizador-midia fixed inset-0 flex flex-col">
      {/* Topo: fechar, tipo e nome à esquerda; abrir fora à direita (como no Drive). */}
      <header className="flex shrink-0 items-center gap-3 px-3 pb-2 pt-3 sm:px-5">
        <Tooltip label="Fechar (Esc)">
          <GlassCloseButton label="Fechar visualização" onClick={onClose} autoFocus className="vm-icone vm-fechar" />
        </Tooltip>
        <span className="vm-tipo flex h-6 w-6 shrink-0 items-center justify-center rounded" aria-hidden="true"><IconeTipo className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base sm:text-lg" title={atual.nome}>{atual.nome}</p>
          {(total > 1 || atual.detalhe) && (
            <p className="vm-suave text-xs tabular-nums" aria-live="polite">
              {total > 1 ? `${indice + 1} de ${total}` : ''}{total > 1 && atual.detalhe ? ' · ' : ''}{atual.detalhe}
            </p>
          )}
        </div>
        <a href={atual.url} target="_blank" rel="noopener noreferrer" className="vm-botao-contorno hidden items-center gap-2 sm:inline-flex">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />Abrir em nova aba
        </a>
      </header>

      {/* Ferramentas em pílula. */}
      <div className="flex shrink-0 px-3 sm:px-5">
        <div role="toolbar" aria-label="Ferramentas do visualizador" className="vm-ferramentas flex items-center gap-1 rounded-full px-2 py-1">
          {atual.baixar && (
            <Tooltip label="Baixar">
              <a href={atual.baixar} download={atual.nome} aria-label={`Baixar ${atual.nome}`} className="vm-icone"><Download className="h-5 w-5" aria-hidden="true" /></a>
            </Tooltip>
          )}
          <Tooltip label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}>
            <GlassButton variant="custom" aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'} onClick={alternarTelaCheia} className="vm-icone pressionavel">
              {telaCheia ? <Minimize className="h-5 w-5" aria-hidden="true" /> : <Maximize className="h-5 w-5" aria-hidden="true" />}
            </GlassButton>
          </Tooltip>
          {ehImagem && <>
            <span className="vm-divisor mx-1 h-5 w-px" aria-hidden="true" />
            <Tooltip label="Diminuir zoom (−)">
              <GlassButton variant="custom" aria-label="Diminuir zoom" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom(z => limitar(z - PASSO))} className="vm-icone pressionavel"><Minus className="h-5 w-5" aria-hidden="true" /></GlassButton>
            </Tooltip>
            <Tooltip label="Voltar ao tamanho da tela (0)">
              <GlassButton variant="custom" aria-label={`Zoom ${Math.round(zoom * 100)}%, voltar ao tamanho da tela`} onClick={() => setZoom(1)} className="vm-icone vm-zoom pressionavel">
                {zoom === 1 ? <ZoomIn className="h-5 w-5" aria-hidden="true" /> : <span className="text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span>}
              </GlassButton>
            </Tooltip>
            <Tooltip label="Aumentar zoom (+)">
              <GlassButton variant="custom" aria-label="Aumentar zoom" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom(z => limitar(z + PASSO))} className="vm-icone pressionavel"><Plus className="h-5 w-5" aria-hidden="true" /></GlassButton>
            </Tooltip>
          </>}
        </div>
      </div>

      {/* Palco: clique no fundo (fora da mídia e dos controles) fecha, como no Drive. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 py-4 sm:px-20"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        {/* key: trocar de arquivo remonta a mídia (vídeo anterior para, zoom e carregamento reiniciam). */}
        <Midia key={atual.id} item={atual} zoom={zoom} onZoom={setZoom} />
        {/* O posicionamento fica num contêiner próprio: o Tooltip envolve o botão num <span relative>, que serviria de referência ao absolute e juntaria as duas setas no meio. */}
        {temAnterior && (
          <div className="vm-seta-posicao vm-seta-anterior absolute left-3 top-1/2 z-10 -translate-y-1/2 sm:left-6">
            <Tooltip label="Anterior (←)">
              <GlassButton variant="custom" aria-label="Anterior" onClick={() => irPara(indice - 1)} className="vm-seta pressionavel">
                <ChevronLeft className="h-6 w-6" aria-hidden="true" />
              </GlassButton>
            </Tooltip>
          </div>
        )}
        {temProximo && (
          <div className="vm-seta-posicao vm-seta-proximo absolute right-3 top-1/2 z-10 -translate-y-1/2 sm:right-6">
            <Tooltip label="Próximo (→)">
              <GlassButton variant="custom" aria-label="Próximo" onClick={() => irPara(indice + 1)} className="vm-seta pressionavel">
                <ChevronRight className="h-6 w-6" aria-hidden="true" />
              </GlassButton>
            </Tooltip>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Midia({ item, zoom, onZoom }: { item: MidiaVisualizavel; zoom: number; onZoom: (z: number) => void }) {
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  const [posicao, setPosicao] = useState({ x: 0, y: 0 })
  const arraste = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  // Voltar ao tamanho da tela recentraliza.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reage à mudança de zoom vinda da barra
  useEffect(() => { if (zoom === 1) setPosicao({ x: 0, y: 0 }) }, [zoom])

  if (estado === 'erro') {
    return (
      <div role="alert" className="vm-erro flex flex-col items-center gap-3 rounded-2xl px-6 py-5 text-center text-sm">
        <p>Não foi possível exibir este arquivo aqui.</p>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Abrir em nova aba</a>
      </div>
    )
  }

  const carregando = estado === 'carregando' && (
    <span className="vm-suave pointer-events-none absolute inset-0 flex items-center justify-center" aria-label="Carregando">
      <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    </span>
  )

  if (item.tipo === 'video') {
    return <>
      {carregando}
      <video src={item.url} controls autoPlay playsInline aria-label={item.nome}
        onLoadedData={() => setEstado('pronto')} onError={() => setEstado('erro')}
        className={`vm-conteudo max-h-full max-w-full ${estado === 'pronto' ? 'is-pronto' : ''}`} />
    </>
  }

  // Imagem: Ctrl + roda dá zoom; com zoom, arrastar move a imagem; duplo clique alterna 100%/200%.
  const soltar = (e: ReactPointerEvent) => { arraste.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId) }
  return <>
    {carregando}
    {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, servida por redirecionamento. */}
    <img src={item.url} alt={item.nome} draggable={false}
      onLoad={() => setEstado('pronto')} onError={() => setEstado('erro')}
      onWheel={e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); onZoom(limitar(zoom + (e.deltaY < 0 ? PASSO : -PASSO))) } }}
      onDoubleClick={() => onZoom(zoom === 1 ? 2 : 1)}
      onPointerDown={e => { if (zoom === 1) return; arraste.current = { x: posicao.x, y: posicao.y, px: e.clientX, py: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId) }}
      onPointerMove={e => { const a = arraste.current; if (a) setPosicao({ x: a.x + (e.clientX - a.px) / zoom, y: a.y + (e.clientY - a.py) / zoom }) }}
      onPointerUp={soltar} onPointerCancel={soltar}
      style={{ transform: `scale(${zoom}) translate(${posicao.x}px, ${posicao.y}px)` }}
      className={`vm-conteudo max-h-full max-w-full select-none object-contain ${zoom > 1 ? 'is-ampliada' : ''} ${estado === 'pronto' ? 'is-pronto' : ''}`} />
  </>
}
