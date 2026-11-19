'use client'

import { CampoTexto, Folha } from '@/components/documentos/editor/folha'
import PostIt from '@/components/ui/PostIt'
import { ICONES_CANVAS, IconeCanvas } from './canvas/IconesCanvas'
import type { CabecalhoFormulario } from '@/lib/validation/formulariosGP'
import type { CanvasConteudo } from '@/lib/validation/documentRevisionSchemas'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import FormularioDocumento, { type DadosFormularios, type RenderFormulario } from './formularios/FormularioDocumento'

type Canvas = Omit<CanvasConteudo, 'cabecalho'> & { cabecalho: CabecalhoFormulario }
type CampoCanvas = Exclude<keyof Canvas, 'cabecalho'>

const POSTITS_CANVAS = [
  { id: 'projeto', x: 98, y: 49, width: 447, height: 42 },
  { id: 'solicitante', x: 653, y: 49, width: 147, height: 38 },
  { id: 'gerente', x: 848, y: 49, width: 146, height: 38 },
  { id: 'justificativa', x: 20, y: 151, width: 180, height: 145 },
  { id: 'objetivos', x: 213, y: 145, width: 180, height: 157 },
  { id: 'escopo', x: 419, y: 166, width: 374, height: 130 },
  { id: 'escopoNaoIncluido', x: 821, y: 180, width: 164, height: 122 },
  { id: 'estrategia', x: 28, y: 388, width: 147, height: 117 },
  { id: 'stakeholders', x: 224, y: 372, width: 156, height: 133 },
  { id: 'comunicacao', x: 426, y: 360, width: 152, height: 143 },
  { id: 'restricoes', x: 607, y: 377, width: 189, height: 128 },
  { id: 'premissas', x: 829, y: 380, width: 157, height: 130 },
  { id: 'riscos', x: 99, y: 569, width: 225, height: 164 },
  { id: 'fases', x: 416, y: 584, width: 171, height: 140 },
  { id: 'cronograma', x: 607, y: 578, width: 193, height: 157 },
  { id: 'orcamento', x: 813, y: 591, width: 183, height: 137 },
]

export const CANVAS_INICIAL = (sistema: DadosFormularios, membros: MembroEquipeOption[]): Canvas => ({
  cabecalho: {},
  projeto: sistema.nomeProjeto,
  solicitante: '',
  gerente: sistema.gerente.nome,
  justificativa: sistema.termo.justificativa,
  objetivos: sistema.termo.objetivos,
  escopo: sistema.termo.descricaoProduto,
  escopoNaoIncluido: '',
  estrategia: '',
  stakeholders: membros.map(m => m.name).join('\n'),
  comunicacao: '',
  restricoes: '',
  premissas: '',
  riscos: '',
  fases: '',
  cronograma: '',
  orcamento: '',
})

function CampoCanvas({ id, titulo, valor, alterar, area, rotulo }: {
  id: CampoCanvas
  titulo: string
  valor: string
  alterar?: RenderFormulario<Canvas>['alterar']
  area: { x: number; y: number; width: number; height: number; fontSize?: number }
  rotulo?: { x: number; y: number; width: number; height: number }
}) {
  return (
    <>
      {rotulo && <h2 className="canvas-template-titulo" style={{ left: `${rotulo.x}pt`, top: `${rotulo.y}pt`, width: `${rotulo.width}pt`, height: `${rotulo.height}pt` }}>{titulo}</h2>}
      <div className="canvas-template-campo" style={{ left: `${area.x}pt`, top: `${area.y}pt`, width: `${area.width}pt`, height: `${area.height}pt`, fontSize: `${area.fontSize ?? 8}pt` }}>
        <CampoTexto id={`canvas-${id}`} rotulo={titulo} ajuda={`Conteúdo do bloco ${titulo} do Canvas.`}
          dica={`Escreva aqui: ${titulo.toLocaleLowerCase('pt-BR')}`} valor={valor}
          onChange={novo => alterar?.(atual => ({ ...atual, [id]: novo }))} max={20000} formatavel />
      </div>
    </>
  )
}

