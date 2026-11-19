'use client'

import { useState } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronUp, File, Film, ImageIcon, X } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Tooltip from '@/components/ui/Tooltip'
import './PainelEnvios.css'

export interface EnvioArquivo {
  chave: string
  nome: string
  /** Tipo MIME, para o ícone. */
  tipo: string
  progresso: number
  estado: 'aguardando' | 'enviando' | 'concluido' | 'erro' | 'cancelado'
  erro?: string
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function Anel({ progresso }: { progresso: number }) {
  const r = 9, c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 24 24" className="painel-envios__anel h-6 w-6 -rotate-90" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" className="painel-envios__anel-fundo" />
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2.5" strokeLinecap="round" className="painel-envios__anel-valor"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.03, progresso / 100))} />
    </svg>
  )
}

/**
 * Painel de envios no canto inferior direito, como o do Google Drive: uma
 * barra com o resumo que expande para cima com cada arquivo, seu progresso e
 * o resultado. Cancelar interrompe só o que ainda está em andamento.
 */
export default function PainelEnvios({ envios, onCancelar, onCancelarTodos, onFechar }: {
  envios: EnvioArquivo[]
  onCancelar: (chave: string) => void
  onCancelarTodos: () => void
  /** Fecha o painel e limpa a lista (só chamado sem envios em andamento). */
  onFechar: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  if (envios.length === 0) return null

  const andamento = envios.filter(e => e.estado === 'enviando' || e.estado === 'aguardando')
  const concluidos = envios.filter(e => e.estado === 'concluido').length
  const erros = envios.filter(e => e.estado === 'erro').length
  const emAndamento = andamento.length > 0
  const ativos = envios.filter(e => e.estado !== 'cancelado' && e.estado !== 'erro')
  const geral = ativos.length ? Math.round(ativos.reduce((t, e) => t + (e.estado === 'concluido' ? 100 : e.progresso), 0) / ativos.length) : 100
  const titulo = emAndamento
    ? `Enviando ${plural(andamento.length, 'item', 'itens')}`
    : erros
      ? `${plural(concluidos, 'envio concluído', 'envios concluídos')}, ${plural(erros, 'com erro', 'com erro')}`
      : plural(concluidos, 'envio concluído', 'envios concluídos')

  function fechar() {
    if (emAndamento) setConfirmar(true)
    else { setAberto(false); onFechar() }
  }

  return (
    <section aria-label="Envios de arquivos" className="painel-envios fixed bottom-4 right-4 z-[80] flex w-[min(22.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl">
      <div className="painel-envios__topo flex items-center gap-1 py-1.5 pl-4 pr-1.5">
        <GlassButton variant="custom" aria-expanded={aberto} aria-controls="painel-envios-lista" onClick={() => setAberto(a => !a)}
          className="painel-envios__resumo flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
          <span className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">{titulo}</span>
          <span className="painel-envios__icone flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
            {aberto ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
          </span>
          <span className="sr-only">{aberto ? 'Recolher lista de envios' : 'Mostrar lista de envios'}</span>
        </GlassButton>
        <GlassCloseButton label={emAndamento ? 'Cancelar envios e fechar' : 'Fechar painel de envios'} onClick={fechar} className="painel-envios__fechar" />
      </div>
      {/* Progresso geral: visível mesmo com o painel recolhido. */}
      {emAndamento && (
        <div className="painel-envios__trilho h-1" role="progressbar" aria-label="Progresso dos envios" aria-valuenow={geral} aria-valuemin={0} aria-valuemax={100}>
          <div className="painel-envios__barra h-full" style={{ width: `${geral}%` }} />
        </div>
      )}

      <div id="painel-envios-lista" className="painel-envios__corpo grid" data-aberto={aberto || undefined} inert={!aberto}>
        <div className="min-h-0 overflow-hidden">
          {emAndamento && (
            <div className="painel-envios__faixa flex items-center justify-between gap-3 px-4 py-2 text-xs">
              <span>{concluidos ? `${plural(concluidos, 'concluído', 'concluídos')}, faltam ${andamento.length}` : 'Iniciando envios…'}</span>
              <GlassButton variant="custom" onClick={onCancelarTodos} className="painel-envios__link font-medium">Cancelar</GlassButton>
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto py-1">
            {envios.map(e => {
              const Icone = e.tipo.startsWith('image/') ? ImageIcon : e.tipo.startsWith('video/') ? Film : File
              return (
                <li key={e.chave} className="painel-envios__item group flex items-center gap-3 px-4 py-2">
                  <span className="painel-envios__tipo flex h-6 w-6 shrink-0 items-center justify-center rounded" aria-hidden="true"><Icone className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${e.estado === 'cancelado' ? 'painel-envios__suave line-through' : ''}`} title={e.nome}>{e.nome}</p>
                    {e.estado === 'erro' && <p className="painel-envios__erro truncate text-xs" title={e.erro}>{e.erro}</p>}
                    {e.estado === 'cancelado' && <p className="painel-envios__suave text-xs">Cancelado</p>}
                  </div>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center">
                    {e.estado === 'concluido' && <Check className="painel-envios__ok h-5 w-5" strokeWidth={3} aria-label="Concluído" />}
                    {e.estado === 'erro' && <AlertCircle className="painel-envios__erro h-5 w-5" aria-label="Erro" />}
                    {(e.estado === 'enviando' || e.estado === 'aguardando') && <>
                      <span className="group-hover:hidden group-focus-within:hidden" aria-label={`${e.progresso}% enviado`} role="img"><Anel progresso={e.progresso} /></span>
                      <Tooltip label="Cancelar envio">
                        <GlassButton variant="custom" aria-label={`Cancelar envio de ${e.nome}`} onClick={() => onCancelar(e.chave)}
                          className="painel-envios__cancelar hidden h-7 w-7 items-center justify-center rounded-full group-hover:flex group-focus-within:flex">
                          <X className="h-4 w-4" aria-hidden="true" />
                        </GlassButton>
                      </Tooltip>
                    </>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmar}
        onClose={() => setConfirmar(false)}
        onConfirm={() => { setConfirmar(false); onCancelarTodos(); setAberto(false); onFechar() }}
        title="Cancelar os envios?"
        message={`${plural(andamento.length, 'arquivo ainda não terminou', 'arquivos ainda não terminaram')} de enviar. Os que já foram enviados continuam no projeto.`}
        confirmLabel="Cancelar envios"
      />
    </section>
  )
}
