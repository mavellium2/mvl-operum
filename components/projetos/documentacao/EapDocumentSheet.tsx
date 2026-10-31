'use client'

import { forwardRef, useMemo, useState } from 'react'
import AssinaturaEmLinha from '@/components/documentos/AssinaturaEmLinha'
import type { EapNode, EapDocumentMetadata } from '@/types/eap'
import { computeEapColumnLayout, eapBoxLabel, eapWrapLines, fitScale, EAP_COL_LINE_H, EAP_COL_PAD_Y } from '@/lib/eapLayout'
import { flattenTree } from '@/lib/eapCode'
import { formatDateBR } from '@/lib/date'
import EapGraficaDaAba, { type ArvoreDaAba } from './EapGraficaDaAba'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import { PAGE_NUMBER_MARGIN_MM } from '@/lib/printPageStyle'
import {
  Assinaturas, Cabecalho, CampoAutomatico, ListaPaginada, CampoData, CampoPessoa, CampoTexto, FOLHA_MARGEM_MM, FONTE_DOC, Folha, Quadro,
  celula, celulaCampo, faixa, useEditorFolha,
} from '@/components/documentos/editor/folha'

export const TITULO_EAP = 'Estrutura Analítica do Projeto — EAP'

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
 *   (igual à aba EAP/WBS; campo automático, editado na própria aba).
 * PÁGINAS 2+ — EAP TEXTO: a lista numerada gerada da MESMA árvore, seguida
 *   das assinaturas.
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
  /** Árvore da aba EAP/WBS: a EAP gráfica é desenhada igual à aba. Sem ela, layout em colunas. */
  arvore?: ArvoreDaAba | null
  /** Habilita interação (clique nos blocos) — usado pelo editor. */
  interactive?: boolean
  edicao?: EdicaoEap
  /** Rodapé desenhado na folha, na tela (no PDF vem do @page). */
  rodape?: string
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

/** Rodapé da folha na tela ("Operum · … · versão" e "Página X de Y"); no PDF vem do @page. */
/** Rodapé da folha da EAP gráfica (as folhas do texto têm o rodapé da paginação). */
function RodapeTela({ texto, pagina, total }: { texto?: string; pagina: number; total: number }) {
  return (
    <div data-rodape-pagina="" style={{ position: 'absolute', left: `${FOLHA_MARGEM_MM.x}mm`, right: `${FOLHA_MARGEM_MM.x}mm`, bottom: '3.5mm', display: 'flex', justifyContent: 'space-between', font: '8pt Arial, Arimo, Helvetica, sans-serif', color: '#555' }}>
      <span>{texto}</span><span>Página {pagina} de {total}</span>
    </div>
  )
}

