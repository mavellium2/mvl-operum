'use client'

import { forwardRef, useMemo } from 'react'
import type { EapNode, EapDocumentMetadata } from '@/types/eap'
import { computeEapColumnLayout, eapBoxLabel, eapWrapLines, fitScale, EAP_COL_LINE_H, EAP_COL_PAD_Y } from '@/lib/eapLayout'
import { flattenTree } from '@/lib/eapCode'
import { formatDateBR } from '@/lib/date'
import EapGraficaDaAba, { type ArvoreDaAba } from './EapGraficaDaAba'

/**
 * Documento EAP no layout do modelo do professor ("04 Aula GP - Modelo de
 * Estrutura Analítica do Projeto"), todo em A4 paisagem.
 *
 * PÁGINA 1 — EAP GRÁFICA: logo + título, quadro de identificação e a árvore em
 *   colunas (raiz no topo, nível 2 lado a lado, descendentes empilhados).
 * PÁGINAS 2+ — EAP TEXTO: mesmo cabeçalho e a lista numerada gerada da MESMA
 *   árvore; o texto continua nas páginas seguintes sem repetir o cabeçalho.
 *
 * `ref` é usado pelo react-to-print para exportar o PDF.
 */

export interface EapDocumentSheetProps {
  metadata: EapDocumentMetadata
  nodes: EapNode[]
  instituicao: string
  logoUrl?: string | null
  /** Assinatura do gerente (documento com versão aprovada). */
  assinaturaUrl?: string | null
  /** Árvore da aba EAP/WBS: a EAP gráfica é desenhada igual à aba. Sem ela, layout em colunas. */
  arvore?: ArvoreDaAba | null
  /** Habilita interação (clique nos blocos) — usado pelo editor. */
  interactive?: boolean
  selectedId?: string | null
  onSelectBlock?: (id: string) => void
}

// ── Página (mm; 1mm ≈ 3.7795px) ─────────────────────────────────────────────
const PAGE_W = 297
const PAGE_H = 210
const PAD_X = 14
const PAD_Y = 8
const MM = 3.7795
/** Margem superior do papel: dá respiro às páginas de continuação do texto. */
export const EAP_PRINT_MARGIN_TOP_MM = 8

const BORDA = '1px solid #000'
const FONTE_QUADRO = 'Calibri, Carlito, Arial, Helvetica, sans-serif'
const FONTE_TEXTO = '"Times New Roman", Times, serif'
const AZUL = '#4472c4'
const AZUL_BORDA = '#2f528f'

const pageBase: React.CSSProperties = {
  width: `${PAGE_W}mm`,
  padding: `${PAD_Y}mm ${PAD_X}mm`,
  boxSizing: 'border-box',
  background: '#fff',
  color: '#000',
  position: 'relative',
}

const celula: React.CSSProperties = {
  border: BORDA,
  padding: '1px 5px',
  fontFamily: FONTE_QUADRO,
  fontSize: '9pt',
  fontWeight: 'bold',
  lineHeight: 1.3,
  textAlign: 'left',
}

