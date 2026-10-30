'use client'

import { forwardRef } from 'react'
import type { MembroEquipeOption } from './documentacao/MembroEquipeSelect'
import { formatTelefone } from '@/lib/contato'
import {
  CampoAutomatico, CampoData, CampoPessoa, CampoTexto, Folha, LinhaLista, SecaoTabela, useEditorFolha,
} from '@/components/documentos/editor/folha'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjetoHeader {
  categoria: string
  nomeProjeto: string
  gerenteProjeto: string
  elaboradoPor: string
  aprovadoPor: string
  versao: string
  dataCriacao: string
  dataAprovacao: string
  logoUrl?: string | null
  signatureUrl?: string | null
}

export interface Stakeholder {
  ref: string
  nome: string
  empresaEquipe: string
  cargoCompetencia: string
  email: string
  telefoneFax: string
  endereco: string
  observacoes?: string
  /** Stakeholder inativo: a linha sai em vermelho (card de 07/10). */
  inativo?: boolean
  /** Motivo informado ao inativar; aparece na Observação. */
  motivoInativo?: string
}

/** Texto da coluna Observação: o motivo da inativação vem antes das observações livres. */
export function observacaoDaLinha(s: Stakeholder): string {
  const motivo = s.inativo ? `Inativo${s.motivoInativo ? `: ${s.motivoInativo}` : ''}` : ''
  return [motivo, s.observacoes ?? ''].filter(Boolean).join('\n')
}

export type CampoStakeholder = 'nome' | 'empresaEquipe' | 'cargoCompetencia' | 'email' | 'telefoneFax' | 'endereco' | 'observacoes'

/** Ligações da folha com o estado do editor (só usadas dentro do EditorDocumento). */
export interface EdicaoStakeholders {
  projetoId: string
  membros: MembroEquipeOption[]
  onCriarMembro: (membro: MembroEquipeOption) => void
  elaboradoPorUserId: string | null
  onElaboradoPor: (membro: MembroEquipeOption | null) => void
  onVersao: (versao: string) => void
  dataAprovacaoRaw: string
  onDataAprovacao: (data: string) => void
  onCelula: (indice: number, campo: CampoStakeholder, valor: string) => void
  onAdicionar: () => void
  onRemover: (indice: number) => void
}

interface Props {
  header: ProjetoHeader
  stakeholders: Stakeholder[]
  edicao?: EdicaoStakeholders
  /** "Adicionar parte interessada" como menu (interno ou externo, cadastro de Stakeholders). */
  menuAdicionar?: { opcoes: { rotulo: string; descricao?: string; onClick: () => void }[]; aberto: boolean; onAbrir: (aberto: boolean) => void }
}

export const TITULO_STAKEHOLDERS = 'Formulário de Stakeholder – Partes Interessadas'
/** Margens menores que os demais documentos: cabe mais gente em cada página. */
export const MARGEM_STAKEHOLDERS_MM = { top: 8, x: 8 } as const

const BORDA = '1px solid #000'
const FONTE = 'Calibri, Carlito, Arial, Helvetica, sans-serif'
/** Células como no modelo "03_Form Stakeholders": linhas finas e pouco espaço interno. */
const cel: React.CSSProperties = { border: BORDA, padding: '0 4px', verticalAlign: 'top', textAlign: 'left', fontSize: '9pt', lineHeight: 1.25, fontWeight: 'normal' }
const celCampo: React.CSSProperties = { ...cel, padding: 0 }
const B = ({ children }: { children: React.ReactNode }) => <strong>{children}</strong>

