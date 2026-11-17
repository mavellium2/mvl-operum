'use client'

import type { CSSProperties, ReactNode } from 'react'
import GlassButton from '@/components/ui/GlassButton'
import { CampoData, CampoPessoa, CampoTexto, Folha, useEditorFolha } from '@/components/documentos/editor/folha'
import type { Risco, RiscosConteudo } from '@/lib/validation/formulariosGP'
import type { MembroEquipeOption } from '../MembroEquipeSelect'
import FormularioDocumento, { type RenderFormulario } from './FormularioDocumento'
import { celulaGP, celulaGPCampo, Escolha, FONTE_FORMULARIO, nomeEFuncao, QuadroFormulario, tabelaGP, TituloFormulario } from './QuadroFormulario'

export const TITULO_RISCOS = 'Formulário para Gerenciamento de Riscos'
export const DOCUMENTO_RISCOS = 'Formulários de Riscos'

type Riscos = { riscos: Risco[] }

const IMPACTO = { 5: 'alto', 4: 'médio/alto', 3: 'médio', 2: 'médio/baixo', 1: 'baixo' } as const
const PROBABILIDADE = { 5: 'alta', 4: 'média/alta', 3: 'média', 2: 'média/baixa', 1: 'baixa' } as const
type Escala = keyof typeof IMPACTO
const NIVEIS: Escala[] = [5, 4, 3, 2, 1]

