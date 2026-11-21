'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock, FileText, History, User, XCircle } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import EmptyState from '@/components/ui/EmptyState'
import Tooltip from '@/components/ui/Tooltip'
import { Input } from '@/components/ui/Field'
import { CampoData, CampoTexto, Folha, SecaoTabela, useEditorFolha } from '@/components/documentos/editor/folha'
import { abrirPropostas } from '@/hooks/useVersoesDocumento'
import {
  CONCEITOS_RH, CRITERIOS_RH, RODADAS_RH, ROTULO_CONCEITO_RH, recursoAvaliacaoRh, type ConceitoRh,
} from '@/lib/avaliacaoRh'
import type { AvaliacaoRh } from '@/lib/validation/formulariosGP'
import type { MembroEquipeOption } from '../MembroEquipeSelect'
import FormularioDocumento, { type RenderFormulario } from './FormularioDocumento'
import { celulaGP, celulaGPCampo, FONTE_FORMULARIO, QuadroFormulario, tabelaGP, TituloFormulario } from './QuadroFormulario'

type Situacao = 'APPROVED' | 'PENDING' | 'REJECTED' | 'NONE'
export interface AvaliacaoRhItem { integranteId: string; integrante: string; rodada: 1 | 2; status: Situacao; notaFinal: string }

