'use client'

import MultiUserSelector from '@/components/card/MultiUserSelector'
import CardModal from '@/components/card/CardModal'
import { deleteAttachmentAction, listCardAttachmentsAction, renameAttachmentAction } from '@/app/actions/attachments'
import { fetchWithSession } from '@/lib/clientFetch'
import type { Attachment } from '@/types/kanban'
import { createCommentAction, getCommentsAction, updateCommentAction, deleteCommentAction } from '@/app/actions/comentarios'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'
import DetailPanel from '@/components/ui/DetailPanel'
import OperumButton from '@/components/ui/GlassButton'
import CardTimer from '@/components/card/CardTimer'
import TimeEntryList from '@/components/card/TimeEntryList'
import CardTimerButton from '@/components/card/CardTimerButton'
import { formatarMinutos } from '@/lib/tempoRealizado'
import { useCardTimer } from '@/hooks/useCardTimer'
import { patchCardAction } from '@/app/actions/sprintBoard'
import type { CardDaAtividade, Elaborador } from '@/lib/planilhaCustos'
import './atividade-detalhes.css'

export interface AtividadeDetalhe {
  nodeId: string
  codigo: string
  titulo: string
  descricao: string
  elaboradores: string
  elaboradorIds: string[]
  minReal: number
  horasReal: string
  diasReal: string
  minLegado: number
  card?: CardDaAtividade
}

/**
 * Painel lateral de uma atividade da Planilha de Custos: etapa, responsáveis, timer
 * e descrição. Timer e descrição são os do card da sprint (mesma fonte do quadro).
 */
