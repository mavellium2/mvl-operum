'use client'

import { useLayoutEffect, useRef } from 'react'
import { CampoTexto, Folha } from '@/components/documentos/editor/folha'
import PostIt from '@/components/ui/PostIt'
import { formatDateBR } from '@/lib/date'
import { parseDocumentCost } from '@/lib/documentCost'
import { ICONES_CANVAS, IconeCanvas } from './canvas/IconesCanvas'
import type { CabecalhoFormulario } from '@/lib/validation/formulariosGP'
import type { CanvasConteudo } from '@/lib/validation/documentRevisionSchemas'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import FormularioDocumento, { type DadosFormularios, type RenderFormulario } from './formularios/FormularioDocumento'

type Canvas = Omit<CanvasConteudo, 'cabecalho'> & { cabecalho: CabecalhoFormulario }
type CampoCanvas = Exclude<keyof Canvas, 'cabecalho'>

/**
 * Layout da folha (pt). Grade de 13 blocos como no modelo do professor: em
 * cada bloco o ícone no canto, o título e o subtítulo ao lado e o post-it
 * embaixo, ocupando o resto. Tudo calculado daqui: nada fica por cima de nada.
 */
/** A4 paisagem (297×210 mm), igual aos outros documentos. */
const FOLHA = { largura: 842, altura: 595 }
const MARGEM = 8
const CABECALHO = { topo: 8, altura: 38 }
const GRADE = { topo: 54, base: FOLHA.altura - MARGEM }
const LINHAS = [172, 172] // a 3ª linha fica com o resto
const ICONE = 26
const TOPO_TEXTO = 34 // do topo do bloco até o post-it
const RECUO = 4 // folga entre a borda do bloco e o post-it
/** Fonte dos campos: começa no tamanho base e diminui até o mínimo se o texto não couber. */
const FONTE_CAMPO = { base: 8, minimo: 4 }
const FONTE_CABECALHO = { base: 10, minimo: 6 }

type Bloco = { id: CampoCanvas; titulo: string; subtitulo?: string; x: number; y: number; w: number; h: number }

function blocosCanvas(): Bloco[] {
  const largura = FOLHA.largura - 2 * MARGEM
  const y1 = GRADE.topo, y2 = y1 + LINHAS[0], y3 = y2 + LINHAS[1]
  const h1 = LINHAS[0], h2 = LINHAS[1], h3 = GRADE.base - y3
  const coluna = largura / 5
  const x = (n: number) => MARGEM + n * coluna
  return [
    { id: 'justificativa', titulo: 'JUSTIFICATIVA', subtitulo: '(Por quê?)', x: x(0), y: y1, w: coluna, h: h1 },
    { id: 'objetivos', titulo: 'OBJETIVO', subtitulo: '(Para quê?)', x: x(1), y: y1, w: coluna, h: h1 },
    { id: 'escopo', titulo: 'ESCOPO', subtitulo: '(O quê?)', x: x(2), y: y1, w: coluna * 2, h: h1 },
    { id: 'escopoNaoIncluido', titulo: 'ESCOPO NÃO INCLUÍDO', subtitulo: '(O que não?)', x: x(4), y: y1, w: coluna, h: h1 },
    { id: 'estrategia', titulo: 'ESTRATÉGIA DE CONDUÇÃO', subtitulo: '(Como?)', x: x(0), y: y2, w: coluna, h: h2 },
    { id: 'stakeholders', titulo: 'STAKEHOLDERS', subtitulo: '(Com quem?)', x: x(1), y: y2, w: coluna, h: h2 },
    { id: 'comunicacao', titulo: 'COMUNICAÇÃO', x: x(2), y: y2, w: coluna, h: h2 },
    { id: 'restricoes', titulo: 'RESTRIÇÕES', subtitulo: '(Imposições)', x: x(3), y: y2, w: coluna, h: h2 },
    { id: 'premissas', titulo: 'PREMISSAS', subtitulo: '(Hipóteses)', x: x(4), y: y2, w: coluna, h: h2 },
    { id: 'riscos', titulo: 'RISCOS', subtitulo: '(Ameaças e Oportunidades)', x: x(0), y: y3, w: coluna * 2, h: h3 },
    { id: 'fases', titulo: 'FASES', subtitulo: '(2º nível da EAP)', x: x(2), y: y3, w: coluna, h: h3 },
    { id: 'cronograma', titulo: 'CRONOGRAMA', subtitulo: '(Quando?)', x: x(3), y: y3, w: coluna, h: h3 },
    { id: 'orcamento', titulo: 'ORÇAMENTO', subtitulo: '(Por quanto?)', x: x(4), y: y3, w: coluna, h: h3 },
  ]
}

