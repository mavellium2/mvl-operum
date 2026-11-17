'use client'

import type { CSSProperties, ReactNode } from 'react'
import { linhaOuAviso } from '@/lib/linhaInstitucional'
import AssinaturaEmLinha from '@/components/documentos/AssinaturaEmLinha'
import { CampoAutomatico, CampoData, CampoPessoa, CampoTexto, useEditorFolha } from '@/components/documentos/editor/folha'
import type { MembroEquipeOption } from '../MembroEquipeSelect'
import type { CabecalhoFormulario } from '@/lib/validation/formulariosGP'

/** Dados do sistema comuns aos formulários de GP (rota `/formularios`). */
export interface SistemaFormulario {
  nomeProjeto: string
  instituicao: string
  logoUrl: string | null
  gerente: { nome: string; assinaturaUrl: string | null }
}

/** Ligações do quadro com o editor (só dentro do EditorDocumento). */
export interface EdicaoQuadro {
  projetoId: string
  membros: MembroEquipeOption[]
  onCabecalho: (cabecalho: CabecalhoFormulario) => void
}

export const FONTE_FORMULARIO = 'Calibri, Carlito, Arial, Helvetica, sans-serif'
const borda = '1px solid #000'
/** Célula do modelo das aulas de GP: borda fina, Calibri 10 pt. */
export const celulaGP: CSSProperties = { border: borda, padding: '1px 5px', verticalAlign: 'top', fontSize: '10pt', lineHeight: 1.3, textAlign: 'left', fontWeight: 'normal', fontFamily: FONTE_FORMULARIO }
export const celulaGPCampo: CSSProperties = { ...celulaGP, padding: 0 }
export const tabelaGP: CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }
const B = ({ children }: { children: ReactNode }) => <strong>{children}</strong>
const nada = () => {}

/** "Nome – Função" como no modelo ("<nome e função>"). */
export const nomeEFuncao = (nome?: string, funcao?: string) => [nome?.trim(), funcao?.trim()].filter(Boolean).join(' – ')

/** Logo do projeto à esquerda e título ao lado, como nos modelos (14, 15 e 20 Aula GP). */
export function TituloFormulario({ titulo, logoUrl }: { titulo: string; logoUrl?: string | null }) {
  const { editavel } = useEditorFolha()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6mm', minHeight: '20mm' }}>
      <div style={{ width: '32mm', height: '20mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="Logo do projeto" style={{ maxHeight: '20mm', maxWidth: '32mm', objectFit: 'contain' }} />
          : editavel
            ? <div style={{ width: '30mm', height: '18mm', border: '1px solid #4a6fa5', background: '#9db7e0', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: '11pt', lineHeight: 1.15 }}>Logo do<br />Projeto</div>
            : null}
      </div>
      <h1 style={{ flex: 1, margin: 0, textAlign: 'center', fontFamily: 'Arial, Arimo, Helvetica, sans-serif', fontSize: '15pt', fontWeight: 'bold', lineHeight: 1.2 }}>{titulo}</h1>
      {/* Espaço do mesmo tamanho do logo: o título fica no centro da folha, não do que sobra ao lado do logo. */}
      <div aria-hidden="true" style={{ width: '32mm', flexShrink: 0 }} />
    </div>
  )
}

/**
 * Quadro de identificação dos modelos de GP: faixa cinza com a instituição,
 * nome e gerente do projeto (sistema), Elaborado por (membro e função) e
 * Versão, Aprovado por (gerente), Assinatura e Data de aprovação.
 */