const COLUNAS: { campo: CampoStakeholder | 'ref'; rotulo: string; largura: string; ajuda?: string; pergunta?: string }[] = [
  { campo: 'ref', rotulo: 'Ref.', largura: '3%' },
  { campo: 'nome', rotulo: 'Nome', largura: '11%', ajuda: 'Nome da pessoa ou da organização interessada no projeto.', pergunta: 'nome' },
  { campo: 'empresaEquipe', rotulo: 'Empresa/Equipe', largura: '10%', ajuda: 'Empresa, instituição ou equipe a que pertence.', pergunta: 'empresa' },
  { campo: 'cargoCompetencia', rotulo: 'Cargo/Competência', largura: '11%', ajuda: 'Cargo ou papel no projeto.', pergunta: 'cargo' },
  { campo: 'email', rotulo: 'e-mail', largura: '21%', ajuda: 'E-mail de contato (validado ao salvar a versão).', pergunta: 'e-mail' },
  { campo: 'telefoneFax', rotulo: 'Telefone/Fax', largura: '10%', ajuda: 'Telefone com DDD, no formato (00) 00000-0000.', pergunta: '(00) 00000-0000' },
  { campo: 'endereco', rotulo: 'Endereço', largura: '14%', ajuda: 'Endereço de contato, se houver.', pergunta: 'endereço' },
  { campo: 'observacoes', rotulo: 'Observações', largura: '20%', ajuda: 'Observações sobre a parte interessada (ex.: horário de atendimento).', pergunta: 'observações' },
]

const nada = () => {}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Formulário de Partes Interessadas no layout do modelo "03_Form Stakeholders"
 * (A4 paisagem, margens reduzidas). Dentro do EditorDocumento as células são
 * editadas direto na folha; fora dele (PDF) sai só o texto.
 */