/** Cabeçalho numa linha só: rótulo e post-it de cada campo, alinhados ao centro. */
const CABECALHO_CAMPOS: { id: 'projeto' | 'solicitante' | 'gerente'; titulo: string; rotulo: number; x: number; w: number }[] = [
  { id: 'projeto', titulo: 'PROJETO:', rotulo: 58, x: MARGEM, w: 368 },
  { id: 'solicitante', titulo: 'SOLICITANTE:', rotulo: 84, x: 388, w: 222 },
  { id: 'gerente', titulo: 'GP:', rotulo: 26, x: 622, w: 212 },
]

const custoBR = (valor: string) => {
  const n = parseDocumentCost(valor)
  return valor.trim() && Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}
const linhas = (itens: (string | false | null | undefined)[]) => itens.filter(Boolean).join('\n')

/**
 * Canvas novo, preenchido com o que o projeto já tem, conforme as orientações
 * do modelo do professor ("Onde encontrar"):
 * Justificativa, Objetivo, Restrições e Premissas: Termo de Abertura.
 * Escopo: Declaração do Escopo (ou a descrição do produto do Termo).
 * Estratégia de condução: Declaração do Escopo.
 * Stakeholders: só os nomes das Partes Interessadas (ou da equipe).
 * Riscos: só o título de cada Formulário de Riscos.
 * Fases, Cronograma e Orçamento: 2º nível da EAP (ou macrofases do Termo), com
 * a data limite e o custo de cada uma.
 * Escopo não incluído, Comunicação e Solicitante ficam para a equipe escrever.
 */
export const CANVAS_INICIAL = (sistema: DadosFormularios, membros: MembroEquipeOption[]): Canvas => {
  const fases = sistema.macroFases ?? []
  return {
    cabecalho: {},
    projeto: sistema.nomeProjeto,
    solicitante: '',
    gerente: sistema.gerente.nome,
    justificativa: sistema.termo.justificativa,
    objetivos: sistema.termo.objetivos,
    escopo: sistema.escopo?.descricaoProduto || sistema.termo.descricaoProduto,
    escopoNaoIncluido: '',
    estrategia: sistema.escopo?.estrategia ?? '',
    stakeholders: (sistema.stakeholders?.length ? sistema.stakeholders : membros.map(m => m.name)).join('\n'),
    comunicacao: '',
    restricoes: sistema.termo.restricoes ?? '',
    premissas: sistema.termo.premissas ?? '',
    riscos: linhas((sistema.riscos ?? []).map(r => `${r.numero} - ${r.denominacao}`)),
    fases: linhas(fases.map(f => `${f.codigo} ${f.fase}`)),
    cronograma: linhas(fases.map(f => f.dataLimite && `${f.codigo} ${formatDateBR(f.dataLimite, '')}`)),
    orcamento: linhas(fases.map(f => custoBR(f.custo) && `${f.codigo} ${custoBR(f.custo)}`)),
  }
}

/**
 * Diminui a fonte do campo até o texto caber na altura do post-it (texto longo
 * continua inteiro à vista, como pediu o professor). Recalcula ao editar e
 * quando o tamanho muda; a cópia do PDF e o Word leem o tamanho já ajustado.
 */