export default function AtividadeDetalhesPainel({ atividade, elaboradores, onElaboradoresChange, canUsarCards, currentUserId, onFechar, onAlterado, tituloEditavel }: {
  elaboradores: Elaborador[]
  onElaboradoresChange?: (ids: string[]) => void
  atividade: AtividadeDetalhe
  /** Iniciar o timer e editar a descrição gravam no card: exige `quadro:cards`. */
  canUsarCards: boolean
  currentUserId?: string
  onFechar: () => void
  /** Chamado depois de salvar a descrição ou parar o timer, para a planilha recarregar. */
  onAlterado: () => void
  tituloEditavel?: ReactNode
}) {
  const [aba, setAba] = useState<'tempo' | 'atividade' | 'comentarios'>('atividade')
  const [commentsTarget, setCommentsTarget] = useState<HTMLDivElement | null>(null)
  const id = useId()
  const abas = [
    { value: 'atividade', label: 'Atividade', id: `${id}-atividade`, panelId: `${id}-painel-atividade` },
    { value: 'tempo', label: 'Tempo', id: `${id}-tempo`, panelId: `${id}-painel-tempo` },
    { value: 'comentarios', label: 'Comentários', id: `${id}-comentarios`, panelId: `${id}-painel-comentarios` },
  ] as const
  const [registrosVersao, setRegistrosVersao] = useState(0)
  const painel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    painel.current?.focus()
    const aoTeclar = (event: KeyboardEvent) => { if (event.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const { card } = atividade
  return (
    <DetailPanel title={tituloEditavel ?? `${atividade.codigo} ${atividade.titulo}`} label={`Detalhes de ${atividade.codigo} ${atividade.titulo}`} onClose={onFechar} className="atividade-detalhes">
      <div ref={painel} tabIndex={-1} className="atividade-detalhes-corpo">
        <GlassSegmentedControl options={abas} value={aba} onChange={setAba} label="Seções da atividade" className="atividade-detalhes-abas" />
        <div role="tabpanel" id={abas[1].panelId} aria-labelledby={abas[1].id} hidden={aba !== 'tempo'} className="atividade-detalhes-pagina atividade-tempo-pagina">
          <section className="atividade-tempo-resumo" aria-labelledby="atividade-tempo-total">
            <h3 id="atividade-tempo-total">Total realizado</h3>
            <dl>
              <div><dt>Minutos</dt><dd>{formatarMinutos(atividade.minReal)}</dd></div>
              <div><dt>Horas</dt><dd>{atividade.horasReal}</dd></div>
              <div><dt>Dias</dt><dd>{atividade.diasReal}</dd></div>
            </dl>
          </section>
          {atividade.minLegado > 0 && (
            <p className="atividade-detalhes-ajuda">O total inclui {formatarMinutos(atividade.minLegado)} min antigos que ainda não foram convertidos em lançamento.</p>
          )}
          {card ? (
            <>
              <section className="atividade-tempo-controles" aria-labelledby="atividade-tempo">
                <h3 id="atividade-tempo">Cronômetro</h3>
                {canUsarCards ? (
                  <CardTimer manualAoLado cardId={card.id} timerKey={registrosVersao} onEntryChanged={() => {
                    setRegistrosVersao(version => version + 1)
                    onAlterado()
                  }} />
                ) : <TimerDoCard cardId={card.id} canStart={false} onStopped={onAlterado} />}
              </section>
              <section className="atividade-tempo-registros" aria-labelledby="atividade-lancamentos">
                <h3 id="atividade-lancamentos">Lançamentos</h3>
                <TimeEntryList compact key={card.id} cardId={card.id} refreshKey={registrosVersao} readOnly={!canUsarCards} onChanged={() => {
                  setRegistrosVersao(version => version + 1)
                  onAlterado()
                }} />
              </section>
            </>
          ) : <p className="atividade-detalhes-ajuda">Os lançamentos ficam disponíveis quando a atividade estiver vinculada a um card.</p>}
        </div>
        <div role="tabpanel" id={abas[0].panelId} aria-labelledby={abas[0].id} hidden={aba !== 'atividade'} className="atividade-detalhes-pagina">
          <section className="atividade-elaboradores atividade-detalhes-secao">
            <h3>Elaborado por</h3>
            {onElaboradoresChange ? (
              <MultiUserSelector
                cardId={card?.id ?? ''}
                users={elaboradores.map(user => ({ id: user.userId, name: user.name }))}
                selection={{ ids: atividade.elaboradorIds, onChange: onElaboradoresChange }}
                compact
                selectLabel="Adicionar elaborador"
              />
            ) : <p className="atividade-detalhes-texto">{atividade.elaboradores || 'Sem elaborador'}</p>}
            {!card && <p className="atividade-detalhes-texto">{atividade.descricao || 'Sem descrição.'}</p>}
          </section>
          {card && <CardDaSprint key={card.id} card={card} atividade={atividade} elaboradores={elaboradores} commentsTarget={commentsTarget} commentsVisible={aba === 'comentarios'} onAttachmentShared={() => setAba('comentarios')} currentUserId={currentUserId} podeEditar={canUsarCards} onClose={onFechar} onChanged={onAlterado} />}
        </div>
        <div ref={setCommentsTarget} role="tabpanel" id={abas[2].panelId} aria-labelledby={abas[2].id} hidden={aba !== 'comentarios'} className="atividade-detalhes-pagina atividade-comentarios-pagina">
          {!card && <p className="atividade-detalhes-ajuda">Os comentários ficam disponíveis quando a atividade estiver vinculada a um card.</p>}
        </div>
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

function CardDaSprint({ card, atividade, elaboradores, commentsTarget, commentsVisible, onAttachmentShared, currentUserId, podeEditar, onClose, onChanged }: {
  card: CardDaAtividade
  elaboradores: Elaborador[]
  commentsTarget: HTMLDivElement | null
  commentsVisible: boolean
  onAttachmentShared: () => void
  atividade: AtividadeDetalhe
  currentUserId?: string
  podeEditar: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [carregandoAnexos, setCarregandoAnexos] = useState(true)
  const [erroAnexos, setErroAnexos] = useState('')

  useEffect(() => {
    let ativo = true
    void listCardAttachmentsAction(card.id).then(resultado => {
      if (!ativo) return
      if (resultado.attachments) setAttachments(resultado.attachments)
      setErroAnexos(resultado.error ?? '')
    }).catch(() => {
      if (ativo) setErroAnexos('Não foi possível carregar os anexos do card.')
    }).finally(() => {
      if (ativo) setCarregandoAnexos(false)
    })
    return () => { ativo = false }
  }, [card.id])

  async function atualizarAnexos(
    alterar: () => Promise<{ error?: string }>,
    atualizar: (atuais: Attachment[]) => Attachment[],
  ) {
    setErroAnexos('')
    try {
      const resultado = await alterar()
      if (resultado.error) throw new Error(resultado.error)
      setAttachments(atualizar)
    } catch (error) {
      setErroAnexos(error instanceof Error ? error.message : 'Não foi possível alterar o anexo.')
    }
  }

  const [comments, setComments] = useState<Awaited<ReturnType<typeof getCommentsAction>>['comments']>([])
  const [erro, setErro] = useState('')
  const commentsRevision = useRef(0)
  const lastCheckedComment = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!commentsVisible) return
    let ativo = true
    let buscando = false
    async function atualizarComentarios() {
      if (buscando || document.hidden) return
      buscando = true
      const revision = commentsRevision.current
      try {
        const resultado = await getCommentsAction(card.id)
        if (!ativo || revision !== commentsRevision.current) return
        if (!resultado.error) {
          setComments(resultado.comments)
          const ultimo = resultado.comments.at(-1)?.id
          if (ultimo !== lastCheckedComment.current) {
            const novos = resultado.comments.slice(resultado.comments.findIndex(comment => comment.id === lastCheckedComment.current) + 1)
            if (novos.some(comment => comment.content.startsWith('[anexo:'))) {
              const arquivos = await listCardAttachmentsAction(card.id)
              if (ativo && arquivos.attachments) {
                const recebidos = arquivos.attachments
                setAttachments(atuais => [...atuais, ...recebidos.filter(anexo => !atuais.some(atual => atual.id === anexo.id))])
              }
            }
            if (ativo) lastCheckedComment.current = ultimo
          }
        }
        setErro(resultado.error ?? '')
      } catch {
        if (ativo && revision === commentsRevision.current) setErro('Não foi possível carregar os comentários.')
      } finally {
        buscando = false
      }
    }
    void atualizarComentarios()
    const intervalo = window.setInterval(atualizarComentarios, 5000)
    document.addEventListener('visibilitychange', atualizarComentarios)
    return () => {
      ativo = false
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', atualizarComentarios)
    }
  }, [card.id, commentsVisible])

  return (
    <div className="min-w-0">
      {erroAnexos && <p role="alert" className="atividade-detalhes-erro">{erroAnexos}</p>}
      <CardModal
        isOpen
        embedded
        readOnly={!podeEditar}
        onClose={onClose}
        initialCard={{
          id: card.id, title: atividade.titulo, eapCode: atividade.codigo,
          description: atividade.descricao, priority: card.priority ?? undefined,
          sprintId: card.sprintId, color: '#94a3b8', createdAt: 0, updatedAt: 0,
        }}
        onPatch={async patch => {
          const resultado = await patchCardAction(card.sprintId ?? '', card.id, patch)
          if (resultado.error) return { error: resultado.error }
          onChanged()
        }}
        onPriorityChange={podeEditar ? async priority => {
          const resultado = await patchCardAction(card.sprintId ?? '', card.id, {
            priority: priority as 'baixa' | 'media' | 'alta',
          })
          if (resultado.error) return { error: resultado.error }
          onChanged()
        } : undefined}
        onSubmit={async ({ description }) => {
          const resultado = await patchCardAction(card.sprintId ?? '', card.id, { description })
          if (resultado.error) return { error: resultado.error }
          onChanged()
          return { success: true }
        }}
        attachments={attachments}
        onAttachmentUpload={podeEditar && !carregandoAnexos ? async file => {
          setErroAnexos('')
          const form = new FormData()
          form.append('cardId', card.id)
          form.append('file', file)
          const response = await fetchWithSession('/api/uploads', { method: 'POST', body: form })
          if (!response.ok) {
            const body = await response.json().catch(() => ({})) as { error?: string; message?: string }
            throw new Error(body.error ?? body.message ?? 'Falha ao enviar o anexo.')
          }
          const { createdAt, uploadedAt, ...dados } = await response.json()
          const attachment: Attachment = { ...dados, uploadedAt: new Date(uploadedAt ?? createdAt).getTime() }
          setAttachments(atuais => [...atuais.filter(anexo => anexo.id !== attachment.id), attachment])
          return attachment
        } : undefined}
        onAttachmentRename={podeEditar ? (id, name) => atualizarAnexos(
          () => renameAttachmentAction(id, card.id, name),
          atuais => atuais.map(attachment => attachment.id === id ? { ...attachment, fileName: name.trim() } : attachment),
        ) : undefined}
        onAttachmentDelete={podeEditar ? id => atualizarAnexos(
          () => deleteAttachmentAction(id, card.id),
          atuais => atuais.filter(attachment => attachment.id !== id),
        ) : undefined}
        comments={comments}
        mentionUsers={elaboradores.map(person => ({ id: person.userId, name: person.name }))}
        commentsTarget={commentsTarget}
        commentsVisible={commentsVisible}
        onAttachmentShared={onAttachmentShared}
        commentsLoadError={erro}
        attachmentUploadError={erroAnexos}
        currentUser={currentUserId ? { id: currentUserId } : undefined}
        onAddComment={async (content, mentionedUserIds) => {
          const resultado = await createCommentAction(card.id, content.trim(), mentionedUserIds)
          if (!resultado.comment) throw new Error(resultado.error ?? 'Não foi possível comentar.')
          const comment = resultado.comment
          commentsRevision.current += 1
          setComments(atuais => atuais.some(atual => atual.id === comment.id) ? atuais : [...atuais, comment])
        }}
        onEditComment={async (id, content) => {
          const resultado = await updateCommentAction(card.id, id, content)
          if (resultado.error) throw new Error(resultado.error)
          commentsRevision.current += 1
          setComments(atuais => atuais.map(comment => comment.id === id ? { ...comment, content } : comment))
        }}
        onDeleteComment={async id => {
          const resultado = await deleteCommentAction(card.id, id)
          if (resultado.error) throw new Error(resultado.error)
          commentsRevision.current += 1
          setComments(atuais => atuais.filter(comment => comment.id !== id))
        }}
      />
    </div>
  )
}
