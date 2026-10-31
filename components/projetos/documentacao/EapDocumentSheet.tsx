'use client'

import { forwardRef, useEffect, useMemo, useState } from 'react'
import AssinaturaEmLinha from '@/components/documentos/AssinaturaEmLinha'
import type { EapNode, EapDocumentMetadata } from '@/types/eap'
import { computeEapColumnLayout, eapColunasParaLargura, eapBoxLabel, eapWrapLines, fitScale, EAP_COL_LINE_H, EAP_COL_PAD_Y } from '@/lib/eapLayout'
import { flattenTree } from '@/lib/eapCode'
import { formatDateBR } from '@/lib/date'
import type { WbsNodeClient } from '@/types/wbs'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import { PAGE_NUMBER_MARGIN_MM } from '@/lib/printPageStyle'
import {
  CampoAutomatico, ListaPaginada, CampoData, CampoPessoa, CampoTexto, EditorFolhaProvider, FOLHA_MARGEM_MM, Folha, useEditorFolha,
} from '@/components/documentos/editor/folha'

export const TITULO_EAP = 'Estrutura Analítica do Projeto — EAP'
export const TITULO_EAP_GRAFICA = 'Modelo de Estrutura Analítica do Projeto (EAP - Gráfica)'
export const TITULO_EAP_TEXTO = 'Modelo de Estrutura Analítica do Projeto (EAP - Texto)'

/** Árvore da aba EAP/WBS: dá as cores de cada bloco da EAP gráfica. */
export interface ArvoreDaAba {
  rootId: string | null
  nodes: Record<string, WbsNodeClient>
}

/** Quadro repetido na folha do texto: só leitura (os campos ficam no quadro da folha 1). */
const SO_LEITURA = { editavel: false, focar: () => {}, registrarLimpar: () => {} }

/** Ligações do quadro com o estado do editor (só usadas dentro do EditorDocumento). */
export interface EdicaoEap {
  projetoId: string
  membros: MembroEquipeOption[]
  onCriarMembro: (membro: MembroEquipeOption) => void
  onElaboradoPor: (membro: MembroEquipeOption | null) => void
  onVersao: (versao: string) => void
  onDataAprovacao: (data: string) => void
  /** Link "Editar na EAP/WBS" do aviso de campo automático. */
  linkWbs: string
}

/**
 * Documento EAP na folha padrão dos documentos (Penpot, "Tela — Edição de
 * documento"), todo em A4 paisagem.
 *
 * PÁGINA 1 — EAP GRÁFICA: logo + título, quadro de identificação e a árvore
 *   no layout em colunas do modelo "04 Aula GP" (fases lado a lado, itens
 *   empilhados), com as cores dos blocos da aba EAP/WBS.
 * PÁGINAS 2+ — EAP TEXTO: a lista numerada gerada da MESMA árvore, recuada
 *   por nível. Todas as folhas mostram "Página X de Y".
 *
 * Dentro do EditorDocumento o quadro é editável; fora dele (PDF) sai só o
 * texto. `ref` é usado pelo react-to-print para exportar o PDF.
 */

export interface EapDocumentSheetProps {
  metadata: EapDocumentMetadata
  nodes: EapNode[]
  instituicao: string
  logoUrl?: string | null
  /** Assinatura do gerente (documento com versão aprovada). */
  assinaturaUrl?: string | null
  /** Árvore da aba EAP/WBS: os blocos da EAP gráfica usam as cores dela. Sem ela, azul do modelo. */
  arvore?: ArvoreDaAba | null
  /** Total de folhas do documento (gráfica + texto), para o contador do editor. */
  onPaginas?: (total: number) => void
  /** Habilita interação (clique nos blocos) — usado pelo editor. */
  interactive?: boolean
  edicao?: EdicaoEap
  selectedId?: string | null
  onSelectBlock?: (id: string) => void
}

// ── Página (mm; 1mm ≈ 3.7795px) ─────────────────────────────────────────────
const PAGE_W = 297
const PAGE_H = 210
const MM = 3.7795
/** Altura de logo + título + quadro de identificação na página da EAP gráfica. */
const CABECALHO_MM = 70