function useAjustarFonte(valor: string, { base, minimo }: { base: number; minimo: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ajustar = () => {
      const cabe = (tamanho: number) => { el.style.fontSize = `${tamanho}pt`; return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1 }
      if (cabe(base)) return
      // Busca binária em passos de 0,25 pt entre o mínimo e o tamanho base.
      let lo = minimo, hi = base
      while (hi - lo > 0.25) { const meio = (lo + hi) / 2; if (cabe(meio)) lo = meio; else hi = meio }
      cabe(Math.floor(lo * 4) / 4)
    }
    ajustar()
    const obs = new ResizeObserver(ajustar)
    obs.observe(el)
    return () => obs.disconnect()
  }, [valor, base, minimo])
  return ref
}

function BlocoCanvas({ bloco, valor, alterar }: { bloco: Bloco; valor: string; alterar?: RenderFormulario<Canvas>['alterar'] }) {
  const { id, titulo, subtitulo, x, y, w, h } = bloco
  const nome = subtitulo ? `${titulo} ${subtitulo}` : titulo
  const p = { x: x + RECUO, y: y + TOPO_TEXTO, w: w - 2 * RECUO, h: h - TOPO_TEXTO - RECUO }
  const campo = useAjustarFonte(valor, FONTE_CAMPO)
  const icone = ICONES_CANVAS.find(i => i.id === id)!
  return (
    <>
      <IconeCanvas {...icone} x={x + 4} y={y + 4} w={ICONE} h={ICONE} />
      <h2 className="canvas-template-titulo" style={{ left: `${x + ICONE + 8}pt`, top: `${y + 3}pt`, width: `${w - ICONE - 12}pt`, height: `${TOPO_TEXTO - 4}pt` }}>
        <span className="canvas-template-titulo-principal">{titulo}</span>
        {subtitulo && <span className="canvas-template-subtitulo">{subtitulo}</span>}
      </h2>
      <PostIt className="canvas-template-postit" placeholder="" foldSize={14} style={{ position: 'absolute', left: `${p.x}pt`, top: `${p.y}pt`, width: `${p.w}pt`, height: `${p.h}pt` }} />
      {/* Campo dentro do post-it, sem invadir a dobra do canto. */}
      <div ref={campo} className="canvas-template-campo" style={{ left: `${p.x + 3}pt`, top: `${p.y + 3}pt`, width: `${p.w - 6}pt`, height: `${p.h - 12}pt`, fontSize: `${FONTE_CAMPO.base}pt` }}>
        <CampoTexto id={`canvas-${id}`} rotulo={nome} ajuda={`Conteúdo do bloco ${nome} do Canvas.`}
          dica={`Escreva aqui: ${nome.toLocaleLowerCase('pt-BR')}`} valor={valor}
          onChange={novo => alterar?.(atual => ({ ...atual, [id]: novo }))} max={20000} formatavel />
      </div>
    </>
  )
}

function CampoCabecalho({ campo, valor, alterar }: { campo: (typeof CABECALHO_CAMPOS)[number]; valor: string; alterar?: RenderFormulario<Canvas>['alterar'] }) {
  const { id, titulo, rotulo, x, w } = campo
  const { topo, altura } = CABECALHO
  const p = { x: x + rotulo + 4, w: w - rotulo - 4 }
  const refTexto = useAjustarFonte(valor, FONTE_CABECALHO)
  return (
    <>
      <strong className="canvas-template-label" style={{ left: `${x}pt`, top: `${topo}pt`, width: `${rotulo}pt`, height: `${altura}pt` }}>{titulo}</strong>
      <PostIt className="canvas-template-postit" placeholder="" foldSize={10} style={{ position: 'absolute', left: `${p.x}pt`, top: `${topo}pt`, width: `${p.w}pt`, height: `${altura}pt` }} />
      <div ref={refTexto} className="canvas-template-campo canvas-template-campo-cabecalho" style={{ left: `${p.x + 3}pt`, top: `${topo + 3}pt`, width: `${p.w - 10}pt`, height: `${altura - 6}pt`, fontSize: `${FONTE_CABECALHO.base}pt` }}>
        <CampoTexto id={`canvas-${id}`} rotulo={titulo.replace(':', '')} valor={valor} alinhamento="center"
          onChange={novo => alterar?.(atual => ({ ...atual, [id]: novo }))} max={1000} />
      </div>
    </>
  )
}

