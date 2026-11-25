'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Field'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, CheckCircle2, Clock, FileText, History, Pencil, Plus, User, X, XCircle } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import EmptyState from '@/components/ui/EmptyState'
import Tooltip from '@/components/ui/Tooltip'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AnimatedTrashButton from '@/components/ui/AnimatedTrashButton'
import { useToast } from '@/components/ui/Toast'
import { fetchWithSession } from '@/lib/clientFetch'
import AssinaturaEmLinha from '@/components/documentos/AssinaturaEmLinha'
import { CampoAutomatico, CampoData, CampoTexto, Folha, SecaoTabela, useEditorFolha } from '@/components/documentos/editor/folha'
import { abrirPropostas } from '@/hooks/useVersoesDocumento'
import {
  CONCEITOS_RH, CRITERIOS_RH, MAX_RODADAS_RH, MIN_RODADAS_RH, ROTULO_CONCEITO_RH, listaRodadasRh, MAX_TITULO_RODADA_RH, nomeRodadaRh, recursoAvaliacaoRh, rodadaRhValida, tituloRodadaRh,
  type ConceitoRh, type RodadaRh, type TitulosRodadaRh,
} from '@/lib/avaliacaoRh'
import type { AvaliacaoRh } from '@/lib/validation/formulariosGP'
import type { MembroEquipeOption } from '../MembroEquipeSelect'
import FormularioDocumento, { type RenderFormulario } from './FormularioDocumento'
import { linhaOuAviso } from '@/lib/linhaInstitucional'
import { celulaGP, celulaGPCampo, FONTE_FORMULARIO, tabelaGP, TituloFormulario } from './QuadroFormulario'

type Situacao = 'APPROVED' | 'PENDING' | 'REJECTED' | 'NONE'
export interface AvaliacaoRhItem { integranteId: string; integrante: string; rodada: RodadaRh; status: Situacao; notaFinal: string }