const AZUL = '#4472c4'
const AZUL_BORDA = '#2f528f'
const nada = () => {}

/** Rodapé da folha da EAP gráfica (as folhas do texto têm o rodapé da paginação). */
function RodapeTela({ pagina, total }: { pagina: number; total: number }) {
  return (
    <div data-rodape-pagina="" style={{ position: 'absolute', left: `${FOLHA_MARGEM_MM.x}mm`, right: `${FOLHA_MARGEM_MM.x}mm`, bottom: '3.5mm', display: 'flex', justifyContent: 'space-between', font: '8pt Arial, Arimo, Helvetica, sans-serif', color: '#555' }}>
      <span /><span>Página {pagina} de {total}</span>
    </div>
  )
}

const bordaEap = '1px solid #000'
const celEap: React.CSSProperties = { border: bordaEap, padding: '1px 5px', verticalAlign: 'top', textAlign: 'left', fontSize: '10pt', lineHeight: 1.3, fontWeight: 'bold', fontFamily: 'Calibri, Carlito, Arial, Helvetica, sans-serif' }
const celEapCampo: React.CSSProperties = { ...celEap, padding: 0 }
/** Rótulo em negrito e itálico ("Versão:", "Data de aprovação:"), como no modelo. */
const RotuloItalico = ({ children }: { children: React.ReactNode }) => <em style={{ fontWeight: 'bold' }}>{children}</em>

/** Logo à esquerda e título centralizado na folha (coluna vazia da mesma largura à direita). */
function CabecalhoEap({ titulo, logoUrl }: { titulo: string; logoUrl?: string | null }) {
  const { editavel } = useEditorFolha()
  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: '24mm' }}>
      <div style={{ width: '40mm', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="Logo do projeto" style={{ maxHeight: '24mm', maxWidth: '36mm', objectFit: 'contain' }} />
          : editavel
            ? <div style={{ width: '30mm', height: '20mm', border: '1px solid #4a6fa5', background: '#9db7e0', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: '11pt', lineHeight: 1.15 }}>Logo do<br />Projeto</div>
            : null}
      </div>
      <h1 style={{ flex: 1, margin: 0, textAlign: 'center', fontFamily: 'Arial, Arimo, Helvetica, sans-serif', fontSize: '15pt', fontWeight: 'bold', lineHeight: 1.2 }}>{titulo}</h1>
      <div aria-hidden="true" style={{ width: '40mm', flexShrink: 0 }} />
    </div>
  )
}