/** Grade dos blocos em SVG (no PDF e no Word sai como imagem vetorial). */
function GradeCanvas({ blocos }: { blocos: Bloco[] }) {
  return (
    <svg className="canvas-template-grade" aria-hidden="true" viewBox={`0 0 ${FOLHA.largura} ${FOLHA.altura}`} width={`${FOLHA.largura}pt`} height={`${FOLHA.altura}pt`}>
      {blocos.map(b => <rect key={b.id} x={b.x + 0.5} y={b.y + 0.5} width={b.w - 1} height={b.h - 1} fill="none" stroke="#9aa0a6" strokeWidth="1" />)}
    </svg>
  )
}

export function FolhaCanvas({ conteudo, alterar }: RenderFormulario<Canvas>) {
  const blocos = blocosCanvas()
  return (
    <Folha paisagem fixa data-testid="canvas-folha" style={{ padding: 0, gap: 0, overflow: 'hidden', position: 'relative', fontFamily: 'Arial, sans-serif', fontSize: '8pt', lineHeight: 1.2 }}>
      <GradeCanvas blocos={blocos} />
      {CABECALHO_CAMPOS.map(c => <CampoCabecalho key={c.id} campo={c} valor={conteudo[c.id]} alterar={alterar} />)}
      {blocos.map(b => <BlocoCanvas key={b.id} bloco={b} valor={conteudo[b.id]} alterar={alterar} />)}
    </Folha>
  )
}

function normalizar(salvo: Canvas, sistema: DadosFormularios, membros: MembroEquipeOption[]): Canvas {
  const inicial = CANVAS_INICIAL(sistema, membros)
  return { ...inicial, ...salvo, cabecalho: salvo.cabecalho ?? {} }
}

/** Estilos da folha do Canvas (posições sobre a arte de fundo, post-its, ícones e campos). */
export const ESTILO_CANVAS = `
        .canvas-template-grade{position:absolute;left:0;top:0;z-index:0;pointer-events:none}
        .canvas-template-postit{position:absolute;z-index:1;filter:drop-shadow(1px 2px 2px rgb(0 0 0 / 32%))}
        .canvas-template-label,.canvas-template-titulo,.canvas-template-campo{position:absolute;z-index:2;box-sizing:border-box;color:#27313d}
        .canvas-template-label{display:flex;align-items:center;font:700 10.5pt/1.05 Arial,sans-serif;white-space:nowrap}
        .canvas-template-titulo{display:flex;flex-direction:column;justify-content:center;margin:0;overflow:hidden;text-align:left}
        .canvas-template-titulo-principal{font:700 10pt/1.05 Arial,sans-serif}
        .canvas-template-subtitulo{font:700 7pt/1.2 Arial,sans-serif;margin-top:1pt}
        .canvas-template-campo{overflow:hidden;font-family:Arial,sans-serif;line-height:1.2}
        .canvas-template-campo-cabecalho{display:flex;flex-direction:column;justify-content:center}
        .canvas-template-campo-cabecalho [data-texto-campo],.canvas-template-campo-cabecalho [data-campo]{height:auto!important;min-height:0!important}
        /* O texto tem a altura do conteúdo (a fonte diminui para caber), sem barra de rolagem. */
        .canvas-template-campo [data-texto-campo]{height:auto!important;min-height:0;overflow:visible;white-space:pre-wrap;overflow-wrap:anywhere}
        .canvas-template-campo textarea{box-sizing:border-box;width:100%;max-height:100%;overflow:auto!important;border:0!important;background:transparent!important;padding:0!important;font:inherit!important;line-height:inherit!important}
`

export default function CanvasDocumento({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  return (
    <>
      <style>{ESTILO_CANVAS}</style>
      <FormularioDocumento<Canvas>
        tipo="CANVAS" documento="Canvas" titulo="Canvas do Projeto" arquivo="canvas-do-projeto.docx"
        membros={membros} inicial={CANVAS_INICIAL} normalizar={normalizar} render={r => <FolhaCanvas {...r} />} paisagem
      />
    </>
  )
}