const STATUS: Record<Situacao, { rotulo: string; cls: string; Icone: typeof CheckCircle2 }> = {
  APPROVED: { rotulo: 'Aprovada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icone: CheckCircle2 },
  PENDING: { rotulo: 'Aguardando aprovação', cls: 'bg-amber-50 text-amber-800 ring-amber-200', Icone: Clock },
  REJECTED: { rotulo: 'Versão rejeitada', cls: 'bg-red-50 text-red-700 ring-red-200', Icone: XCircle },
  NONE: { rotulo: 'Não iniciada', cls: 'bg-slate-100 text-slate-600 ring-slate-200', Icone: FileText },
}

const hrefAvaliacao = (integranteId?: string, rodada?: RodadaRh) =>
  `?doc=avaliacao-rh${integranteId && rodada ? `&integrante=${encodeURIComponent(integranteId)}&rodada=${rodada}` : ''}`

/** Nome do critério sem o marcador e os dois-pontos do modelo, para rótulos acessíveis. */
const nomeDoCriterio = (titulo: string) => titulo.replace(/^-\s*/, '').replace(/:$/, '')

/** Rádio na edição; "X" no documento, como no modelo. */
function Marca({ nome, rotulo, marcada, onMarcar }: { nome: string; rotulo: string; marcada: boolean; onMarcar?: () => void }) {
  const { editavel } = useEditorFolha()
  if (!editavel || !onMarcar) return <span aria-label={rotulo}>{marcada ? 'X' : ''}</span>
  // Rádio nativo: controle de escolha (permitido fora da base dos campos de texto).
  return (
    <label className="flex min-h-6 w-full cursor-pointer items-center justify-center transition-colors hover:bg-blue-50 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500">
      <input type="radio" name={nome} checked={marcada} onChange={onMarcar} aria-label={rotulo} className="h-3 w-3 cursor-pointer accent-blue-600" />
    </label>
  )
}

/**
 * Folha do modelo "15 - Avaliação R.H.": título com o logo, quadro de
 * identificação (instituição, projeto, gerente, participante, versão, nota
 * final, data e assinatura do gerente), tabela "Lista" com os 12 critérios e
 * as frases do modelo e uma marca por critério, e as observações.
 */
export function FolhaAvaliacao({ conteudo, sistema, versaoPadrao, alterar }: RenderFormulario<AvaliacaoRh>) {
  const { editavel } = useEditorFolha()
  // Na edição os rádios ficam centralizados na linha toda; no documento, o X segue a posição do modelo.
  const editar = (id: string, valor: ConceitoRh) =>
    alterar?.(atual => ({ ...atual, criterios: { ...atual.criterios, [id]: valor } }))
  const gerente = sistema.gerente.nome || 'Nenhum gerente definido no projeto.'
  return (
    <Folha data-testid="avaliacao-rh-folha" style={{ fontFamily: FONTE_FORMULARIO, fontSize: '10pt', gap: '3mm' }}>
      <TituloFormulario titulo="Avaliação de Desempenho dos Recursos Humanos" logoUrl={sistema.logoUrl} />
      <table data-testid="avaliacao-rh-quadro" style={tabelaGP}>
        <colgroup><col style={{ width: '32%' }} /><col style={{ width: '50%' }} /><col style={{ width: '18%' }} /></colgroup>
        <tbody>
          <tr><td colSpan={3} style={{ ...celulaGPCampo, background: '#bfbfbf', fontWeight: 'bold' }}><CampoAutomatico padding="1px 5px">{linhaOuAviso(sistema.instituicao)}</CampoAutomatico></td></tr>
          <tr><td colSpan={3} style={celulaGPCampo}><CampoAutomatico padding="1px 5px"><b>Nome do projeto:</b> {sistema.nomeProjeto}</CampoAutomatico></td></tr>
          <tr>
            <td colSpan={2} style={celulaGPCampo}><CampoAutomatico padding="1px 5px"><b>Gerente do projeto:</b> {gerente}</CampoAutomatico></td>
            <td style={celulaGP} />
          </tr>
          <tr>
            <td colSpan={2} style={celulaGPCampo}><CampoAutomatico padding="1px 5px"><b>Nome do Participante:</b> {conteudo.integrante}</CampoAutomatico></td>
            <td style={celulaGPCampo}><CampoAutomatico padding="1px 5px"><b>Versão:</b> {versaoPadrao}</CampoAutomatico></td>
          </tr>
          <tr>
            <td colSpan={2} style={celulaGPCampo}>
              {/* Digitada pelo gerente. CampoTexto: o mesmo campo dos demais documentos (foco, paginação, "Limpar campo"). */}
              <div className="flex items-start" style={{ paddingLeft: 5 }}>
                <b>Nota Final:</b>&nbsp;
                <div style={{ flex: 1 }}>
                  <CampoTexto id="avaliacao-rh-nota" rotulo="Nota final" ajuda="Nota final do participante, digitada pelo gerente (ex.: 9,5)." pergunta="nota final" valor={conteudo.notaFinal ?? ''} onChange={valor => alterar?.(c => ({ ...c, notaFinal: valor }))} max={30} linha compacto />
                </div>
              </div>
            </td>
            <td style={{ ...celulaGP, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
              <b>Data:</b>{' '}
              <CampoData
                id="avaliacao-rh-data"
                rotulo="Data da avaliação"
                valor={conteudo.data ?? ''}
                onChange={valor => alterar?.(c => ({ ...c, data: valor }))}
              />
            </td>
          </tr>
          <tr>
            <td style={{ ...celulaGP, whiteSpace: 'nowrap', fontWeight: 'bold' }}>Assinatura do Gerente de Projeto</td>
            <td colSpan={2} style={celulaGP}>
              <AssinaturaEmLinha url={sistema.gerente.assinaturaUrl} rotulo={null} vazio={editavel ? 'Sem assinatura cadastrada pelo gerente' : undefined} />
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '10pt', marginTop: '4mm' }}>Lista</div>
      <SecaoTabela
        semFaixa
        titulo="Lista"
        testId="avaliacao-rh-criterios"
        colunas={[
          { rotulo: 'AVALIAÇÃO', largura: '70%', alinhamento: 'center' as const },
          ...CONCEITOS_RH.map(c => ({ rotulo: ROTULO_CONCEITO_RH[c], largura: '7.5%', alinhamento: 'center' as const })),
        ]}
        estiloCabecalho={{ fontSize: '10pt', padding: '1px 3px', fontWeight: 'bold', background: 'transparent' }}
      >
        {CRITERIOS_RH.map(criterio => {
          const marcado = conteudo.criterios?.[criterio.id] ?? null
          const verticalAlign = criterio.marcaNoTopo && !editavel ? 'top' : 'middle'
          return (
            <tr key={criterio.id} style={{ breakInside: 'avoid' }}>
              <td style={celulaGP}>
                <div style={{ fontWeight: 'bold' }}>{criterio.titulo}</div>
                <div style={{ paddingLeft: '3mm' }}>{criterio.descricao}</div>
                <div style={{ paddingLeft: criterio.recuoFrases === 'maior' ? '6mm' : '3mm' }}>
                  {criterio.frases.map((frase, indice) =>
                    frase ? <div key={indice}>{frase}</div> : <div key={indice} style={{ height: '1.2em' }} />,
                  )}
                </div>
              </td>
              {CONCEITOS_RH.map(conceito => (
                <td key={conceito} style={{ ...celulaGPCampo, textAlign: 'center', verticalAlign }}>
                  <Marca
                    nome={`avaliacao-rh-${criterio.id}`}
                    rotulo={`${nomeDoCriterio(criterio.titulo)}: ${ROTULO_CONCEITO_RH[conceito]}`}
                    marcada={marcado === conceito}
                    onMarcar={alterar && (() => editar(criterio.id, conceito))}
                  />
                </td>
              ))}
            </tr>
          )
        })}
      </SecaoTabela>
      <div style={{ marginTop: '4mm' }}>
        <div style={{ fontWeight: 'bold', fontSize: '11pt' }}>Observações:</div>
        <div style={{ minHeight: '18mm', paddingLeft: '10mm' }}>
          <CampoTexto
            id="avaliacao-rh-observacoes"
            rotulo="Observações"
            pergunta="observações da avaliação"
            valor={conteudo.observacoes ?? ''}
            onChange={valor => alterar?.(c => ({ ...c, observacoes: valor }))}
            max={10000}
            compacto
          />
        </div>
      </div>
    </Folha>
  )
}

const arquivoDaAvaliacao = (nome: string) =>
  `avaliacao-rh-${nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'integrante'}.docx`

function Editor({ integrante, rodada, membros, titulos }: { integrante: MembroEquipeOption; rodada: RodadaRh; membros: MembroEquipeOption[]; titulos: TitulosRodadaRh }) {
  const resourceId = recursoAvaliacaoRh(rodada, integrante.id)
  return (
    <FormularioDocumento<AvaliacaoRh>
      tipo="AVALIACAO_RH"
      documento="Avaliação de R.H."
      titulo="Avaliação de Recursos Humanos"
      arquivo={arquivoDaAvaliacao(integrante.name)}
      membros={membros}
      resourceId={resourceId}
      inicial={() => ({ integranteId: integrante.id, integrante: integrante.name, rodada, notaFinal: '', observacoes: '', criterios: {}, cabecalho: {} })}
      normalizar={salvo => ({ ...salvo, integranteId: integrante.id, integrante: integrante.name, rodada, criterios: salvo.criterios ?? {}, cabecalho: salvo.cabecalho ?? {} })}
      render={FolhaAvaliacao}
      topo={(
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href={hrefAvaliacao()} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" />Todas as avaliações</Link>
          <span className="text-sm text-slate-500">{nomeRodadaRh(rodada, titulos)} · {integrante.name}</span>
        </div>
      )}
    />
  )
}

function CartaoAvaliacao({ item, projetoId }: { item: AvaliacaoRhItem; projetoId: string }) {
  const situacao = STATUS[item.status]
  return (
    <li className="documento-ata-card group relative flex items-center gap-3 rounded-xl border p-3 transition">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700" aria-hidden="true">
        <User className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={hrefAvaliacao(item.integranteId, item.rodada)}
          aria-label={`Abrir a avaliação de ${item.integrante}`}
          className="block truncate font-medium text-slate-800 after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-blue-700 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-blue-500"
        >
          {item.integrante}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${situacao.cls}`}>
            <situacao.Icone className="h-3.5 w-3.5" />{situacao.rotulo}
          </span>
          {item.notaFinal && <span>Nota final: {item.notaFinal}</span>}
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        <Tooltip label="Histórico da avaliação">
          <GlassButton
            variant="custom"
            type="button"
            aria-label={`Histórico da avaliação de ${item.integrante}`}
            onClick={() => abrirPropostas(projetoId, recursoAvaliacaoRh(item.rodada, item.integranteId))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <History className="h-4 w-4" />
          </GlassButton>
        </Tooltip>
      </div>
    </li>
  )
}

/**
 * Avaliação de R.H. no modelo do professor: uma avaliação por integrante ativo
 * em cada rodada (1ª AC, 2ª AF e as seguintes, até 10). A lista abre o editor por
 * `?doc=avaliacao-rh&integrante=<id>&rodada=<n>`; o gerente abre a próxima rodada.
 */
export default function AvaliacaoRhDocumento({ projetoId, membros, avaliacoes, rodadas = 2, titulos = {}, permitido }: { projetoId: string; membros: MembroEquipeOption[]; avaliacoes: AvaliacaoRhItem[]; rodadas?: number; titulos?: TitulosRodadaRh; permitido: boolean }) {
  const params = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()
  const [adicionando, setAdicionando] = useState(false)
  const [excluir, setExcluir] = useState<RodadaRh | null>(null)
  const [editando, setEditando] = useState<RodadaRh | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [salvandoTitulo, setSalvandoTitulo] = useState(false)
  const integranteId = params.get('integrante')
  const rodadaParam = Number(params.get('rodada'))
  const rodada: RodadaRh | null = rodadaRhValida(rodadaParam) ? rodadaParam : null
  const integrante = integranteId ? membros.find(m => m.id === integranteId) : undefined

  if (!permitido) {
    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900">Avaliação de R.H.</h2>
          <p className="mt-2 text-sm text-slate-600">Somente o gerente do projeto e administradores podem acessar as avaliações de R.H.</p>
        </div>
      </div>
    )
  }

  if (integrante && rodada) return <Editor integrante={integrante} rodada={rodada} membros={membros} titulos={titulos} />

  const lista = listaRodadasRh(rodadas)
  const porRodada = (r: RodadaRh) => membros.map(m =>
    avaliacoes.find(a => a.integranteId === m.id && a.rodada === r) ?? { integranteId: m.id, integrante: m.name, rodada: r, status: 'NONE' as const, notaFinal: '' },
  )

  async function adicionarRodada() {
    if (adicionando) return
    setAdicionando(true)
    try {
      const resposta = await fetchWithSession(`/api/projects/${projetoId}/avaliacao-rh/rodadas`, { method: 'POST' })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) { toast(dados?.error ?? 'Não foi possível abrir a próxima rodada.', 'error'); return }
      toast(`${tituloRodadaRh(dados.rodadas)} aberta.`, 'success')
      router.refresh()
    } catch {
      toast('Não foi possível abrir a próxima rodada.', 'error')
    } finally {
      setAdicionando(false)
    }
  }

  async function excluirRodada(r: RodadaRh) {
    try {
      const resposta = await fetchWithSession(`/api/projects/${projetoId}/avaliacao-rh/rodadas`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rodada: r }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) { toast(dados?.error ?? 'Não foi possível excluir a rodada.', 'error'); return }
      toast(`${tituloRodadaRh(r)} excluída.`, 'success')
      router.refresh()
    } catch {
      toast('Não foi possível excluir a rodada.', 'error')
    }
  }
  async function salvarTitulo(r: RodadaRh) {
    if (salvandoTitulo) return
    setSalvandoTitulo(true)
    try {
      const resposta = await fetchWithSession(`/api/projects/${projetoId}/avaliacao-rh/rodadas`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rodada: r, titulo: rascunho.trim() }),
      })
      const dados = await resposta.json().catch(() => ({}))
      if (!resposta.ok) { toast(dados?.error ?? 'Não foi possível renomear a rodada.', 'error'); return }
      toast('Título da rodada atualizado.', 'success')
      setEditando(null)
      router.refresh()
    } catch {
      toast('Não foi possível renomear a rodada.', 'error')
    } finally {
      setSalvandoTitulo(false)
    }
  }
  const salvasNaRodada = (r: RodadaRh) => porRodada(r).filter(a => a.status !== 'NONE').length

  return (
    <div className="documento-atas-page px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900">Avaliação de R.H.</h2>
            <p className="mt-0.5 text-sm text-slate-500">Cada integrante ativo é avaliado duas vezes ou mais no semestre, em um documento separado por rodada. O documento segue o modelo do professor e entra no histórico com versões e aprovação.</p>
          </div>
          {lista.length < MAX_RODADAS_RH && (
            <GlassButton variant="primary" type="button" onClick={adicionarRodada} disabled={adicionando} aria-busy={adicionando} className="inline-flex h-9 items-center gap-1.5 px-4 text-sm">
              <Plus className="h-4 w-4" />{adicionando ? 'Abrindo…' : `Adicionar ${tituloRodadaRh(lista.length + 1)}`}
            </GlassButton>
          )}
        </header>

        {membros.length === 0 ? (
          <EmptyState
            className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white"
            icon={<User className="mx-auto mb-4 h-12 w-12 text-slate-300" />}
            heading="Nenhum integrante ativo na equipe"
            subtext="Cadastre a equipe do projeto para abrir as avaliações de cada integrante."
          />
        ) : (
          <div data-testid="avaliacao-rh-rodadas" className="mt-6 flex snap-x gap-5 overflow-x-auto pb-3">
            {lista.map(r => {
              const itens = porRodada(r)
              const concluidas = itens.filter(a => a.status === 'APPROVED').length
              const nome = nomeRodadaRh(r, titulos)
              return (
                <section key={r} className="w-[min(22rem,85vw)] shrink-0 snap-start rounded-xl border border-slate-200 bg-white p-4 lg:w-[calc(50%-0.625rem)]" aria-labelledby={`avaliacao-rh-rodada-${r}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    {editando === r ? (
                      <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={e => { e.preventDefault(); void salvarTitulo(r) }}>
                        <Input
                          autoFocus
                          aria-label={`Título da ${tituloRodadaRh(r)}`}
                          value={rascunho}
                          maxLength={MAX_TITULO_RODADA_RH}
                          placeholder={nomeRodadaRh(r, null)}
                          onChange={e => setRascunho(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') setEditando(null) }}
                          className="h-8 min-w-0 flex-1 px-2 text-sm"
                        />
                        <GlassButton variant="custom" type="submit" disabled={salvandoTitulo} aria-busy={salvandoTitulo} aria-label="Salvar título" className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"><Check className="h-4 w-4" /></GlassButton>
                        <GlassButton variant="custom" type="button" aria-label="Cancelar" onClick={() => setEditando(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></GlassButton>
                      </form>
                    ) : (
                      <h3 id={`avaliacao-rh-rodada-${r}`} className="flex min-w-0 items-center gap-1 font-semibold text-slate-900">
                        <span className="truncate">{nome}</span>
                        <Tooltip label="Renomear a rodada">
                          <GlassButton variant="custom" type="button" aria-label={`Renomear a ${tituloRodadaRh(r)}`} onClick={() => { setRascunho(titulos[String(r)] ?? ''); setEditando(r) }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                            <Pencil className="h-3.5 w-3.5" />
                          </GlassButton>
                        </Tooltip>
                      </h3>
                    )}
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{concluidas} de {itens.length} aprovadas</span>
                      {/* Só a última rodada, da 3ª em diante (AC e AF são fixas), pode ser excluída. */}
                      {r === lista.length && r > MIN_RODADAS_RH && (
                        <Tooltip label={`Excluir a ${tituloRodadaRh(r)}`}>
                          <AnimatedTrashButton effect="button" label={`Excluir a ${tituloRodadaRh(r)}`} onDelete={() => setExcluir(r)} />
                        </Tooltip>
                      )}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {itens.map(item => <CartaoAvaliacao key={item.integranteId} item={item} projetoId={projetoId} />)}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={excluir !== null}
        onClose={() => setExcluir(null)}
        onConfirm={() => { if (excluir !== null) void excluirRodada(excluir) }}
        title={excluir !== null ? `Excluir a ${tituloRodadaRh(excluir)}?` : 'Excluir rodada'}
        message={excluir !== null && salvasNaRodada(excluir) > 0
          ? `Esta rodada tem ${salvasNaRodada(excluir)} ${salvasNaRodada(excluir) === 1 ? 'avaliação salva' : 'avaliações salvas'}. Elas deixam de aparecer na lista, mas as versões ficam preservadas no histórico do projeto. Propostas ainda pendentes são recusadas e rascunhos em andamento são descartados.`
          : 'Esta rodada ainda não tem avaliações salvas. Ela sai da lista e pode ser aberta de novo depois.'}
        confirmLabel="Excluir rodada"
      />
    </div>
  )
}