function CampoCabecalho({ id, titulo, valor, alterar, label, area, alinhamento = 'left' }: {
  id: 'projeto' | 'solicitante' | 'gerente'
  titulo: string
  valor: string
  alterar?: RenderFormulario<Canvas>['alterar']
  label: { x: number; y: number; width: number; height: number }
  area: { x: number; y: number; width: number; height: number; fontSize?: number }
  alinhamento?: 'left' | 'center'
}) {
  return (
    <>
      <strong className="canvas-template-label" style={{ left: `${label.x}pt`, top: `${label.y}pt`, width: `${label.width}pt`, height: `${label.height}pt` }}>{titulo}</strong>
      <div className="canvas-template-campo" style={{ left: `${area.x}pt`, top: `${area.y}pt`, width: `${area.width}pt`, height: `${area.height}pt`, fontSize: `${area.fontSize ?? 11}pt`, textAlign: alinhamento }}>
        <CampoTexto id={`canvas-${id}`} rotulo={titulo} valor={valor} alinhamento={alinhamento}
          onChange={novo => alterar?.(atual => ({ ...atual, [id]: novo }))} max={1000} />
      </div>
    </>
  )
}

export function FolhaCanvas({ conteudo, alterar }: RenderFormulario<Canvas>) {
  return (
    <Folha paisagem fixa data-testid="canvas-folha" style={{ width: '355.6mm', height: '267.7mm', padding: 0, gap: 0, overflow: 'hidden', position: 'relative', fontFamily: 'Arial, sans-serif', fontSize: '8pt', lineHeight: 1.2 }}>
      {/* Base gráfica do DOCX sem os cartões; os post-its são componentes editáveis e redimensionáveis. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="canvas-template-fundo" src="/images/project-canvas-grid.png" alt="" />
      {/* Ícones dos blocos no padrão do Operum (fora da arte de fundo). */}
      {ICONES_CANVAS.map(icone => <IconeCanvas key={icone.id} {...icone} />)}
      {POSTITS_CANVAS.map(postIt => (
        <PostIt key={postIt.id} className="canvas-template-postit" placeholder=""
          style={{ position: 'absolute', left: `${postIt.x}pt`, top: `${postIt.y}pt`, width: `${postIt.width}pt`, height: `${postIt.height}pt` }} />
      ))}
      <CampoCabecalho id="projeto" titulo="PROJETO:" valor={conteudo.projeto} alterar={alterar} alinhamento="center" label={{ x: 16, y: 54, width: 58, height: 22 }} area={{ x: 98, y: 50, width: 447, height: 38 }} />
      <CampoCabecalho id="solicitante" titulo="SOLICITANTE:" valor={conteudo.solicitante} alterar={alterar} alinhamento="center" label={{ x: 548, y: 36, width: 104, height: 35 }} area={{ x: 653, y: 50, width: 147, height: 38 }} />
      <CampoCabecalho id="gerente" titulo="GP:" valor={conteudo.gerente} alterar={alterar} alinhamento="center" label={{ x: 809, y: 16, width: 35, height: 26 }} area={{ x: 848, y: 50, width: 146, height: 38 }} />
      <CampoCanvas id="justificativa" titulo="JUSTIFICATIVA (Por quê?)" valor={conteudo.justificativa} alterar={alterar} rotulo={{ x: 45, y: 99, width: 172, height: 38 }} area={{ x: 20, y: 154, width: 178, height: 142, fontSize: 4.6 }} />
      <CampoCanvas id="objetivos" titulo="OBJETIVO (Para quê?)" valor={conteudo.objetivos} alterar={alterar} rotulo={{ x: 255, y: 99, width: 162, height: 38 }} area={{ x: 213, y: 147, width: 180, height: 156, fontSize: 4.2 }} />
      <CampoCanvas id="escopo" titulo="ESCOPO (O quê?)" valor={conteudo.escopo} alterar={alterar} rotulo={{ x: 468, y: 99, width: 290, height: 38 }} area={{ x: 419, y: 169, width: 370, height: 127, fontSize: 11 }} />
      <CampoCanvas id="escopoNaoIncluido" titulo="ESCOPO NÃO INCLUÍDO (O que não?)" valor={conteudo.escopoNaoIncluido} alterar={alterar} rotulo={{ x: 824, y: 99, width: 172, height: 51 }} area={{ x: 821, y: 182, width: 164, height: 121, fontSize: 11 }} />
      <CampoCanvas id="estrategia" titulo="ESTRATÉGIA DE CONDUÇÃO (Como?)" valor={conteudo.estrategia} alterar={alterar} rotulo={{ x: 42, y: 316, width: 150, height: 59 }} area={{ x: 28, y: 391, width: 147, height: 112, fontSize: 10 }} />
      <CampoCanvas id="stakeholders" titulo="STAKEHOLDERS (Com quem?)" valor={conteudo.stakeholders} alterar={alterar} rotulo={{ x: 228, y: 316, width: 177, height: 56 }} area={{ x: 224, y: 374, width: 155, height: 135, fontSize: 10 }} />
      <CampoCanvas id="comunicacao" titulo="COMUNICAÇÃO" valor={conteudo.comunicacao} alterar={alterar} rotulo={{ x: 438, y: 341, width: 187, height: 24 }} area={{ x: 426, y: 362, width: 151, height: 143, fontSize: 15 }} />
      <CampoCanvas id="restricoes" titulo="RESTRIÇÕES (Imposições)" valor={conteudo.restricoes} alterar={alterar} rotulo={{ x: 625, y: 341, width: 173, height: 34 }} area={{ x: 607, y: 378, width: 195, height: 128, fontSize: 6.5 }} />
      <CampoCanvas id="premissas" titulo="PREMISSAS (Hipóteses)" valor={conteudo.premissas} alterar={alterar} rotulo={{ x: 830, y: 341, width: 174, height: 34 }} area={{ x: 829, y: 382, width: 157, height: 128, fontSize: 6.5 }} />
      <CampoCanvas id="riscos" titulo="RISCOS (Ameaças e Oportunidades)" valor={conteudo.riscos} alterar={alterar} rotulo={{ x: 52, y: 548, width: 319, height: 27 }} area={{ x: 99, y: 577, width: 222, height: 150, fontSize: 10 }} />
      <CampoCanvas id="fases" titulo="FASES (2º nível da EAP)" valor={conteudo.fases} alterar={alterar} rotulo={{ x: 438, y: 548, width: 173, height: 37 }} area={{ x: 416, y: 587, width: 171, height: 137, fontSize: 7.4 }} />
      <CampoCanvas id="cronograma" titulo="CRONOGRAMA (Quando?)" valor={conteudo.cronograma} alterar={alterar} rotulo={{ x: 610, y: 548, width: 196, height: 37 }} area={{ x: 607, y: 585, width: 193, height: 145, fontSize: 7.4 }} />
      <CampoCanvas id="orcamento" titulo="ORÇAMENTO (Por quanto?)" valor={conteudo.orcamento} alterar={alterar} rotulo={{ x: 816, y: 548, width: 186, height: 37 }} area={{ x: 813, y: 598, width: 183, height: 133, fontSize: 7.4 }} />
    </Folha>
  )
}

