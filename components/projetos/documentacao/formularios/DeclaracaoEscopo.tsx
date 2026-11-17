'use client'

import type { ReactNode } from 'react'
import { CampoTexto, Folha, SecaoTexto } from '@/components/documentos/editor/folha'
import type { CabecalhoFormulario, EscopoConteudo } from '@/lib/validation/formulariosGP'
import type { MembroEquipeOption } from '../MembroEquipeSelect'
import FormularioDocumento, { type DadosFormularios, type RenderFormulario } from './FormularioDocumento'
import { celulaGP, FONTE_FORMULARIO, nomeEFuncao, QuadroFormulario, tabelaGP, TituloFormulario } from './QuadroFormulario'

export const TITULO_ESCOPO = 'Declaração do Escopo'

type Escopo = Required<Omit<EscopoConteudo, 'cabecalho'>> & { cabecalho: CabecalhoFormulario }
type CampoEscopo = Exclude<keyof Escopo, 'cabecalho'>

/**
 * Documento novo: Justificativa, Objetivos e Descrição do produto partem do
 * Termo de Abertura vigente; Responsabilidades lista a equipe com a função de
 * cada um ("Nome – Função: …"). Tudo continua editável na folha.
 */
export function escopoInicial(sistema: DadosFormularios, membros: MembroEquipeOption[]): Escopo {
  return {
    cabecalho: {},
    justificativa: sistema.termo.justificativa,
    objetivos: sistema.termo.objetivos,
    descricaoProduto: sistema.termo.descricaoProduto,
    ligacoes: '',
    estrategia: '',
    responsabilidades: membros.map(m => `${nomeEFuncao(m.name, m.setor ?? '')}: `).join('\n'),
  }
}

export function escopoNormalizado(salvo: EscopoConteudo): Escopo {
  return {
    cabecalho: salvo.cabecalho ?? {},
    justificativa: salvo.justificativa ?? '', objetivos: salvo.objetivos ?? '', descricaoProduto: salvo.descricaoProduto ?? '',
    ligacoes: salvo.ligacoes ?? '', estrategia: salvo.estrategia ?? '', responsabilidades: salvo.responsabilidades ?? '',
  }
}

const SECOES: { campo: CampoEscopo; titulo: string; ajuda: string; pergunta: string }[] = [
  { campo: 'justificativa', titulo: 'Justificativa do projeto', ajuda: 'A razão pela qual o projeto é necessário, os objetivos estratégicos associados e os benefícios que ele trará. Vem do Termo de Abertura.', pergunta: 'por que o projeto é necessário e que benefícios trará?' },
  { campo: 'objetivos', titulo: 'Objetivo(s) do projeto', ajuda: 'O que se quer alcançar com os resultados do projeto, relacionado aos objetivos estratégicos. Vem do Termo de Abertura.', pergunta: 'o que se quer alcançar com o projeto?' },
  { campo: 'descricaoProduto', titulo: 'Descrição do(s) produto(s) ou serviço(s) do projeto', ajuda: 'Os produtos e serviços que serão entregues pelo projeto. Vem do Termo de Abertura.', pergunta: 'quais produtos ou serviços serão entregues?' },
]
const SECOES_FIM: typeof SECOES = [
  { campo: 'ligacoes', titulo: 'Ligações com outros projetos', ajuda: 'A interdependência com outros projetos da organização. Se não houver, escreva que não há ligação.', pergunta: 'há interdependência com outros projetos?' },
  { campo: 'estrategia', titulo: 'Estratégia de condução do projeto', ajuda: 'A estratégia para conduzir o projeto com sucesso: divisão de funções, comunicação, reuniões, acompanhamento.', pergunta: 'como o projeto será conduzido?' },
  { campo: 'responsabilidades', titulo: 'Responsabilidades dos setores envolvidos', ajuda: 'O que cada pessoa ou setor faz para produzir o escopo. Uma linha por pessoa: "Nome – Função: responsabilidades".', pergunta: 'pelo que cada setor ou pessoa é responsável?' },
]

/** Caixa de entrega: azul da EAP, texto branco centralizado. */
const caixaEntrega = { ...celulaGP, background: '#4472c4', color: '#fff', textAlign: 'center' as const, verticalAlign: 'middle' as const, fontSize: '8pt', lineHeight: 1.2, padding: '3px 4px' }

/**
 * Lista de entregas: só os níveis 1 e 2 da EAP (instrução do professor), em
 * caixas como a EAP gráfica: o projeto em cima e as entregas lado a lado.
 */
