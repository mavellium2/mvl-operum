'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from 'lucide-react'
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

/**
 * Visualizador de fotos e vídeos em tela cheia, dentro do Operum (como o do
 * Drive): navega com as setas da tela ou do teclado, Esc fecha e o foco volta
 * para onde estava.
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
  const atual = itens[indice]
  const total = itens.length
  const temAnterior = indice > 0
  const temProximo = indice < total - 1

  // Setas do teclado (Esc e o foco preso ficam com o useOverlay).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.closest?.('video')) return
      if (e.key === 'ArrowLeft' && temAnterior) { e.preventDefault(); onIndice(indice - 1) }
      if (e.key === 'ArrowRight' && temProximo) { e.preventDefault(); onIndice(indice + 1) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [indice, temAnterior, temProximo, onIndice])

  if (!montado || !atual) return null

  return createPortal(
    <div ref={raiz} role="dialog" aria-modal="true" aria-label={`Visualizar ${atual.nome}`} tabIndex={-1}
      style={{ zIndex }} className="visualizador-midia fixed inset-0 flex flex-col">
      <header className="visualizador-midia__barra flex shrink-0 items-center gap-3 px-3 py-2 sm:px-4">
        <GlassCloseButton label="Fechar visualização" onClick={onClose} autoFocus />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={atual.nome}>{atual.nome}</p>
          <p className="visualizador-midia__suave text-xs tabular-nums" aria-live="polite">
            {total > 1 ? `${indice + 1} de ${total}` : ''}{total > 1 && atual.detalhe ? ' · ' : ''}{atual.detalhe}
          </p>
        </div>
        {atual.baixar && (
          <Tooltip label="Baixar">
            <a href={atual.baixar} download={atual.nome} aria-label={`Baixar ${atual.nome}`} className="visualizador-midia__acao"><Download className="h-4 w-4" aria-hidden="true" /></a>
          </Tooltip>
        )}
        <Tooltip label="Abrir em nova aba">
          <a href={atual.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${atual.nome} em nova aba`} className="visualizador-midia__acao"><ExternalLink className="h-4 w-4" aria-hidden="true" /></a>
        </Tooltip>
      </header>

      {/* Clique no fundo (fora da mídia e dos controles) fecha, como no Drive. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        {/* key: troca de arquivo remonta a mídia (vídeo anterior para, carregamento reinicia). */}
        <Midia key={atual.id} item={atual} />
        {temAnterior && (
          <GlassButton variant="custom" aria-label="Anterior" title="Anterior (←)" onClick={() => onIndice(indice - 1)}
            className="visualizador-midia__seta pressionavel absolute left-2 top-1/2 -translate-y-1/2 sm:left-4">
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </GlassButton>
        )}
        {temProximo && (
          <GlassButton variant="custom" aria-label="Próximo" title="Próximo (→)" onClick={() => onIndice(indice + 1)}
            className="visualizador-midia__seta pressionavel absolute right-2 top-1/2 -translate-y-1/2 sm:right-4">
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </GlassButton>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Midia({ item }: { item: MidiaVisualizavel }) {
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')
  if (estado === 'erro') {
    return (
      <div role="alert" className="visualizador-midia__erro flex flex-col items-center gap-3 rounded-2xl px-6 py-5 text-center text-sm">
        <p>Não foi possível exibir este arquivo aqui.</p>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Abrir em nova aba</a>
      </div>
    )
  }
  return <>
    {estado === 'carregando' && (
      <span className="visualizador-midia__suave pointer-events-none absolute inset-0 flex items-center justify-center" aria-label="Carregando">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      </span>
    )}
    {item.tipo === 'imagem'
      // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, servida por redirecionamento.
      ? <img src={item.url} alt={item.nome} draggable={false} onLoad={() => setEstado('pronto')} onError={() => setEstado('erro')}
          className={`visualizador-midia__conteudo max-h-full max-w-full rounded-lg object-contain ${estado === 'pronto' ? 'is-pronto' : ''}`} />
      : <video src={item.url} controls autoPlay playsInline aria-label={item.nome}
          onLoadedData={() => setEstado('pronto')} onError={() => setEstado('erro')}
          className={`visualizador-midia__conteudo max-h-full max-w-full rounded-lg ${estado === 'pronto' ? 'is-pronto' : ''}`} />}
  </>
}
