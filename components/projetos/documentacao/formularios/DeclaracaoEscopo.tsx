'use client'

import type { ReactNode } from 'react'
import { CampoTexto, Folha, SecaoTexto, useEditorFolha } from '@/components/documentos/editor/folha'
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

type Secao = { campo: CampoEscopo; titulo: string; ajuda: string; dica: string }

/** Seções de texto; a dica de cada uma é a instrução do modelo "14 Aula GP", entre < >. */
const SECOES: Secao[] = [
  { campo: 'justificativa', titulo: 'Justificativa do projeto', ajuda: 'A razão pela qual o projeto é necessário, os objetivos estratégicos associados e os benefícios que ele trará. Vem do Termo de Abertura.', dica: '<citar a razão pela qual o projeto é necessário, os objetivos estratégicos associados, e os benefícios que o projeto trará>' },
  { campo: 'objetivos', titulo: 'Objetivo(s) do projeto', ajuda: 'O que se quer alcançar com os resultados do projeto, relacionado aos objetivos estratégicos. Vem do Termo de Abertura.', dica: '<descrever o(s) objetivo(s) do projeto, ou seja, o que se quer alcançar com os resultados do projeto, e relacioná-lo(s) com o(s) objetivo(s) estratégico(s) da empresa>' },
  { campo: 'descricaoProduto', titulo: 'Descrição do(s) produto(s) ou serviço(s) do projeto', ajuda: 'Os produtos e serviços que serão entregues pelo projeto. Vem do Termo de Abertura.', dica: '<citar e descrever os produtos e serviços que serão entregues pelo projeto>' },
]
const SECOES_FIM: Secao[] = [
  { campo: 'ligacoes', titulo: 'Ligações com outros projetos', ajuda: 'A interdependência com outros projetos da organização. Se não houver, escreva que não há ligação.', dica: '<caso haja, colocar a interdependência entre os projetos da organização>' },
  { campo: 'estrategia', titulo: 'Estratégia de condução do projeto', ajuda: 'A estratégia para conduzir o projeto com sucesso: divisão de funções, comunicação, reuniões, acompanhamento.', dica: '<descrever qual a estratégia a ser utilizada para a condução do projeto (com sucesso)>' },
  { campo: 'responsabilidades', titulo: 'Responsabilidades dos setores envolvidos', ajuda: 'O que cada pessoa ou setor faz para produzir o escopo. Uma linha por pessoa: "Nome – Função: responsabilidades".', dica: '<citar o que cada setor do projeto é responsável para a produção do escopo do projeto>' },
]

type NoEntrega = { codigo: string; titulo: string }

/** Exemplo mostrado só na edição enquanto o projeto não tem EAP (como o exemplo do WBSTool). */
const EXEMPLO_ENTREGAS: { raiz: NoEntrega; itens: NoEntrega[] } = {
  raiz: { codigo: '1', titulo: 'Nome do projeto (exemplo)' },
  itens: [
    { codigo: '1.1', titulo: 'Atividades iniciais' },
    { codigo: '1.2', titulo: 'Editar' },
    { codigo: '1.3', titulo: 'Elemento' },
    { codigo: '1.4', titulo: 'Organizar' },
    { codigo: '1.5', titulo: 'Download' },
    { codigo: '1.6', titulo: 'Ajuda' },
  ],
}

/** Largura útil da coluna das entregas na folha A4 (82% de ~190 mm, menos margens). */
const LARGURA_ENTREGAS_MM = 150
const PT_EM_MM = 0.3528
/** Largura média de um caractere em Calibri/Arial, em "em" (com folga para letras largas). */
const LARGURA_CARACTERE_EM = 0.58

/**
 * Fonte das caixas do nível 2: diminui com a quantidade e com a palavra mais
 * longa, para cada palavra caber inteira na largura da caixa (quebra só nos espaços).
 */
export function fonteDasCaixas(itens: NoEntrega[]): number {
  const n = Math.max(itens.length, 1)
  const base = n <= 4 ? 9 : n <= 6 ? 8 : n <= 8 ? 7 : 6.5
  const larguraCaixaMm = LARGURA_ENTREGAS_MM / n - 3
  const maiorPalavra = Math.max(1, ...itens.flatMap(i => `${i.codigo} ${i.titulo}`.split(/\s+/)).map(p => p.length))
  const cabe = larguraCaixaMm / (maiorPalavra * LARGURA_CARACTERE_EM * PT_EM_MM)
  return Math.max(4.5, Math.min(base, Math.floor(cabe * 2) / 2))
}
const linhaEap = '1px solid #2f528f'

