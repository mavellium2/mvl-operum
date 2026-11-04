'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import DetailPanel from '@/components/ui/DetailPanel'
import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Textarea as OperumTextarea } from '@/components/ui/Field'
import CardTimerButton from '@/components/card/CardTimerButton'
import { useCardTimer } from '@/hooks/useCardTimer'
import { patchCardAction } from '@/app/actions/sprintBoard'
import { sprintPath } from '@/lib/sprintPath'
import type { CardDaAtividade } from '@/lib/planilhaCustos'
import './atividade-detalhes.css'

export interface AtividadeDetalhe {
  nodeId: string
  codigo: string
  titulo: string
  macrofase: string
  descricao: string
  elaboradores: string
  card?: CardDaAtividade
}

/**
 * Painel lateral de uma atividade da Planilha de Custos: etapa, responsáveis, timer
 * e descrição. Timer e descrição são os do card da sprint (mesma fonte do quadro).
 */
export default function AtividadeDetalhesPainel({ projetoId, atividade, canUsarCards, onFechar, onAlterado }: {
  projetoId: string
  atividade: AtividadeDetalhe
  /** Iniciar o timer e editar a descrição gravam no card: exige `quadro:cards`. */
  canUsarCards: boolean
  onFechar: () => void
  /** Chamado depois de salvar a descrição ou parar o timer, para a planilha recarregar. */
  onAlterado: () => void
}) {
  const painel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    painel.current?.focus()
    const aoTeclar = (event: KeyboardEvent) => { if (event.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const { card } = atividade
  return (
    <DetailPanel floating title={`${atividade.codigo} ${atividade.titulo}`} label={`Detalhes de ${atividade.codigo} ${atividade.titulo}`} onClose={onFechar} className="atividade-detalhes">
      <div ref={painel} tabIndex={-1} className="atividade-detalhes-corpo">
        <dl className="atividade-detalhes-dados">
          <div><dt>Macrofase</dt><dd>{atividade.macrofase}</dd></div>
          <div><dt>Etapa na sprint</dt><dd>{card?.etapa ?? '—'}</dd></div>
          <div><dt>Elaborada por</dt><dd>{atividade.elaboradores || 'Sem responsável'}</dd></div>
        </dl>

        {card ? (
          <>
            <section className="atividade-detalhes-secao" aria-labelledby="atividade-tempo">
              <h3 id="atividade-tempo">Tempo</h3>
              <TimerDoCard cardId={card.id} canStart={canUsarCards} onStopped={onAlterado} />
              <p className="atividade-detalhes-ajuda">Ao pausar, o tempo entra no realizado desta atividade.</p>
            </section>
            <DescricaoDoCard key={card.id} card={card} descricao={atividade.descricao} podeEditar={canUsarCards} onSalva={onAlterado} />
            {card.sprintId && (
              <Link href={sprintPath(card.sprintId, projetoId, card.id)} className="atividade-detalhes-link">
                Abrir o card na sprint <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </>
        ) : (
          <>
            <section className="atividade-detalhes-secao" aria-labelledby="atividade-descricao">
              <h3 id="atividade-descricao">Descrição</h3>
              {atividade.descricao
                ? <p className="atividade-detalhes-texto">{atividade.descricao}</p>
                : <p className="atividade-detalhes-vazio">Sem descrição.</p>}
            </section>
            <p className="atividade-detalhes-ajuda">Esta atividade ainda não tem card na sprint. Depois de salvar a planilha, o card é criado e o timer e a descrição ficam disponíveis aqui.</p>
          </>
        )}
      </div>
    </DetailPanel>
  )
}

function TimerDoCard({ cardId, canStart, onStopped }: { cardId: string; canStart: boolean; onStopped: () => void }) {
  const timer = useCardTimer(cardId)
  return (
    <div className="atividade-detalhes-timer">
      <CardTimerButton timer={timer} canStart={canStart} onStopped={onStopped} className="ml-0" />
      {timer.error && <p role="alert" className="atividade-detalhes-erro">{timer.error} <OperumButton variant="default" type="button" onClick={() => void timer.refresh()} disabled={timer.loading}>Atualizar timer</OperumButton></p>}
    </div>
  )
}

function DescricaoDoCard({ card, descricao, podeEditar, onSalva }: { card: CardDaAtividade; descricao: string; podeEditar: boolean; onSalva: () => void }) {
  const [salva, setSalva] = useState(descricao)
  const [rascunho, setRascunho] = useState(descricao)
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function salvar() {
    if (salvando) return
    setSalvando(true); setErro('')
    try {
      const r = await patchCardAction(card.sprintId ?? '', card.id, { description: rascunho })
      if ('error' in r && r.error) { setErro(r.error); return }
      setSalva(rascunho); setEditando(false)
      onSalva()
    } catch {
      setErro('Não foi possível salvar a descrição. Tente novamente.')
    } finally { setSalvando(false) }
  }

  return (
    <section className="atividade-detalhes-secao" aria-labelledby="atividade-descricao">
      <div className="atividade-detalhes-titulo">
        <h3 id="atividade-descricao">Descrição</h3>
        {podeEditar && !editando && <OperumButton variant="default" type="button" onClick={() => { setRascunho(salva); setEditando(true) }} className="atividade-detalhes-editar">Editar</OperumButton>}
      </div>
      {editando ? (
        <form onSubmit={event => { event.preventDefault(); void salvar() }}>
          <OperumTextarea autoFocus aria-label="Descrição da atividade" value={rascunho} onChange={event => setRascunho(event.target.value)} rows={8} maxLength={20000}
            placeholder="O que precisa ser feito, critérios de aceite..." className="w-full rounded-lg border px-3 py-2 text-sm" />
          <p className="atividade-detalhes-ajuda">É a mesma descrição do card na sprint.</p>
          {erro && <p role="alert" className="atividade-detalhes-erro">{erro}</p>}
          <FormActions surface="none" className="atividade-detalhes-acoes">
            <OperumButton variant="default" type="button" onClick={() => { setEditando(false); setErro('') }} disabled={salvando}>Cancelar</OperumButton>
            <OperumButton variant="primary" type="submit" disabled={salvando || rascunho === salva}>{salvando ? 'Salvando…' : 'Salvar descrição'}</OperumButton>
          </FormActions>
        </form>
      ) : salva
        ? <p className="atividade-detalhes-texto">{salva}</p>
        : <p className="atividade-detalhes-vazio">Sem descrição.</p>}
    </section>
  )
}
