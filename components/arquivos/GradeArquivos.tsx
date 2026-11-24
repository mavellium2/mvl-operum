'use client'

import { useState } from 'react'
import { Play, Star } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import type { MouseEvent } from 'react'
import { CirculoSelecao, IconeArquivo, type ItemArquivo } from './ListaArquivos'

const duracao = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return null
  const t = Math.round(s)
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), seg = String(t % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`
}

/** Miniatura do arquivo: a própria imagem, o primeiro quadro do vídeo ou o ícone do tipo. */
function Miniatura({ item, tamanho }: { item: ItemArquivo; tamanho: number }) {
  const [falhou, setFalhou] = useState(false)
  const [tempo, setTempo] = useState<string | null>(null)
  const icone = <div className="flex h-full w-full items-center justify-center [&>svg]:h-1/4 [&>svg]:w-1/4"><IconeArquivo categoria={item.categoria} /></div>
  if (!item.previa || falhou || (item.categoria !== 'imagem' && item.categoria !== 'video')) return icone
  if (item.categoria === 'imagem') {
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, servida por redirecionamento; next/image não se aplica.
    return <img src={item.previa} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFalhou(true)}
      className="h-full w-full object-contain" />
  }
  return <>
    {/* #t=0.1: o navegador mostra o primeiro quadro sem baixar o vídeo inteiro. */}
    <video src={`${item.previa}#t=0.1`} preload="metadata" muted playsInline tabIndex={-1} aria-hidden="true"
      onLoadedMetadata={e => setTempo(duracao(e.currentTarget.duration))} onError={() => setFalhou(true)}
      className="pointer-events-none h-full w-full object-contain" />
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm" style={{ width: Math.max(28, tamanho / 5), height: Math.max(28, tamanho / 5) }}>
        <Play className="h-1/2 w-1/2 translate-x-[6%] fill-current" />
      </span>
    </span>
    {tempo && <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">{tempo}</span>}
  </>
}

/**
 * Visualização em blocos (como os ícones do Finder): a arte de cada arquivo,
 * com o nome embaixo. O tamanho do bloco vem do controle deslizante da lista.
 */
export default function GradeArquivos({ itens, tamanho, vazio, selecionados, onClicar, onMarcar, algumMarcado, onAbrir, ativoId, onFoco }: {
  itens: ItemArquivo[]; tamanho: number; vazio: string
  /** Com seleção: ids marcados; o clique no bloco (fora da arte e dos botões) seleciona. */
  selecionados?: string[]
  onClicar?: (e: MouseEvent, id: string) => void
  /** Círculo de seleção no canto do bloco (alterna só este item). */
  onMarcar?: (id: string) => void
  /** Com algo marcado, todos os círculos ficam visíveis. */
  algumMarcado?: boolean
  /** Com seleção: duplo clique abre. */
  onAbrir?: (item: ItemArquivo) => void
  /** Bloco com o foco do teclado (um só ponto de parada do Tab) e aviso de que um bloco recebeu o foco. As teclas são tratadas pela lista. */
  ativoId?: string | null
  onFoco?: (id: string) => void
}) {
  if (itens.length === 0) {
    return <div className="arq-quadro arq-meta rounded-2xl px-4 py-10 text-center text-sm">{vazio}</div>
  }
  return (
    <ul className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${tamanho}px, 100%), 1fr))` }} aria-label="Arquivos em blocos">
      {itens.map(a => {
        const marcado = selecionados?.includes(a.id) ?? false
        return (
        <li key={a.id} className="min-w-0">
          <GlassCard as="article" interactive aria-selected={selecionados ? marcado : undefined}
            onClick={onClicar ? e => onClicar(e, a.id) : undefined}
            onDoubleClick={onAbrir ? e => { if (!(e.target as HTMLElement).closest('button, input')) onAbrir(a) } : undefined}
            data-arq-id={onClicar ? a.id : undefined}
            onFocus={onFoco ? e => { if (e.target === e.currentTarget) onFoco(a.id) } : undefined}
            tabIndex={onClicar ? (a.id === (ativoId ?? itens[0]?.id) ? 0 : -1) : undefined}
            aria-label={onClicar ? `${a.nome}${a.abrir ? ' (Enter abre)' : ''}` : undefined}
            className={`arq-bloco bloco-arquivo group relative flex h-full flex-col overflow-hidden !rounded-2xl p-1.5 ${onClicar ? 'cursor-default select-none' : ''}`}>
            {a.abrir && !onClicar
              ? <a href={a.abrir} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${a.nome}`}
                  className="arq-miniatura relative block aspect-[4/3] overflow-hidden rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2">
                  <Miniatura item={a} tamanho={tamanho} />
                </a>
              : <div className="arq-miniatura relative aspect-[4/3] overflow-hidden rounded-xl"><Miniatura item={a} tamanho={tamanho} /></div>}
            {onMarcar && (
              <CirculoSelecao marcado={marcado} rotulo={`Selecionar ${a.nome}`} tabIndex={-1} onAlternar={() => onMarcar(a.id)}
                className={`arq-circulo-bloco absolute left-2.5 top-2.5 z-10 ${algumMarcado ? 'arq-circulo-visivel' : ''}`} />
            )}
            {/* Ações por cima da arte, no canto, como no Drive; aparecem no hover/foco. */}
            {a.acoes && <div className={`arq-acoes-bloco absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-xl p-0.5 ${selecionados ? 'acoes-linha-arquivo' : ''}`}>{a.acoes}</div>}
            <div className="min-w-0 px-1.5 pb-1 pt-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {a.abrir && !onClicar
                  ? <a href={a.abrir} target="_blank" rel="noopener noreferrer" tabIndex={-1} className="arq-nome min-w-0 truncate text-sm font-medium" title={a.nome}>{a.nome}</a>
                  : <span className="arq-nome min-w-0 truncate text-sm font-medium" title={a.nome}>{a.nome}</span>}
                {a.favorito && <Star className="arq-estrela h-3 w-3 shrink-0" aria-label="Com estrela" />}
              </div>
              <p className="arq-meta truncate text-xs tabular-nums">{a.tamanho} · {new Date(a.data).toLocaleDateString('pt-BR')}</p>
            </div>
          </GlassCard>
        </li>
        )
      })}
    </ul>
  )
}