const STATUS: Record<Situacao, { rotulo: string; cls: string; Icone: typeof CheckCircle2 }> = {
  APPROVED: { rotulo: 'Aprovada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icone: CheckCircle2 },
  PENDING: { rotulo: 'Aguardando aprovação', cls: 'bg-amber-50 text-amber-800 ring-amber-200', Icone: Clock },
  REJECTED: { rotulo: 'Versão rejeitada', cls: 'bg-red-50 text-red-700 ring-red-200', Icone: XCircle },
  NONE: { rotulo: 'Não iniciada', cls: 'bg-slate-100 text-slate-600 ring-slate-200', Icone: FileText },
}

const hrefAvaliacao = (integranteId?: string, rodada?: 1 | 2) =>
  `?doc=avaliacao-rh${integranteId && rodada ? `&integrante=${encodeURIComponent(integranteId)}&rodada=${rodada}` : ''}`

/** Nome do critério sem o marcador e os dois-pontos do modelo, para rótulos acessíveis. */
const nomeDoCriterio = (titulo: string) => titulo.replace(/^-\s*/, '').replace(/:$/, '')

/** Rádio na edição; "X" no documento, como no modelo. */
function Marca({ nome, rotulo, marcada, onMarcar }: { nome: string; rotulo: string; marcada: boolean; onMarcar?: () => void }) {
  const { editavel } = useEditorFolha()
  if (!editavel || !onMarcar) return <span aria-label={rotulo}>{marcada ? 'X' : ''}</span>
  // Rádio nativo: controle de escolha (permitido fora da base dos campos de texto).
  return (
    <label className="flex h-full w-full cursor-pointer items-center justify-center transition-colors hover:bg-blue-50 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500">
      <input type="radio" name={nome} checked={marcada} onChange={onMarcar} aria-label={rotulo} className="h-3 w-3 cursor-pointer accent-blue-600" />
    </label>
  )
}

/**
 * Folha do modelo "15 - Avaliação R.H.": quadro de identificação, participante
 * e rodada, os 12 critérios com as frases do modelo e uma marca por critério,
 * observações, nota final e data.
 */
export function FolhaAvaliacao({ conteudo, sistema, versaoPadrao, alterar, edicao }: RenderFormulario<AvaliacaoRh>) {
  const editar = (id: string, valor: ConceitoRh) =>
    alterar?.(atual => ({ ...atual, criterios: { ...atual.criterios, [id]: valor } }))
  return (
    <Folha data-testid="avaliacao-rh-folha" style={{ fontFamily: FONTE_FORMULARIO, fontSize: '9pt', gap: '3mm' }}>
      <TituloFormulario titulo="AVALIAÇÃO DE RECURSOS HUMANOS" logoUrl={sistema.logoUrl} />
      <QuadroFormulario
        testId="avaliacao-rh-quadro"
        prefixoId="avaliacao-rh"
        sistema={sistema}
        cabecalho={conteudo.cabecalho ?? {}}
        versaoPadrao={versaoPadrao}
        edicao={edicao && { ...edicao, onCabecalho: cab => alterar?.(c => ({ ...c, cabecalho: cab })) }}
      />
      <table style={tabelaGP}>
        <tbody>
          <tr>
            <td style={celulaGP}><b>Participante:</b> {conteudo.integrante}</td>
            <td style={celulaGP}><b>Avaliação:</b> {conteudo.rodada === 1 ? '1ª Avaliação (AC)' : '2ª Avaliação (AF)'}</td>
          </tr>
        </tbody>
      </table>
      <SecaoTabela
        semFaixa
        titulo="Critérios de avaliação"
        testId="avaliacao-rh-criterios"
        colunas={[
          { rotulo: 'Critério', largura: '58%' },
          ...CONCEITOS_RH.map(c => ({ rotulo: ROTULO_CONCEITO_RH[c], largura: '10.5%', alinhamento: 'center' as const })),
        ]}
        estiloCabecalho={{ fontSize: '9pt', padding: '1px 5px', fontWeight: 'bold', background: '#e7e6e6' }}
      >
        {CRITERIOS_RH.map(criterio => {
          const marcado = conteudo.criterios?.[criterio.id] ?? null
          const verticalAlign = criterio.marcaNoTopo ? 'top' : 'middle'
          return (
            <tr key={criterio.id} style={{ breakInside: 'avoid' }}>
              <td style={celulaGP}>
                <div style={{ fontWeight: 'bold' }}>{criterio.titulo}</div>
                <div>{criterio.descricao}</div>
                <div style={{ paddingLeft: criterio.recuoFrases === 'maior' ? '6mm' : '3mm', marginTop: '1mm' }}>
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
      <table style={tabelaGP}>
        <tbody>
          <tr>
            <td style={{ ...celulaGPCampo, width: '72%' }}>
              <div style={{ padding: '1px 5px', fontWeight: 'bold' }}>Observações:</div>
              <div style={{ minHeight: '18mm' }}>
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
            </td>
            <td style={{ ...celulaGP, width: '28%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
                <b>Nota final:</b>
                {alterar
                  ? <Input aria-label="Nota final" value={conteudo.notaFinal ?? ''} onChange={e => alterar(c => ({ ...c, notaFinal: e.target.value }))} className="w-24 text-center" />
                  : <strong>{conteudo.notaFinal || '—'}</strong>}
              </div>
              <div style={{ marginTop: '2mm' }}>
                <b>Data:</b>{' '}
                <CampoData
                  id="avaliacao-rh-data"
                  rotulo="Data da avaliação"
                  valor={conteudo.data ?? ''}
                  onChange={valor => alterar?.(c => ({ ...c, data: valor }))}
                />
              </div>
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={celulaGP}><b>Gerente do projeto:</b> {sistema.gerente.nome || 'Nenhum gerente definido no projeto.'}</td>
          </tr>
        </tbody>
      </table>
    </Folha>
  )
}

const arquivoDaAvaliacao = (nome: string) =>
  `avaliacao-rh-${nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'integrante'}.docx`

function Editor({ integrante, rodada, membros }: { integrante: MembroEquipeOption; rodada: 1 | 2; membros: MembroEquipeOption[] }) {
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
      topo={<Link href={hrefAvaliacao()} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"><ArrowLeft className="h-4 w-4" />Todas as avaliações</Link>}
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
 * em cada rodada (AC e AF). A lista abre o editor por
 * `?doc=avaliacao-rh&integrante=<id>&rodada=<1|2>`.
 */
export default function AvaliacaoRhDocumento({ projetoId, membros, avaliacoes, permitido }: { projetoId: string; membros: MembroEquipeOption[]; avaliacoes: AvaliacaoRhItem[]; permitido: boolean }) {
  const params = useSearchParams()
  const integranteId = params.get('integrante')
  const rodadaParam = Number(params.get('rodada'))
  const rodada: 1 | 2 | null = rodadaParam === 1 || rodadaParam === 2 ? rodadaParam : null
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

  if (integrante && rodada) return <Editor integrante={integrante} rodada={rodada} membros={membros} />

  const porRodada = (r: 1 | 2) => membros.map(m =>
    avaliacoes.find(a => a.integranteId === m.id && a.rodada === r) ?? { integranteId: m.id, integrante: m.name, rodada: r, status: 'NONE' as const, notaFinal: '' },
  )

  return (
    <div className="documento-atas-page px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header>
          <h2 className="text-xl font-bold text-slate-900">Avaliação de R.H.</h2>
          <p className="mt-0.5 text-sm text-slate-500">Uma avaliação por integrante ativo em cada rodada. O documento segue o modelo do professor e entra no histórico com versões e aprovação.</p>
        </header>

        {membros.length === 0 ? (
          <EmptyState
            className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white"
            icon={<User className="mx-auto mb-4 h-12 w-12 text-slate-300" />}
            heading="Nenhum integrante ativo na equipe"
            subtext="Cadastre a equipe do projeto para abrir as avaliações de cada integrante."
          />
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {RODADAS_RH.map(({ rodada: r, titulo, sigla }) => {
              const itens = porRodada(r)
              const concluidas = itens.filter(a => a.status === 'APPROVED').length
              return (
                <section key={r} className="rounded-xl border border-slate-200 bg-white p-4" aria-labelledby={`avaliacao-rh-rodada-${r}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 id={`avaliacao-rh-rodada-${r}`} className="font-semibold text-slate-900">{titulo} ({sigla})</h3>
                    <span className="text-xs text-slate-500">{concluidas} de {itens.length} aprovadas</span>
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
    </div>
  )
}
