'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { CaixaSelecao, IconeArquivo, type ItemArquivo } from './ListaArquivos'

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
export default function GradeArquivos({ itens, tamanho, vazio, selecionados, onMarcar }: {
  itens: ItemArquivo[]; tamanho: number; vazio: string
  /** Com seleção: ids marcados (sem ela, os blocos não têm caixa). */
  selecionados?: string[]
  onMarcar?: (id: string, marcado: boolean) => void
}) {
  if (itens.length === 0) {
    return <div className="rounded-2xl border border-gray-100 bg-white px-4 py-8 text-center text-sm text-gray-400">{vazio}</div>
  }
  return (
    <ul className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${tamanho}px, 100%), 1fr))` }} aria-label="Arquivos em blocos">
      {itens.map(a => {
        const marcado = selecionados?.includes(a.id) ?? false
        return (
        <li key={a.id} className="min-w-0">
          <GlassCard as="article" interactive aria-selected={selecionados ? marcado : undefined}
            className={`group relative flex h-full flex-col overflow-hidden !rounded-2xl p-2 ${marcado ? 'ring-2 ring-blue-500' : ''}`}>
            {selecionados && onMarcar && (
              <span className="absolute left-3.5 top-3.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 shadow-sm backdrop-blur-sm">
                <CaixaSelecao marcado={marcado} onChange={v => onMarcar(a.id, v)} rotulo={`Selecionar ${a.nome}`} />
              </span>
            )}
            {a.abrir
              ? <a href={a.abrir} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${a.nome}`}
                  className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
                  <Miniatura item={a} tamanho={tamanho} />
                </a>
              : <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100"><Miniatura item={a} tamanho={tamanho} /></div>}
            <div className="mt-2 min-w-0 px-1">
              {a.abrir
                ? <a href={a.abrir} target="_blank" rel="noopener noreferrer" tabIndex={-1} className="block truncate text-sm font-medium text-slate-900 hover:text-blue-600 hover:underline" title={a.nome}>{a.nome}</a>
                : <p className="truncate text-sm font-medium text-slate-900" title={a.nome}>{a.nome}</p>}
              <p className="truncate text-xs text-slate-500">{a.tamanho} · {new Date(a.data).toLocaleDateString('pt-BR')}</p>
            </div>
            {a.acoes && <div className="mt-2 flex flex-wrap items-center justify-end gap-1 px-1">{a.acoes}</div>}
          </GlassCard>
        </li>
        )
      })}
    </ul>
  )
}