function CaixaEntrega({ no, fonte, largura }: { no: NoEntrega; fonte: string; largura?: string }) {
  return (
    <div style={{
      display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', width: largura, minHeight: '10mm',
      margin: '0 auto', padding: '2px 3px', border: linhaEap, borderRadius: '2mm', background: '#4472c4', color: '#fff',
      fontFamily: FONTE_FORMULARIO, fontSize: fonte, lineHeight: 1.15, textAlign: 'center',
      overflowWrap: 'anywhere', hyphens: 'auto', wordBreak: 'break-word',
    }}>{`${no.codigo} ${no.titulo}`}</div>
  )
}

/**
 * Árvore com o nível 1 (projeto) em cima e o nível 2 lado a lado, ligados por
 * linhas como numa EAP gráfica. As caixas dividem a largura por igual e a fonte
 * diminui com a quantidade, então nenhum texto sai da caixa.
 */
function ArvoreEntregas({ raiz, itens }: { raiz: NoEntrega; itens: NoEntrega[] }) {
  const n = itens.length
  const fonte = `${fonteDasCaixas(itens)}pt`
  return (
    <div lang="pt-BR" style={{ padding: '3mm 1mm 3mm' }}>
      <CaixaEntrega no={raiz} fonte={n > 8 ? '8pt' : '9pt'} largura="55%" />
      {n > 0 && <>
        <div style={{ width: 0, height: '3mm', margin: '0 auto', borderLeft: linhaEap }} />
        <div style={{ display: 'flex' }}>
          {itens.map((item, i) => (
            <div key={item.codigo} style={{ flex: '1 1 0', minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', padding: '3mm 1mm 0' }}>
              {/* Linha horizontal do meio da primeira caixa ao meio da última, e o ramo de cada caixa. */}
              {n > 1 && <div style={{ position: 'absolute', top: 0, left: i === 0 ? '50%' : 0, right: i === n - 1 ? '50%' : 0, borderTop: linhaEap }} />}
              <div style={{ position: 'absolute', top: 0, left: '50%', height: '3mm', borderLeft: linhaEap }} />
              <CaixaEntrega no={item} fonte={fonte} largura="100%" />
            </div>
          ))}
        </div>
      </>}
    </div>
  )
}

/**
 * Lista de entregas: só os níveis 1 e 2 da EAP (instrução do professor). Sem
 * EAP, a edição mostra um exemplo esmaecido; o PDF e o Word ficam em branco.
 */
function ListaEntregas({ entregas }: { entregas: DadosFormularios['entregas'] }) {
  const { editavel } = useEditorFolha()
  const exemplo = !entregas.raiz
  return (
    <table data-testid="escopo-entregas" style={{ ...tabelaGP, marginTop: -1 }}>
      <colgroup><col style={{ width: '18%' }} /><col /></colgroup>
      <tbody><tr>
        <td style={{ ...celulaGP, verticalAlign: 'middle' }}><strong>Lista de entregas do projeto</strong></td>
        <td style={{ ...celulaGP, padding: 0 }}>
          {!exemplo && entregas.raiz && <ArvoreEntregas raiz={entregas.raiz} itens={entregas.itens} />}
          {exemplo && editavel && (
            <div data-testid="escopo-entregas-exemplo">
              <div style={{ opacity: 0.45 }}><ArvoreEntregas {...EXEMPLO_ENTREGAS} /></div>
              <div style={{ padding: '0 5px 2px', color: '#6b7280', fontStyle: 'italic', fontSize: '9pt' }}>Exemplo. Monte a EAP do projeto: o nível 1 e o nível 2 aparecem aqui.</div>
            </div>
          )}
        </td>
      </tr></tbody>
    </table>
  )
}

export function FolhasEscopo({ conteudo, sistema, versaoPadrao, alterar, edicao }: RenderFormulario<Escopo>) {
  const secao = ({ campo, titulo, ajuda, dica }: Secao): ReactNode => (
    <SecaoTexto key={campo} estilo="interno" colado titulo={titulo} alturaMinima="auto">
      <CampoTexto id={`escopo-${campo}`} rotulo={titulo} ajuda={ajuda} dica={dica} valor={conteudo[campo]} onChange={v => alterar?.(c => ({ ...c, [campo]: v }))} alinhamento="justify" max={20000} />
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