const StakeholderDocument = forwardRef<HTMLDivElement, Props>(
  function StakeholderDocument({ header, stakeholders, edicao, menuAdicionar }, ref) {
    const { editavel } = useEditorFolha()
    const ed = edicao
    const aprovador = header.aprovadoPor || header.gerenteProjeto
    return (
      <Folha ref={ref} paisagem margemMm={MARGEM_STAKEHOLDERS_MM} data-testid="stakeholders-folha" style={{ gap: '4mm', fontFamily: FONTE }}>
        {/* Logo à esquerda e título centralizado na página (coluna vazia da mesma largura à direita). */}
        <div style={{ display: 'flex', alignItems: 'center', minHeight: '22mm' }}>
          <div style={{ width: '40mm', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            {header.logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={header.logoUrl} alt="Logo do projeto" style={{ maxHeight: '24mm', maxWidth: '36mm', objectFit: 'contain' }} />
              : editavel
                ? <div style={{ width: '33mm', height: '19mm', border: '1px solid #4a6fa5', background: '#9db7e0', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: '11pt', lineHeight: 1.15 }}>Logo do<br />Projeto</div>
                : null}
          </div>
          <h1 style={{ flex: 1, margin: 0, textAlign: 'center', fontFamily: 'Arial, Arimo, Helvetica, sans-serif', fontSize: '15pt', fontWeight: 'bold' }}>{TITULO_STAKEHOLDERS}</h1>
          <div aria-hidden="true" style={{ width: '40mm', flexShrink: 0 }} />
        </div>

        {/* Quadro de identificação */}
        <table data-testid="quadro-identificacao" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: '77%' }} /><col style={{ width: '23%' }} /></colgroup>
          <tbody>
            <tr><td colSpan={2} style={{ ...celCampo, background: '#bfbfbf', fontWeight: 'bold' }}><CampoAutomatico padding="0 4px">{header.categoria}</CampoAutomatico></td></tr>
            <tr><td colSpan={2} style={celCampo}><CampoAutomatico padding="0 4px"><B>Nome do projeto:</B> {header.nomeProjeto}</CampoAutomatico></td></tr>
            <tr><td colSpan={2} style={celCampo}><CampoAutomatico padding="0 4px" origem="Automático: vem do gerente do projeto"><B>Gerente do projeto:</B> {header.gerenteProjeto}</CampoAutomatico></td></tr>
            <tr>
              <td colSpan={2} style={cel}>
                <B>Elaborado por:</B>{' '}
                <CampoPessoa
                  id="ds-elaborado-por" rotulo="Elaborado por" ajuda="Quem montou este documento. Escolha um membro da equipe."
                  projetoId={ed?.projetoId ?? ''} membros={ed?.membros ?? []} valorId={ed?.elaboradoPorUserId} nome={header.elaboradoPor}
                  onChange={ed?.onElaboradoPor ?? nada} onCriarMembro={ed?.onCriarMembro}
                />
              </td>
            </tr>
            <tr>
              <td style={celCampo}><CampoAutomatico padding="0 4px" origem="Automático: o aprovador é sempre o gerente do projeto"><B>Aprovado por:</B> {aprovador}</CampoAutomatico></td>
              <td style={celCampo}>
                {editavel
                  ? <div className="flex items-start" style={{ paddingLeft: 4 }}><B>Versão:</B>&nbsp;<div className="flex-1"><CampoTexto compacto id="ds-versao" rotulo="Versão" ajuda="Número desta versão do documento (ex.: 1.0, 1.1)." pergunta="1.0" valor={header.versao} onChange={ed?.onVersao ?? nada} max={20} linha /></div></div>
                  : <div style={{ padding: '0 4px' }}><B>Versão:</B> {header.versao}</div>}
              </td>
            </tr>
            <tr>
              <td style={cel}>
                <B>Assinatura:</B>{' '}
                {header.signatureUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={header.signatureUrl} alt="Assinatura" style={{ maxHeight: '10mm', maxWidth: '50mm', objectFit: 'contain', verticalAlign: 'middle' }} />
                  : editavel ? <span style={{ color: '#64748b' }}>entra quando o gerente aprovar</span> : null}
              </td>
              <td style={{ ...cel, whiteSpace: 'nowrap' }}>
                <B>Data de aprovação:</B>{' '}
                {editavel
                  ? <CampoData id="ds-data-aprovacao" rotulo="Data de aprovação" ajuda="Dia em que o gerente aprovou esta versão." valor={ed?.dataAprovacaoRaw ?? ''} onChange={ed?.onDataAprovacao ?? nada} />
                  : header.dataAprovacao}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Partes interessadas */}
        <div>
          <SecaoTabela
            testId="tabela-partes-interessadas"
            semFaixa
            titulo="Partes interessadas"
            colunas={COLUNAS.map(c => ({ rotulo: c.campo === 'email' ? <em style={{ fontWeight: 'normal' }}>{c.rotulo}</em> : c.rotulo, largura: c.largura }))}
            estiloCabecalho={{ background: '#e7e6e6', fontWeight: 'normal', textAlign: 'center', padding: '0 3px', fontSize: '9pt' }}
            onAdicionar={ed?.onAdicionar}
            menuAdicionar={menuAdicionar}
            rotuloAdicionar="Adicionar parte interessada"
          >
            {stakeholders.length === 0 && !editavel && (
              <tr><td colSpan={COLUNAS.length} style={{ ...cel, color: '#6b7280', fontStyle: 'italic' }}>Nenhuma parte interessada cadastrada.</td></tr>
            )}
            {stakeholders.map((s, i) => (
              <LinhaLista key={`${s.ref}-${i}`} onRemover={ed ? () => ed.onRemover(i) : undefined} rotuloRemover={`Remover ${s.nome || `linha ${i + 1}`} desta versão`} style={s.inativo ? { color: '#b91c1c' } : undefined} data-inativo={s.inativo ? 'true' : undefined}>
                {COLUNAS.map(c => {
                  if (c.campo === 'ref') return <td key={c.campo} style={cel}>{s.ref}</td>
                  const campo = c.campo
                  // Observação: o motivo da inativação vem antes, como no PDF. Telefone sempre formatado.
                  const bruto = campo === 'observacoes' && !editavel ? observacaoDaLinha(s) : (s[campo] ?? '')
                  const valor = campo === 'telefoneFax' ? formatTelefone(bruto) : bruto
                  return (
                    <td key={campo} style={{ ...celCampo, overflowWrap: 'anywhere' }}>
                      <CampoTexto
                        id={`ds-${i}-${campo}`} rotulo={c.rotulo} ajuda={c.ajuda} pergunta={c.pergunta} alinhamento="center"
                        valor={valor} onChange={v => ed?.onCelula(i, campo, v)} max={campo === 'observacoes' ? 500 : 200}
                        linha={campo === 'email' || campo === 'telefoneFax'} celulaDeTabela compacto
                      />
                    </td>
                  )
                })}
              </LinhaLista>
            ))}
          </SecaoTabela>
        </div>
      </Folha>
    )
  }
)

export default StakeholderDocument