/** Quadro de identificação no modelo "04 Aula GP": tudo em negrito; Versão e Data de aprovação em itálico. */
function QuadroEap({ metadata, instituicao, assinaturaUrl, edicao, testId }: { metadata: EapDocumentMetadata; instituicao: string; assinaturaUrl?: string | null; edicao?: EdicaoEap; testId?: string }) {
  const { editavel } = useEditorFolha()
  const ed = edicao
  const aprovador = metadata.approvedBy || metadata.projectManager
  return (
    <table data-testid={testId} style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup><col style={{ width: '62%' }} /><col style={{ width: '15%' }} /><col style={{ width: '23%' }} /></colgroup>
      <tbody>
        <tr><td colSpan={3} style={{ ...celEapCampo, background: '#bfbfbf' }}><CampoAutomatico padding="1px 5px">{instituicao}</CampoAutomatico></td></tr>
        <tr><td colSpan={3} style={celEapCampo}><CampoAutomatico padding="1px 5px">Nome do projeto: {metadata.projectName}</CampoAutomatico></td></tr>
        <tr><td colSpan={3} style={celEapCampo}><CampoAutomatico padding="1px 5px">Gerente do projeto: {metadata.projectManager}</CampoAutomatico></td></tr>
        <tr>
          <td colSpan={2} style={celEap}>
            Elaborado por:{' '}
            <CampoPessoa
              id="eap-elaborado-por" rotulo="Elaborado por" ajuda="Quem montou este documento. Escolha um membro da equipe."
              projetoId={ed?.projetoId ?? ''} membros={ed?.membros ?? []} valorId={metadata.preparedByUserId} nome={metadata.preparedBy}
              onChange={ed?.onElaboradoPor ?? nada} onCriarMembro={ed?.onCriarMembro}
            />
          </td>
          <td style={{ ...celEapCampo, fontWeight: 'normal' }}>
            {editavel
              ? <div className="flex items-start" style={{ paddingLeft: 5 }}><RotuloItalico>Versão:</RotuloItalico>&nbsp;<div className="flex-1"><CampoTexto id="eap-versao" rotulo="Versão" ajuda="Número desta versão do documento (ex.: 1.0, 1.1)." pergunta="1.0" valor={metadata.version ?? ''} onChange={ed?.onVersao ?? nada} max={20} linha compacto /></div></div>
              : <div style={{ padding: '1px 5px' }}><RotuloItalico>Versão:</RotuloItalico> {metadata.version || '1.0'}</div>}
          </td>
        </tr>
        <tr><td colSpan={3} style={celEapCampo}><CampoAutomatico padding="1px 5px">Aprovado por: {aprovador}</CampoAutomatico></td></tr>
        <tr>
          <td style={{ ...celEap, whiteSpace: 'nowrap' }}>
            <AssinaturaEmLinha url={assinaturaUrl} vazio={metadata.signature || (editavel ? 'Sem assinatura cadastrada pelo gerente' : undefined)} />
          </td>
          <td colSpan={2} style={{ ...celEap, fontWeight: 'normal', whiteSpace: 'nowrap' }}>
            <RotuloItalico>Data de aprovação:</RotuloItalico>{' '}
            {editavel
              ? <CampoData id="eap-data-aprovacao" rotulo="Data de aprovação" ajuda="Dia em que o gerente aprovou esta versão." valor={metadata.approvalDate ?? ''} onChange={ed?.onDataAprovacao ?? nada} />
              : formatDateBR(metadata.approvalDate, '')}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

const EapDocumentSheet = forwardRef<HTMLDivElement, EapDocumentSheetProps>(
  function EapDocumentSheet({ metadata, nodes, instituicao, logoUrl, assinaturaUrl, arvore, interactive, selectedId, onSelectBlock, edicao, onPaginas }, ref) {
    const flat = useMemo(() => flattenTree(nodes), [nodes])
    // Folhas ocupadas pela EAP em texto (para o "Página 1 de N" da folha gráfica).
    const [paginasTexto, setPaginasTexto] = useState(1)
    useEffect(() => { onPaginas?.(1 + paginasTexto) }, [onPaginas, paginasTexto])

    // Área da árvore: página menos margens, faixa da numeração e cabeçalho.
    const availW = (PAGE_W - FOLHA_MARGEM_MM.x * 2 - 8) * MM
    const availH = (PAGE_H - FOLHA_MARGEM_MM.top - PAGE_NUMBER_MARGIN_MM - CABECALHO_MM) * MM
    // Muitas fases: blocos mais estreitos para caber na largura sem encolher o texto.
    const medidas = useMemo(() => eapColunasParaLargura(Math.max(0, ...nodes.map(r => r.children?.length ?? 0)), availW), [nodes, availW])
    const layout = useMemo(() => computeEapColumnLayout(nodes, medidas), [nodes, medidas])
    const scale = fitScale(layout.bounds.width, layout.bounds.height || 1, availW, availH)

    function renderGraphicTree() {
      if (nodes.length === 0) {
        return (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', paddingTop: 40 }}>
            Estrutura da EAP vazia — use o editor para montar a árvore.
          </div>
        )
      }
      return (
        <svg
          viewBox={`0 0 ${layout.bounds.width} ${layout.bounds.height}`}
          width={layout.bounds.width * scale}
          height={(layout.bounds.height || 1) * scale}
          style={{ display: 'block', margin: '0 auto' }}
          role="tree"
          aria-label="EAP gráfica"
        >
          {layout.connectors.map((c, i) => (
            <path key={`${c.fromId}-${c.toId}-${i}`} d={c.path} fill="none" stroke="#7f8fa6" strokeWidth={1} />
          ))}
          {flat.map(node => {
            const g = layout.geometry[node.id]
            if (!g) return null
            const selected = interactive && selectedId === node.id
            // Cores do bloco na aba EAP/WBS (o layout é o do modelo, em colunas).
            const cor = arvore?.nodes[node.id]?.style
            const lines = eapWrapLines(eapBoxLabel(node, g.isRoot), medidas.maxChars, medidas.maxLines)
            const top = g.y + (g.height - lines.length * EAP_COL_LINE_H) / 2
            return (
              <g
                key={node.id}
                role="treeitem"
                aria-label={eapBoxLabel(node, false)}
                aria-level={node.level}
                aria-selected={selected}
                onClick={interactive ? () => onSelectBlock?.(node.id) : undefined}
                style={interactive ? { cursor: 'pointer' } : undefined}
              >
                <rect
                  x={g.x} y={g.y} width={g.width} height={g.height}
                  fill={cor?.backgroundColor ?? AZUL} stroke={selected ? '#f59e0b' : cor?.borderColor ?? AZUL_BORDA} strokeWidth={selected ? 2.5 : 0.8}
                  rx={cor ? Math.min(cor.borderRadius, 4) : 0}
                />
                {lines.map((line, i) => (
                  <text
                    key={i}
                    x={g.x + g.width / 2}
                    y={top + EAP_COL_LINE_H * (i + 1) - EAP_COL_PAD_Y / 3}
                    textAnchor="middle"
                    fontFamily="Calibri, Carlito, Arial, sans-serif"
                    fontSize={9}
                    fontWeight={g.isRoot ? 700 : 400}
                    fill={cor?.textColor ?? '#fff'}
                  >
                    {line}
                  </text>
                ))}
              </g>
            )
          })}
        </svg>
      )
    }

    function renderTextualTree() {
      if (flat.length === 0) {
        return <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Estrutura da EAP vazia — use o editor para montar a árvore.</div>
      }
      return (
        <ListaPaginada style={{ fontFamily: '"Times New Roman", Tinos, Times, serif', fontSize: '10.5pt', lineHeight: 1.25 }}>
          {flat.map(node => {
            const temFilhos = (node.children?.length ?? 0) > 0
            const texto = node.level === 1 ? `${node.code}. ${node.title}` : `${node.code} ${node.title}`
            return (
              <div
                key={node.id}
                style={{
                  // Recuo de 4 mm por nível a partir do 2º (o 1º e o 2º ficam na margem), como no modelo.
                  marginLeft: node.level <= 2 ? 0 : `${(node.level - 2) * 4}mm`,
                  marginTop: node.level === 2 ? '1em' : 0,
                  fontWeight: node.level <= 2 || temFilhos ? 'bold' : 'normal',
                  breakInside: 'avoid',
                  breakAfter: temFilhos ? 'avoid' : 'auto',
                }}
              >
                {texto}
              </div>
            )
          })}
        </ListaPaginada>
      )
    }

    const grafica = renderGraphicTree()
    return (
      <div ref={ref} data-testid="eap-sheet" className="eap-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── FOLHA 1 — EAP GRÁFICA (altura fixa: uma folha) ──────────────── */}
        <Folha paisagem fixa data-testid="eap-pagina-1" style={{ breakAfter: 'page', gap: '4mm' }}>
          <CabecalhoEap titulo={TITULO_EAP_GRAFICA} logoUrl={logoUrl} />
          <QuadroEap testId="quadro-identificacao" metadata={metadata} instituicao={instituicao} assinaturaUrl={assinaturaUrl} edicao={edicao} />
          {grafica}
          <RodapeTela pagina={1} total={1 + paginasTexto} />
        </Folha>

        {/* ── FOLHAS 2+ — EAP TEXTO: título e quadro só na primeira; a lista continua nas seguintes ── */}
        <Folha paisagem data-testid="eap-pagina-2" paginaInicial={2} onPaginas={setPaginasTexto} style={{ gap: '4mm' }}>
          <CabecalhoEap titulo={TITULO_EAP_TEXTO} logoUrl={logoUrl} />
          <EditorFolhaProvider value={SO_LEITURA}>
            <QuadroEap metadata={metadata} instituicao={instituicao} assinaturaUrl={assinaturaUrl} />
          </EditorFolhaProvider>
          {renderTextualTree()}
        </Folha>
      </div>
    )
  },
)

EapDocumentSheet.displayName = 'EapDocumentSheet'
export default EapDocumentSheet
