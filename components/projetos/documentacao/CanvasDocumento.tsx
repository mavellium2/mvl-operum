'use client'

import { CampoTexto, Folha } from '@/components/documentos/editor/folha'
import type { CabecalhoFormulario } from '@/lib/validation/formulariosGP'
import type { CanvasConteudo } from '@/lib/validation/documentRevisionSchemas'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import FormularioDocumento, { type DadosFormularios, type RenderFormulario } from './formularios/FormularioDocumento'

type Canvas = Omit<CanvasConteudo, 'cabecalho'> & { cabecalho: CabecalhoFormulario }
type CampoCanvas = Exclude<keyof Canvas, 'cabecalho'>

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

function Bloco({ id, titulo, valor, alterar, classe = '' }: {
  id: CampoCanvas
  titulo: string
  valor: string
  alterar?: RenderFormulario<Canvas>['alterar']
  classe?: string
}) {
  return (
    <section className={`canvas-projeto-bloco ${classe}`}>
      <h2>{titulo}</h2>
      <CampoTexto
        id={`canvas-${id}`}
        rotulo={titulo}
        ajuda={`Conteúdo do bloco ${titulo} do Canvas.`}
        dica={`Escreva aqui: ${titulo.toLocaleLowerCase('pt-BR')}`}
        valor={valor}
        onChange={novo => alterar?.(atual => ({ ...atual, [id]: novo }))}
        max={20000}
        formatavel
      />
    </section>
  )
}

function CampoCabecalho({ id, titulo, valor, alterar, classe = '' }: {
  id: 'projeto' | 'solicitante' | 'gerente'
  titulo: string
  valor: string
  alterar?: RenderFormulario<Canvas>['alterar']
  classe?: string
}) {
  return (
    <section className={`canvas-projeto-cabecalho ${classe}`}>
      <strong>{titulo}</strong>
      <CampoTexto id={`canvas-${id}`} rotulo={titulo} valor={valor}
        onChange={novo => alterar?.(atual => ({ ...atual, [id]: novo }))} max={1000} />
    </section>
  )
}

export function FolhaCanvas({ conteudo, alterar }: RenderFormulario<Canvas>) {
  const campos: { id: CampoCanvas; titulo: string; classe?: string }[] = [
    { id: 'justificativa', titulo: 'JUSTIFICATIVA (Por quê?)' },
    { id: 'objetivos', titulo: 'OBJETIVO (Para quê?)' },
    { id: 'escopo', titulo: 'ESCOPO (O quê?)' },
    { id: 'escopoNaoIncluido', titulo: 'ESCOPO NÃO INCLUÍDO (O que não?)' },
    { id: 'estrategia', titulo: 'ESTRATÉGIA DE CONDUÇÃO (Como?)' },
    { id: 'stakeholders', titulo: 'STAKEHOLDERS (Com quem?)' },
    { id: 'comunicacao', titulo: 'COMUNICAÇÃO' },
    { id: 'restricoes', titulo: 'RESTRIÇÕES (Imposições)' },
    { id: 'premissas', titulo: 'PREMISSAS (Hipóteses)' },
    { id: 'riscos', titulo: 'RISCOS (Ameaças e Oportunidades)' },
    { id: 'fases', titulo: 'FASES (2º nível da EAP)' },
    { id: 'cronograma', titulo: 'CRONOGRAMA (Quando?)' },
    { id: 'orcamento', titulo: 'ORÇAMENTO (Por quanto?)' },
  ]
  const bloco = (id: CampoCanvas, classe = '') => {
    const campo = campos.find(item => item.id === id)!
    return <Bloco key={id} {...campo} valor={conteudo[id]} alterar={alterar} classe={classe} />
  }
  return (
    <Folha paisagem data-testid="canvas-folha" style={{ gap: '3mm', fontSize: '8pt' }}>
      <header className="canvas-projeto-topo">
        <CampoCabecalho id="projeto" titulo="PROJETO" valor={conteudo.projeto} alterar={alterar} />
        <CampoCabecalho id="solicitante" titulo="SOLICITANTE" valor={conteudo.solicitante} alterar={alterar} />
        <CampoCabecalho id="gerente" titulo="GP" valor={conteudo.gerente} alterar={alterar} />
      </header>
      <div className="canvas-projeto-linha canvas-projeto-linha-4">{['justificativa', 'objetivos', 'escopo', 'escopoNaoIncluido'].map(id => bloco(id as CampoCanvas))}</div>
      <div className="canvas-projeto-linha canvas-projeto-linha-5">{['estrategia', 'stakeholders', 'comunicacao', 'restricoes', 'premissas'].map(id => bloco(id as CampoCanvas))}</div>
      <div className="canvas-projeto-linha canvas-projeto-linha-final">
        {bloco('riscos', 'canvas-projeto-riscos')}
        <div className="canvas-projeto-coluna">{bloco('fases')}{bloco('cronograma')}{bloco('orcamento')}</div>
      </div>
    </Folha>
  )
}

function normalizar(salvo: Canvas, sistema: DadosFormularios, membros: MembroEquipeOption[]): Canvas {
  const inicial = CANVAS_INICIAL(sistema, membros)
  return { ...inicial, ...salvo, cabecalho: salvo.cabecalho ?? {} }
}

export default function CanvasDocumento({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  return (
    <>
      <style>{`
        .canvas-projeto-topo{display:grid;grid-template-columns:minmax(20mm,2fr) minmax(18mm,1fr) minmax(18mm,1fr);align-items:stretch;gap:2mm;font-family:Arial,sans-serif;color:#26313d}
        .canvas-projeto-cabecalho{border:1px solid #87909a;background:#fffed0;padding:1mm 2mm;min-width:0}
        .canvas-projeto-cabecalho strong{display:block;font-size:7pt}
        .canvas-projeto-cabecalho [data-campo],.canvas-projeto-cabecalho [data-texto-campo]{min-height:1.2em}
        .canvas-projeto-linha{display:grid;gap:1.5mm;align-items:stretch}
        .canvas-projeto-linha-4{grid-template-columns:1fr 1fr 2fr 1fr}
        .canvas-projeto-linha-5{grid-template-columns:1fr 1fr .9fr 1.1fr 1fr}
        .canvas-projeto-linha-final{grid-template-columns:1.1fr 3fr}
        .canvas-projeto-coluna{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1.5mm}
        .canvas-projeto-bloco{border:1px solid #87909a;background:#fffed0;padding:1.5mm 2mm;min-width:0;overflow:hidden}
        .canvas-projeto-bloco h2{font:700 7.8pt/1.15 Arial,sans-serif;color:#26313d;text-align:center;margin:0 0 1mm}
        .canvas-projeto-bloco [data-texto-campo]{min-height:15mm;white-space:pre-wrap;overflow-wrap:anywhere}
        .canvas-projeto-bloco textarea{font:inherit!important;line-height:1.2!important;min-height:15mm}
        .canvas-projeto-riscos [data-texto-campo],.canvas-projeto-riscos textarea{min-height:30mm}
      `}</style>
      <FormularioDocumento<Canvas>
        tipo="CANVAS" documento="Canvas" titulo="Canvas do Projeto" arquivo="canvas-do-projeto.docx"
        membros={membros} inicial={CANVAS_INICIAL} normalizar={normalizar} render={r => <FolhaCanvas {...r} />} paisagem
      />
    </>
  )
}