function Cabecalho({ titulo, metadata, instituicao, logoUrl, assinaturaUrl }: { titulo: string; metadata: EapDocumentMetadata; instituicao: string; logoUrl?: string | null; assinaturaUrl?: string | null }) {
  return (
    <div style={{ marginBottom: '7mm' }}>
      <div style={{ display: 'flex', alignItems: 'center', minHeight: '20mm', marginBottom: '4mm' }}>
        <div style={{ width: '24mm', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt="Logo" style={{ maxHeight: '20mm', maxWidth: '24mm', objectFit: 'contain' }} />
            : null}
        </div>
        <h1 style={{ flex: 1, margin: 0, textAlign: 'center', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '14pt', fontWeight: 'bold', paddingRight: '24mm' }}>
          {titulo}
        </h1>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr><td colSpan={2} style={{ ...celula, background: '#bfbfbf', height: '1.5em' }}>{instituicao}</td></tr>
          <tr><td colSpan={2} style={celula}>Nome do projeto: {metadata.projectName}</td></tr>
          <tr><td colSpan={2} style={celula}>Gerente do projeto: {metadata.projectManager}</td></tr>
          <tr>
            <td style={{ ...celula, width: '64%' }}>Elaborado por: {metadata.preparedBy}</td>
            <td style={celula}><em>Versão:</em> <span style={{ fontWeight: 'normal' }}>{metadata.version || '1.0'}</span></td>
          </tr>
          <tr><td colSpan={2} style={celula}>Aprovado por: {metadata.approvedBy}</td></tr>
          <tr>
            <td style={celula}>
              Assinatura:{' '}
              {assinaturaUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={assinaturaUrl} alt="Assinatura" style={{ maxHeight: '8mm', maxWidth: '45mm', verticalAlign: 'middle', objectFit: 'contain' }} />
                : <span style={{ fontWeight: 'normal' }}>{metadata.signature}</span>}
            </td>
            <td style={celula}><em>Data de aprovação:</em> <span style={{ fontWeight: 'normal' }}>{formatDateBR(metadata.approvalDate, '')}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const EapDocumentSheet = forwardRef<HTMLDivElement, EapDocumentSheetProps>(
  function EapDocumentSheet({ metadata, nodes, instituicao, logoUrl, assinaturaUrl, arvore, interactive, selectedId, onSelectBlock }, ref) {
    const layout = useMemo(() => computeEapColumnLayout(nodes), [nodes])
    const flat = useMemo(() => flattenTree(nodes), [nodes])

    // Área da árvore: página menos padding, cabeçalho (~62mm), rodapé e faixa da numeração.
    const availW = (PAGE_W - PAD_X * 2) * MM
    const availH = (PAGE_H - EAP_PRINT_MARGIN_TOP_MM - 8 - PAD_Y * 2 - 72) * MM
    const scale = fitScale(layout.bounds.width, layout.bounds.height || 1, availW, availH)

    function renderGraphicTree() {
      if (nodes.length === 0) {
        return (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', paddingTop: 40 }}>
            Estrutura da EAP vazia — use o editor para montar a árvore.
          </div>
        )
      }
      if (arvore?.rootId) return <EapGraficaDaAba arvore={arvore} larguraMax={availW} alturaMax={availH} />
      return (
        <svg
          viewBox={`0 0 ${layout.bounds.width} ${layout.bounds.height}`}
          width={layout.bounds.width * scale}
          height={(layout.bounds.height || 1) * scale}
          style={{ display: 'block', margin: '0 auto' }}
          role="tree"
        >
          {layout.connectors.map((c, i) => (
            <path key={`${c.fromId}-${c.toId}-${i}`} d={c.path} fill="none" stroke="#7f8fa6" strokeWidth={1} />
          ))}
          {flat.map(node => {
            const g = layout.geometry[node.id]
            if (!g) return null
            const selected = interactive && selectedId === node.id
            const lines = eapWrapLines(eapBoxLabel(node, g.isRoot))
            const top = g.y + (g.height - lines.length * EAP_COL_LINE_H) / 2
            return (
              <g
                key={node.id}
                role="treeitem"
                aria-level={node.level}
                aria-selected={selected}
                onClick={interactive ? () => onSelectBlock?.(node.id) : undefined}
                style={interactive ? { cursor: 'pointer' } : undefined}
              >
                <rect
                  x={g.x} y={g.y} width={g.width} height={g.height}
                  fill={AZUL} stroke={selected ? '#f59e0b' : AZUL_BORDA} strokeWidth={selected ? 2.5 : 0.8}
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
                    fill="#fff"
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
        <div style={{ fontFamily: FONTE_TEXTO, fontSize: '11pt', lineHeight: 1.25 }}>
          {flat.map(node => {
            const temFilhos = (node.children?.length ?? 0) > 0
            const texto = node.level === 1 ? `${node.code}. ${node.title}` : `${node.code} ${node.title}`
            return (
              <div
                key={node.id}
                style={{
                  marginLeft: node.level <= 1 ? 0 : `${(node.level - 2) * 5 + 1}mm`,
                  marginTop: node.level === 2 ? '1.25em' : 0,
                  marginBottom: node.level === 1 ? '0.25em' : 0,
                  fontWeight: node.level <= 2 || temFilhos ? 'bold' : 'normal',
                  breakInside: 'avoid',
                  breakAfter: temFilhos ? 'avoid' : 'auto',
                }}
              >
                {texto}
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div ref={ref} data-testid="eap-sheet" className="eap-sheet">
        {/* ── PÁGINA 1 — EAP GRÁFICA ─────────────────────────────────────── */}
        <div className="eap-page eap-page-1" data-print-sheet-fixed style={{ ...pageBase, height: `${PAGE_H}mm`, overflow: 'hidden', breakAfter: 'page' }}>
          <Cabecalho titulo="Modelo de Estrutura Analítica do Projeto (EAP - Gráfica)" metadata={metadata} instituicao={instituicao} logoUrl={logoUrl} assinaturaUrl={assinaturaUrl} />
          {renderGraphicTree()}
          <div style={{ position: 'absolute', left: `${PAD_X + 6}mm`, bottom: `${PAD_Y}mm`, fontFamily: FONTE_QUADRO, fontSize: '7pt' }}>
            © 05_Modelo EAP Gráfica
          </div>
        </div>

        {/* ── PÁGINAS 2+ — EAP TEXTO (o texto continua nas páginas seguintes) ── */}
        <div className="eap-page eap-page-2" data-print-sheet style={{ ...pageBase, minHeight: `${PAGE_H}mm` }}>
          <Cabecalho titulo="Modelo de Estrutura Analítica do Projeto (EAP - Texto)" metadata={metadata} instituicao={instituicao} logoUrl={logoUrl} assinaturaUrl={assinaturaUrl} />
          {renderTextualTree()}
        </div>
      </div>
    )
  },
)

EapDocumentSheet.displayName = 'EapDocumentSheet'
export default EapDocumentSheet