function normalizar(salvo: Canvas, sistema: DadosFormularios, membros: MembroEquipeOption[]): Canvas {
  const inicial = CANVAS_INICIAL(sistema, membros)
  return { ...inicial, ...salvo, cabecalho: salvo.cabecalho ?? {} }
}

/** Estilos da folha do Canvas (posições sobre a arte de fundo, post-its, ícones e campos). */
export const ESTILO_CANVAS = `
        .canvas-template-fundo{position:absolute;left:0;top:42pt;width:1008pt;height:711pt;max-width:none;object-fit:fill;z-index:0;pointer-events:none}
        .canvas-template-postit{position:absolute;z-index:1;filter:drop-shadow(1px 2px 2px rgb(0 0 0 / 32%))}
        .canvas-template-label,.canvas-template-titulo,.canvas-template-campo{position:absolute;z-index:2;box-sizing:border-box;color:#27313d}
        .canvas-template-label{font:700 15pt/1.05 Arial,sans-serif;overflow:hidden}
        .canvas-template-titulo{font:700 15pt/1.1 Arial,sans-serif;text-align:center;margin:0;overflow:hidden}
        .canvas-template-campo{overflow:hidden;padding:2pt 3pt;font:8pt/1.2 Arial,sans-serif}
        .canvas-template-campo [data-texto-campo]{height:100%;min-height:100%;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
        .canvas-template-campo textarea{box-sizing:border-box;width:100%;max-height:100%;overflow:auto!important;border:0!important;background:transparent!important;padding:0!important;font:inherit!important;line-height:inherit!important}
        @media print{.canvas-template-campo [data-texto-campo],.canvas-template-campo textarea{overflow:hidden!important}.canvas-template-fundo{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      `

export default function CanvasDocumento({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  return (
    <>
      <style>{ESTILO_CANVAS}</style>
      <FormularioDocumento<Canvas>
        tipo="CANVAS" documento="Canvas" titulo="Canvas do Projeto" arquivo="canvas-do-projeto.docx"
        membros={membros} inicial={CANVAS_INICIAL} normalizar={normalizar} render={r => <FolhaCanvas {...r} />} paisagem pageSize={{ widthMm: 355.6, heightMm: 267.7 }}
      />
    </>
  )
}