function ListaEntregas({ entregas }: { entregas: DadosFormularios['entregas'] }) {
  const n = Math.max(entregas.itens.length, 1)
  const rotulo = <strong>Lista de entregas do projeto</strong>
  if (!entregas.raiz) {
    return (
      <table data-testid="escopo-entregas" style={{ ...tabelaGP, marginTop: -1 }}>
        <colgroup><col style={{ width: '18%' }} /><col /></colgroup>
        <tbody><tr>
          <td style={{ ...celulaGP, verticalAlign: 'middle' }}>{rotulo}</td>
          <td style={{ ...celulaGP, color: '#6b7280', fontStyle: 'italic' }}>Monte a EAP do projeto: o nível 1 e o nível 2 aparecem aqui.</td>
        </tr></tbody>
      </table>
    )
  }
  const largura = `${82 / n}%`
  return (
    <table data-testid="escopo-entregas" style={{ ...tabelaGP, marginTop: -1 }}>
      <colgroup><col style={{ width: '18%' }} />{Array.from({ length: n }, (_, i) => <col key={i} style={{ width: largura }} />)}</colgroup>
      <tbody>
        <tr>
          <td rowSpan={2} style={{ ...celulaGP, verticalAlign: 'middle' }}>{rotulo}</td>
          <td colSpan={n} style={{ ...celulaGP, textAlign: 'center', borderBottom: 'none', padding: '4px 0 6px' }}>
            <span style={{ display: 'inline-block', ...caixaEntrega, border: '1px solid #2f528f', minWidth: '40%' }}>{`${entregas.raiz.codigo}. ${entregas.raiz.titulo}`}</span>
          </td>
        </tr>
        <tr>
          {entregas.itens.length === 0
            ? <td style={{ ...celulaGP, borderTop: 'none', color: '#6b7280', fontStyle: 'italic', textAlign: 'center' }}>Sem entregas no nível 2 da EAP.</td>
            : entregas.itens.map(item => (
              <td key={item.codigo} style={{ ...celulaGP, borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '0 2px 6px', verticalAlign: 'top' }}>
                <div style={{ ...caixaEntrega, border: '1px solid #2f528f', minHeight: '12mm', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{`${item.codigo} ${item.titulo}`}</div>
              </td>
            ))}
        </tr>
      </tbody>
    </table>
  )
}

export function FolhasEscopo({ conteudo, sistema, versaoPadrao, alterar, edicao }: RenderFormulario<Escopo>) {
  const secao = ({ campo, titulo, ajuda, pergunta }: (typeof SECOES)[number]): ReactNode => (
    <SecaoTexto key={campo} estilo="interno" colado titulo={titulo} alturaMinima="auto">
      <CampoTexto id={`escopo-${campo}`} rotulo={titulo} ajuda={ajuda} pergunta={pergunta} valor={conteudo[campo]} onChange={v => alterar?.(c => ({ ...c, [campo]: v }))} alinhamento="justify" max={20000} />
    </SecaoTexto>
  )
  return (
    <Folha data-testid="escopo-folha" rodape={`© ${TITULO_ESCOPO}`} style={{ fontFamily: FONTE_FORMULARIO, fontSize: '10pt', gap: 0 }}>
      <TituloFormulario titulo={TITULO_ESCOPO} logoUrl={sistema.logoUrl} />
      <div style={{ height: '4mm' }} />
      <QuadroFormulario testId="escopo-quadro" prefixoId="escopo" sistema={sistema} cabecalho={conteudo.cabecalho} versaoPadrao={versaoPadrao}
        edicao={edicao && { ...edicao, onCabecalho: cab => alterar?.(c => ({ ...c, cabecalho: cab })) }} />
      <div style={{ height: '4mm' }} />
      {SECOES.map(secao)}
      <ListaEntregas entregas={sistema.entregas} />
      {SECOES_FIM.map(secao)}
    </Folha>
  )
}

const normalizar = (salvo: Escopo) => escopoNormalizado(salvo)
const renderizar = (r: RenderFormulario<Escopo>) => <FolhasEscopo {...r} />

/** Declaração do Escopo no modelo "14 Aula GP" do professor. */
export default function DeclaracaoEscopo({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  return (
    <FormularioDocumento<Escopo>
      tipo="ESCOPO" documento={TITULO_ESCOPO} titulo={TITULO_ESCOPO} arquivo="declaracao-do-escopo.docx"
      membros={membros} inicial={escopoInicial} normalizar={normalizar} render={renderizar}
    />
  )
}