const novoId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2, 8)}`)
const numeroPadrao = (i: number) => String(i + 1).padStart(2, '0')

export function novoRisco(indice: number): Risco {
  return { id: novoId(), cabecalho: {}, numero: numeroPadrao(indice) }
}

export const riscosInicial = (): Riscos => ({ riscos: [novoRisco(0)] })
export const riscosNormalizado = (salvo: RiscosConteudo): Riscos => ({ riscos: salvo.riscos?.length ? salvo.riscos : [novoRisco(0)] })

const etapa: CSSProperties = { fontWeight: 'bold', fontSize: '10pt', padding: '3mm 0 1px 6mm', fontFamily: FONTE_FORMULARIO }
const B = ({ children }: { children: ReactNode }) => <strong>{children}</strong>

/** Linha de escala 5 a 1 (Impacto/Probabilidade), marcada como no modelo. */
function LinhaEscala({ id, rotulo, valor, nomes, onMarcar }: { id: string; rotulo: string; valor: number | null | undefined; nomes: Record<Escala, string>; onMarcar?: (v: Escala) => void }) {
  return (
    <tr>
      <td style={celulaGP}><B>{rotulo}:</B></td>
      <td style={celulaGP}>
        {NIVEIS.map(n => (
          <Escolha key={n} nome={id} marcado={valor === n} rotulo={`${rotulo} ${n} (${nomes[n]})`} onMarcar={onMarcar && (() => onMarcar(n))}>{`${n} (${nomes[n]})`}</Escolha>
        ))}
      </td>
    </tr>
  )
}

/** Reavaliação: na edição, os números 5 a 1; no documento, "3 – Médio". */
function Reavaliacao({ id, rotulo, valor, nomes, onMarcar }: { id: string; rotulo: string; valor: number | null | undefined; nomes: Record<Escala, string>; onMarcar?: (v: Escala) => void }) {
  const { editavel } = useEditorFolha()
  const nome = valor ? nomes[valor as Escala] : ''
  if (editavel && onMarcar) {
    return <>{NIVEIS.map(n => <Escolha key={n} nome={id} marcado={valor === n} rotulo={`${rotulo} ${n} (${nomes[n]})`} onMarcar={() => onMarcar(n)} compacto>{String(n)}</Escolha>)}</>
  }
  return <>{valor ? `${valor} – ${nome.charAt(0).toUpperCase()}${nome.slice(1)}` : ''}</>
}

function MarcaWbs({ id, marcado, onMudar }: { id: string; marcado: boolean; onMudar?: (v: boolean) => void }) {
  const { editavel } = useEditorFolha()
  const texto = <B>Respostas incluídas na WBS/Cronograma</B>
  if (!editavel || !onMudar) return <span><span aria-hidden="true">{marcado ? '☒' : '☐'}</span> {texto}</span>
  // Caixa de seleção nativa: controle de marcação (permitido fora da base dos campos de texto).
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 rounded px-0.5 transition-colors hover:bg-blue-50 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500">
      <input id={id} type="checkbox" checked={marcado} onChange={e => onMudar(e.target.checked)} className="h-3 w-3 cursor-pointer accent-blue-600" />
      {texto}
    </label>
  )
}

/** Um formulário de risco (uma folha), no modelo "15 Aula GP". */
function FolhaRisco({ risco, indice, total, sistema, versaoPadrao, mudar, remover, edicao }: Omit<RenderFormulario<Riscos>, 'conteudo' | 'alterar'> & {
  risco: Risco; indice: number; total: number
  mudar?: (parcial: Partial<Risco>) => void
  remover?: () => void
}) {
  const p = `risco-${risco.id}`
  const campo = (c: keyof Risco) => (v: string) => mudar?.({ [c]: v })
  const responsavel = nomeEFuncao(risco.responsavel, risco.responsavelFuncao)
  return (
    <div data-risco={risco.id}>
      {remover && (
        <div className="mb-2 flex items-center justify-between gap-2 print:hidden">
          <span className="text-xs font-medium text-slate-500">Risco {indice + 1} de {total}</span>
          <GlassButton variant="ghost" type="button" onClick={remover} disabled={total <= 1} title={total <= 1 ? 'O documento precisa de ao menos um risco.' : undefined}>
            Remover este risco
          </GlassButton>
        </div>
      )}
      <Folha data-testid="risco-folha" rodape={`© ${TITULO_RISCOS}`} numerar={false} style={{ fontFamily: FONTE_FORMULARIO, fontSize: '10pt', gap: 0 }}>
        <TituloFormulario titulo={TITULO_RISCOS} logoUrl={sistema.logoUrl} />
        <div style={{ height: '4mm' }} />
        <QuadroFormulario prefixoId={p} sistema={sistema} cabecalho={risco.cabecalho ?? {}} versaoPadrao={versaoPadrao}
          edicao={edicao && mudar && { ...edicao, onCabecalho: cab => mudar({ cabecalho: cab }) }} />

        <div style={etapa}>1ª Etapa: Identificação do Risco</div>
        <table style={tabelaGP}>
          <colgroup><col style={{ width: '78%' }} /><col style={{ width: '22%' }} /></colgroup>
          <tbody>
            <tr>
              <td style={celulaGPCampo}>
                <div className="flex items-start" style={{ paddingLeft: 5 }}><B>Denominação do risco:</B>&nbsp;<div style={{ flex: 1 }}><CampoTexto id={`${p}-denominacao`} rotulo="Denominação do risco" ajuda="Nome curto do risco (ex.: Atualização de alguma dependência do projeto)." pergunta="nome do risco" valor={risco.denominacao ?? ''} onChange={campo('denominacao')} max={500} linha compacto /></div></div>
              </td>
              <td style={celulaGPCampo}>
                <div className="flex items-start" style={{ paddingLeft: 5 }}><B>Risco Nº</B>&nbsp;<div style={{ flex: 1 }}><CampoTexto id={`${p}-numero`} rotulo="Número do risco" ajuda="Número do risco no projeto (01, 02…)." pergunta={numeroPadrao(indice)} valor={risco.numero ?? ''} onChange={campo('numero')} max={20} linha compacto /></div></div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ ...celulaGPCampo, height: '20mm' }}>
                <div style={{ padding: '1px 5px 0' }}><B>Descrição do risco:</B></div>
                <CampoTexto id={`${p}-descricao`} rotulo="Descrição do risco" ajuda="O que pode acontecer e qual o efeito no projeto." pergunta="o que pode acontecer e qual o efeito?" valor={risco.descricao ?? ''} onChange={campo('descricao')} alinhamento="justify" max={20000} />
              </td>
            </tr>
          </tbody>
        </table>

        <div style={etapa}>2ª Etapa: Avaliação do Risco</div>
        <table style={tabelaGP}>
          <colgroup><col style={{ width: '17%' }} /><col style={{ width: '83%' }} /></colgroup>
          <tbody>
            <LinhaEscala id={`${p}-impacto`} rotulo="Impacto" valor={risco.impacto} nomes={IMPACTO} onMarcar={mudar && (v => mudar({ impacto: v }))} />
            <LinhaEscala id={`${p}-probabilidade`} rotulo="Probabilidade" valor={risco.probabilidade} nomes={PROBABILIDADE} onMarcar={mudar && (v => mudar({ probabilidade: v }))} />
          </tbody>
        </table>

        <div style={etapa}>3ª Etapa: Desenvolvimento da Resposta</div>
        <table style={tabelaGP}>
          <colgroup><col style={{ width: '50%' }} /><col style={{ width: '50%' }} /></colgroup>
          <tbody>
            <tr>
              <td colSpan={2} style={{ ...celulaGPCampo, height: '24mm' }}>
                <div style={{ padding: '1px 5px 0' }}><B>Estratégias para eliminar ou reduzir este risco (minimizar impacto e/ou probabilidade):</B></div>
                <CampoTexto id={`${p}-estrategias`} rotulo="Estratégias" ajuda="O que será feito para eliminar o risco ou reduzir o impacto e a probabilidade." pergunta="o que será feito para reduzir o risco?" valor={risco.estrategias ?? ''} onChange={campo('estrategias')} alinhamento="justify" max={20000} />
              </td>
            </tr>
            <tr>
              <td style={celulaGP}>
                <B>Responsável:</B>{' '}
                {edicao && mudar ? (
                  <CampoPessoa id={`${p}-responsavel`} rotulo="Responsável" ajuda="Membro da equipe que cuida deste risco; a função sai ao lado do nome."
                    projetoId={edicao.projetoId} membros={edicao.membros} valorId={risco.responsavelUserId} nome={responsavel}
                    onChange={m => mudar({ responsavel: m?.name ?? '', responsavelUserId: m?.id ?? null, responsavelFuncao: m?.setor ?? '' })} />
                ) : responsavel}
              </td>
              <td style={celulaGP}>
                <B>Data de Conclusão:</B>{' '}
                <CampoData id={`${p}-conclusao`} rotulo="Data de conclusão" ajuda="Quando a resposta ao risco foi (ou será) concluída." valor={risco.dataConclusao ?? ''} onChange={mudar ? campo('dataConclusao') : () => {}} />
              </td>
            </tr>
            <tr>
              <td style={celulaGPCampo}>
                <div style={{ padding: '1px 5px 0' }}><B>Impacto reavaliado:</B> <Reavaliacao id={`${p}-impacto-r`} rotulo="Impacto reavaliado" valor={risco.impactoReavaliado} nomes={IMPACTO} onMarcar={mudar && (v => mudar({ impactoReavaliado: v }))} /></div>
                <CampoTexto id={`${p}-just-impacto`} rotulo="Por que o impacto mudou" ajuda="Explique o impacto depois da resposta ao risco." pergunta="por que o impacto mudou?" valor={risco.justificativaImpacto ?? ''} onChange={campo('justificativaImpacto')} alinhamento="justify" max={5000} compacto />
              </td>
              <td style={celulaGPCampo}>
                <div style={{ padding: '1px 5px 0' }}><B>Probabilidade reavaliada:</B> <Reavaliacao id={`${p}-prob-r`} rotulo="Probabilidade reavaliada" valor={risco.probabilidadeReavaliada} nomes={PROBABILIDADE} onMarcar={mudar && (v => mudar({ probabilidadeReavaliada: v }))} /></div>
                <CampoTexto id={`${p}-just-prob`} rotulo="Por que a probabilidade mudou" ajuda="Explique a probabilidade depois da resposta ao risco." pergunta="por que a probabilidade mudou?" valor={risco.justificativaProbabilidade ?? ''} onChange={campo('justificativaProbabilidade')} alinhamento="justify" max={5000} compacto />
              </td>
            </tr>
          </tbody>
        </table>

        <div style={etapa}>4ª Etapa: Acompanhamento do Risco</div>
        <table style={tabelaGP}>
          <tbody>
            <tr>
              <td style={{ ...celulaGPCampo, height: '24mm' }}>
                <div style={{ padding: '1px 5px 0' }}><B>Ocorrências e alterações:</B></div>
                <CampoTexto id={`${p}-ocorrencias`} rotulo="Ocorrências e alterações" ajuda="O que aconteceu com o risco ao longo do projeto e o que mudou na resposta." pergunta="o que aconteceu e o que mudou?" valor={risco.ocorrencias ?? ''} onChange={campo('ocorrencias')} alinhamento="justify" max={20000} />
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ height: '4mm' }} />
        <table style={tabelaGP}>
          <colgroup><col style={{ width: '45%' }} /><col style={{ width: '55%' }} /></colgroup>
          <tbody>
            <tr>
              <td style={celulaGP}><MarcaWbs id={`${p}-wbs`} marcado={!!risco.respostasNaWbs} onMudar={mudar && (v => mudar({ respostasNaWbs: v }))} /></td>
              <td style={celulaGPCampo}>
                <div className="flex items-start" style={{ paddingLeft: 5 }}><B>Registros adicionais:</B>&nbsp;<div style={{ flex: 1 }}><CampoTexto id={`${p}-registros`} rotulo="Registros adicionais" ajuda="Onde estão os registros extras (ex.: Verso ou Anexos)." pergunta="Verso ou Anexos" valor={risco.registrosAdicionais ?? ''} onChange={campo('registrosAdicionais')} max={500} linha compacto /></div></div>
              </td>
            </tr>
          </tbody>
        </table>
      </Folha>
    </div>
  )
}

export function FolhasRiscos({ conteudo, alterar, ...resto }: RenderFormulario<Riscos>) {
  const total = conteudo.riscos.length
  return (
    <div data-testid="riscos-folhas" style={{ display: 'flex', flexDirection: 'column', gap: '8mm' }}>
      {conteudo.riscos.map((risco, i) => (
        <FolhaRisco key={risco.id} risco={risco} indice={i} total={total} {...resto}
          mudar={alterar && (parcial => alterar(c => ({ riscos: c.riscos.map(r => (r.id === risco.id ? { ...r, ...parcial } : r)) })))}
          remover={alterar && (() => alterar(c => (c.riscos.length > 1 ? { riscos: c.riscos.filter(r => r.id !== risco.id) } : c)))} />
      ))}
    </div>
  )
}

const renderizar = (r: RenderFormulario<Riscos>) => <FolhasRiscos {...r} />
const normalizar = (salvo: Riscos) => riscosNormalizado(salvo)
const adicionar = (alterar: (fn: (c: Riscos) => Riscos) => void) => {
  alterar(c => ({ riscos: [...c.riscos, novoRisco(c.riscos.length)] }))
  requestAnimationFrame(() => document.querySelector('[data-risco]:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

/**
 * Formulários de Riscos: como as Atas, vários formulários no mesmo documento
 * (um por folha), cada um com quem elaborou e o responsável pelo risco.
 * "Adicionar" (grupo Edição) inclui um risco novo.
 */
export default function FormulariosRiscos({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  return (
    <FormularioDocumento<Riscos>
      tipo="RISCOS" documento={DOCUMENTO_RISCOS} titulo={TITULO_RISCOS} arquivo="formularios-de-riscos.docx"
      membros={membros} inicial={riscosInicial} normalizar={normalizar} render={renderizar} adicionar={adicionar}
    />
  )
}