function QuadroEap({ metadata, instituicao, assinaturaUrl, edicao }: { metadata: EapDocumentMetadata; instituicao: string; assinaturaUrl?: string | null; edicao?: EdicaoEap }) {
  const { editavel } = useEditorFolha()
  const ed = edicao
  const aprovador = metadata.approvedBy || metadata.projectManager
  return (
    <Quadro testId="quadro-identificacao">
      <tr><td colSpan={2} style={{ ...faixa, padding: 0 }}><CampoAutomatico>{instituicao}</CampoAutomatico></td></tr>
      <tr><td colSpan={2} style={celulaCampo}><CampoAutomatico>Nome do projeto: {metadata.projectName}</CampoAutomatico></td></tr>
      <tr><td colSpan={2} style={celulaCampo}><CampoAutomatico origem="Automático: vem do gerente do projeto">Gerente do projeto: {metadata.projectManager}</CampoAutomatico></td></tr>
      <tr>
        <td style={celula}>
          Elaborado por:{' '}
          <CampoPessoa
            id="eap-elaborado-por" rotulo="Elaborado por" ajuda="Quem montou este documento. Escolha um membro da equipe."
            projetoId={ed?.projetoId ?? ''} membros={ed?.membros ?? []} valorId={metadata.preparedByUserId} nome={metadata.preparedBy}
            onChange={ed?.onElaboradoPor ?? nada} onCriarMembro={ed?.onCriarMembro}
          />
        </td>
        <td style={celulaCampo}>
          {editavel
            ? <div className="flex items-start" style={{ paddingLeft: 6 }}><span style={{ padding: '2px 0' }}>Versão:</span><div className="flex-1"><CampoTexto id="eap-versao" rotulo="Versão" ajuda="Número desta versão do documento (ex.: 1.0, 1.1)." pergunta="1.0" valor={metadata.version ?? ''} onChange={ed?.onVersao ?? nada} max={20} linha /></div></div>
            : <div style={{ padding: '2px 6px' }}>Versão: {metadata.version || '1.0'}</div>}
        </td>
      </tr>
      <tr><td colSpan={2} style={celulaCampo}><CampoAutomatico origem="Automático: o aprovador é sempre o gerente do projeto">Aprovado por: {aprovador}</CampoAutomatico></td></tr>
      <tr>
        <td style={{ ...celula, whiteSpace: 'nowrap' }}>
          <AssinaturaEmLinha url={assinaturaUrl} vazio={metadata.signature || (editavel ? 'Sem assinatura cadastrada pelo gerente' : undefined)} />
        </td>
        <td style={{ ...celula, whiteSpace: 'nowrap' }}>
          Data de aprovação:{' '}
          {editavel
            ? <CampoData id="eap-data-aprovacao" rotulo="Data de aprovação" ajuda="Dia em que o gerente aprovou esta versão." valor={metadata.approvalDate ?? ''} onChange={ed?.onDataAprovacao ?? nada} />
            : formatDateBR(metadata.approvalDate, '')}
        </td>
      </tr>
    </Quadro>
  )
}

const EapDocumentSheet = forwardRef<HTMLDivElement, EapDocumentSheetProps>(
  function EapDocumentSheet({ metadata, nodes, instituicao, logoUrl, assinaturaUrl, arvore, interactive, selectedId, onSelectBlock, edicao, rodape }, ref) {
    const layout = useMemo(() => computeEapColumnLayout(nodes), [nodes])
    const flat = useMemo(() => flattenTree(nodes), [nodes])
    // Folhas ocupadas pela EAP em texto (para o "Página 1 de N" da folha gráfica).
    const [paginasTexto, setPaginasTexto] = useState(1)

    // Área da árvore: página menos margens, faixa da numeração e cabeçalho.
    const availW = (PAGE_W - FOLHA_MARGEM_MM.x * 2 - 8) * MM
    const availH = (PAGE_H - FOLHA_MARGEM_MM.top - PAGE_NUMBER_MARGIN_MM - CABECALHO_MM) * MM
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
        <ListaPaginada style={{ fontFamily: FONTE_DOC, fontSize: '10pt', lineHeight: 1.35 }}>
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
        </ListaPaginada>
      )
    }

    const grafica = renderGraphicTree()
    return (
      <div ref={ref} data-testid="eap-sheet" className="eap-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* ── PÁGINA 1 — EAP GRÁFICA (altura fixa: uma página) ─────────────── */}
        <Folha paisagem fixa data-testid="eap-pagina-1" style={{ breakAfter: 'page' }}>
          <Cabecalho titulo={TITULO_EAP} logoUrl={logoUrl} />
          <QuadroEap metadata={metadata} instituicao={instituicao} assinaturaUrl={assinaturaUrl} edicao={edicao} />
          {grafica}
          <RodapeTela texto={rodape} pagina={1} total={1 + paginasTexto} />
        </Folha>

        {/* ── PÁGINAS 2+ — EAP TEXTO (o texto continua nas páginas seguintes) ── */}
        <Folha paisagem data-testid="eap-pagina-2" rodape={rodape} paginaInicial={2} onPaginas={setPaginasTexto}>
          {renderTextualTree()}
          <Assinaturas
            assinantes={[
              { nome: metadata.preparedBy, funcao: 'Elaborado por' },
              { nome: metadata.approvedBy || metadata.projectManager, funcao: 'Aprovado por — Gerente do projeto', assinaturaUrl },
            ]}
          />
        </Folha>
      </div>
    )
  },
)

EapDocumentSheet.displayName = 'EapDocumentSheet'
export default EapDocumentSheet