export function QuadroFormulario({ sistema, cabecalho, versaoPadrao, edicao, prefixoId = 'form', testId }: {
  sistema: SistemaFormulario
  cabecalho: CabecalhoFormulario
  /** Versão exibida quando o campo está vazio (ex.: a vigente). */
  versaoPadrao: string
  edicao?: EdicaoQuadro
  /** Prefixo dos ids dos campos (mais de um quadro na mesma tela, como nos Riscos). */
  prefixoId?: string
  testId?: string
}) {
  const { editavel } = useEditorFolha()
  const ed = edicao
  const mudar = (parcial: Partial<CabecalhoFormulario>) => ed?.onCabecalho({ ...cabecalho, ...parcial })
  const gerente = sistema.gerente.nome
  const elaborado = nomeEFuncao(cabecalho.elaboradoPor, cabecalho.funcao)
  return (
    <table data-testid={testId} style={tabelaGP}>
      <colgroup><col style={{ width: '58%' }} /><col style={{ width: '19%' }} /><col style={{ width: '23%' }} /></colgroup>
      <tbody>
        <tr><td colSpan={3} style={{ ...celulaGPCampo, background: '#bfbfbf', fontWeight: 'bold' }}><CampoAutomatico padding="1px 5px">{linhaOuAviso(sistema.instituicao)}</CampoAutomatico></td></tr>
        <tr><td colSpan={3} style={celulaGPCampo}><CampoAutomatico padding="1px 5px"><B>Nome do projeto:</B> {sistema.nomeProjeto}</CampoAutomatico></td></tr>
        <tr><td colSpan={3} style={celulaGPCampo}><CampoAutomatico padding="1px 5px"><B>Gerente do projeto:</B> {gerente || 'Nenhum gerente definido no projeto.'}</CampoAutomatico></td></tr>
        <tr>
          <td colSpan={2} style={celulaGP}>
            <B>Elaborado por:</B>{' '}
            {editavel ? (
              <CampoPessoa
                id={`${prefixoId}-elaborado-por`} rotulo="Elaborado por" ajuda="Quem preencheu este documento. Escolha um membro da equipe; a função dele sai ao lado do nome."
                projetoId={ed?.projetoId ?? ''} membros={ed?.membros ?? []} valorId={cabecalho.elaboradoPorUserId} nome={elaborado}
                onChange={m => mudar({ elaboradoPor: m?.name ?? '', elaboradoPorUserId: m?.id ?? null, funcao: m?.setor ?? '' })}
              />
            ) : elaborado}
          </td>
          <td style={celulaGPCampo}>
            {editavel
              ? <div className="flex items-start" style={{ paddingLeft: 5 }}><B>Versão:</B>&nbsp;<div className="flex-1"><CampoTexto id={`${prefixoId}-versao`} rotulo="Versão" ajuda="Número desta versão do documento (ex.: 1.0, 1.1)." pergunta={versaoPadrao} valor={cabecalho.versao ?? ''} onChange={v => mudar({ versao: v })} max={20} linha compacto /></div></div>
              : <div style={{ padding: '1px 5px' }}><B>Versão:</B> {cabecalho.versao?.trim() || versaoPadrao}</div>}
          </td>
        </tr>
        <tr><td colSpan={3} style={celulaGPCampo}><CampoAutomatico padding="1px 5px"><B>Aprovado por:</B> {gerente}{gerente ? ' - Gerente' : ''}</CampoAutomatico></td></tr>
        <tr>
          <td style={{ ...celulaGP, whiteSpace: 'nowrap' }}><AssinaturaEmLinha url={sistema.gerente.assinaturaUrl} rotulo={<B>Assinatura:</B>} vazio={editavel ? 'Sem assinatura cadastrada pelo gerente' : undefined} /></td>
          <td colSpan={2} style={{ ...celulaGP, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
            <B>Data de aprovação:</B>{' '}
            <CampoData id={`${prefixoId}-data-aprovacao`} rotulo="Data de aprovação" ajuda="Dia em que o gerente aprovou esta versão." valor={cabecalho.dataAprovacao ?? ''} onChange={editavel ? v => mudar({ dataAprovacao: v }) : nada} />
          </td>
        </tr>
      </tbody>
    </table>
  )
}

/** Marcação de escolha na folha: rádio na edição; no PDF/Word, "●" marcado e "O" livre, como no modelo. */
export function Escolha({ nome, marcado, rotulo, onMarcar, children, compacto = false }: { nome: string; marcado: boolean; rotulo: string; onMarcar?: () => void; children: ReactNode; compacto?: boolean }) {
  const { editavel } = useEditorFolha()
  if (!editavel || !onMarcar) {
    return <span style={{ whiteSpace: 'nowrap', marginRight: '3mm' }}><span aria-hidden="true">{marcado ? '●' : 'O'}</span> {children}</span>
  }
  // Rádio nativo: controle de escolha (permitido fora da base dos campos de texto).
  return (
    <label className={`${compacto ? 'mr-[1mm]' : 'mr-[3mm]'} inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded px-0.5 transition-colors hover:bg-blue-50 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500`}>
      <input type="radio" name={nome} checked={marcado} onChange={onMarcar} aria-label={rotulo} className="h-3 w-3 cursor-pointer accent-blue-600" />
      {children}
    </label>
  )
}
