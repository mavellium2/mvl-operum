'use client'

import GrupoEnvolvidos, { EnvolvidosLayout } from './GrupoEnvolvidos'
import { linhaOuAviso } from '@/lib/linhaInstitucional'
import EnvolvidosEditor from './EnvolvidosEditor'
import { exibirEnvolvidos } from '@/lib/charterEnvolvidos'
import { forwardRef } from 'react'
import type { MacroFase } from './MacroFaseTable'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import { formatDateBR } from '@/lib/date'
import { parseDocumentCost } from '@/lib/documentCost'
import AssinaturaEmLinha from '@/components/documentos/AssinaturaEmLinha'
import {
  CampoAutomatico, CampoData, CampoPessoa, CampoTexto, Folha, LinhaLista,
  SecaoTabela, SecaoTexto, useEditorFolha,
} from '@/components/documentos/editor/folha'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CharterDocumentProps {
  /** Linha cinza do topo (instituição / curso / termo / semestre). */
  categoria?: string
  nomeProjeto: string
  logoUrl?: string | null
  gerenteProjeto: string
  gerenteSignatureUrl?: string | null
  startDate?: string | null
  elaboradoPor: string
  aprovadoPor: string
  versao: string
  dataAprovacao: string
  justificativa: string
  objetivos: string
  metodologia: string
  descricaoProduto: string
  premissas: string
  restricoes: string
  limitesAutoridade: string
  principaisEnvolvidos: string
  /** Texto editável antes do nome do gerente; vazio usa o padrão do modelo. */
  textoGerencia?: string
  /** `papel` é a função do membro no projeto (cargos do cadastro); sai como "Nome – Papel". */
  membros: { name: string; papel?: string }[]
  fases: MacroFase[]
}

export type CampoTermo = 'justificativa' | 'objetivos' | 'metodologia' | 'descricaoProduto' | 'premissas' | 'restricoes' | 'limitesAutoridade' | 'principaisEnvolvidos' | 'textoGerencia'

/** Ligações da folha com o estado do editor (só usadas dentro do EditorDocumento). */
export interface EdicaoTermo {
  projetoId: string
  membros: MembroEquipeOption[]
  onCriarMembro: (membro: MembroEquipeOption) => void
  onCampo: (campo: CampoTermo, valor: string) => void
  elaboradoPorUserId: string | null
  onElaboradoPor: (membro: MembroEquipeOption | null) => void
  dataAprovacaoRaw: string
  onDataAprovacao: (data: string) => void
}

export const TITULO_TERMO = 'Termo de Abertura de Projeto'
/** Texto padrão da linha "Gerente do projeto" (ajustes de 18/11/2026); o nome do gerente vem depois e não se edita. */
export const TEXTO_GERENCIA_PADRAO = 'A gerência do projeto será de responsabilidade de'

// ── Helpers ────────────────────────────────────────────────────────────────────

const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
function formatCusto(value: string | null | undefined): string {
  const n = parseDocumentCost(value)
  return value === null || value === undefined || value.trim() === '' ? '–' : moeda(n)
}

const nada = () => {}

// ── Componente ─────────────────────────────────────────────────────────────────

/** Itens de premissas/restrições: uma linha do texto por item. */
const itensDe = (texto: string) => texto.split('\n')

/** Caixa sem faixa: bordas finas, como no modelo do professor. */
const bordaFina = '1px solid #000'
const celulaModelo: React.CSSProperties = { border: bordaFina, padding: '1px 5px', verticalAlign: 'top', fontSize: '10pt', lineHeight: 1.3, textAlign: 'left', fontWeight: 'normal' }
const celulaModeloCampo: React.CSSProperties = { ...celulaModelo, padding: 0 }
const B = ({ children }: { children: React.ReactNode }) => <strong>{children}</strong>

/**
 * Termo de Abertura no layout do modelo "02_Project Charter" do professor
 * (logo + título, quadro, seções com título acima da caixa, premissas e
 * restrições item a item, macro fases com custo total, principais envolvidos e
 * designação de gerente). Paginado em folhas A4 como no Word. Dentro do editor
 * os campos são editados direto na folha; fora dele (PDF) sai só o texto.
 */
const ProjectCharterDocument = forwardRef<HTMLDivElement, CharterDocumentProps & { edicao?: EdicaoTermo }>(
  function ProjectCharterDocument(props, ref) {
    const {
      categoria, nomeProjeto, logoUrl, gerenteProjeto, gerenteSignatureUrl,
      elaboradoPor, aprovadoPor, versao, dataAprovacao,
      justificativa, objetivos, metodologia, descricaoProduto,
      premissas, restricoes, limitesAutoridade,
      principaisEnvolvidos, textoGerencia, membros, fases, edicao,
    } = props
    const { editavel } = useEditorFolha()
    const ed = edicao
    const campo = (c: CampoTermo) => (v: string) => ed?.onCampo(c, v)

    const total = fases.reduce((sum, f) => sum + parseDocumentCost(f.custo), 0)
    const grupos = exibirEnvolvidos(principaisEnvolvidos, [])
    const instituicao = categoria || grupos.find(g => /^institui[cç][aã]o/i.test(g.rotulo))?.valores.join(' / ') || ''
    const integrantes = membros.filter(m => m.name).map(m => (m.papel?.trim() ? `${m.name} – ${m.papel.trim()}` : m.name))
    const blocos = exibirEnvolvidos(principaisEnvolvidos, integrantes)
    const aprovador = aprovadoPor || gerenteProjeto

    // Premissas e restrições lado a lado, item a item (uma linha de cada texto por linha da tabela).
    const listaPremissas = itensDe(premissas), listaRestricoes = itensDe(restricoes)
    const totalItens = Math.max(listaPremissas.length, listaRestricoes.length, 1)
    const itens = Array.from({ length: totalItens }, (_, i) => ({ premissa: listaPremissas[i] ?? '', restricao: listaRestricoes[i] ?? '' }))
      .filter((it, i) => editavel || it.premissa.trim() || it.restricao.trim() || (i === 0))
    const mudarItem = (i: number, campoItem: 'premissas' | 'restricoes', v: string) => {
      const p = [...listaPremissas], r = [...listaRestricoes]
      while (p.length < totalItens) p.push('')
      while (r.length < totalItens) r.push('')
      if (campoItem === 'premissas') p[i] = v; else r[i] = v
      ed?.onCampo('premissas', p.join('\n')); ed?.onCampo('restricoes', r.join('\n'))
    }
    const adicionarItem = () => {
      const p = [...listaPremissas], r = [...listaRestricoes]
      while (p.length < totalItens) p.push('')
      while (r.length < totalItens) r.push('')
      ed?.onCampo('premissas', [...p, ''].join('\n')); ed?.onCampo('restricoes', [...r, ''].join('\n'))
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-campo="premissa-${totalItens}"] textarea`)?.focus())
    }
    const removerItem = (i: number) => {
      const p = listaPremissas.filter((_, j) => j !== i), r = listaRestricoes.filter((_, j) => j !== i)
      ed?.onCampo('premissas', p.join('\n')); ed?.onCampo('restricoes', r.join('\n'))
    }

    return (
      <Folha ref={ref} data-testid="termo-folha" style={{ fontSize: '10pt', gap: '5mm' }}>
        {/* Logo à esquerda e título ao lado, alinhado à base da logo. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8mm', minHeight: '24mm' }}>
          <div style={{ width: '30mm', height: '24mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {logoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logoUrl} alt="Logo do projeto" style={{ maxHeight: '24mm', maxWidth: '30mm', objectFit: 'contain' }} />
              : editavel
                ? <div style={{ width: '30mm', height: '20mm', border: '1px solid #4a6fa5', background: '#9db7e0', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontSize: '11pt', lineHeight: 1.15 }}>Logo do<br />Projeto</div>
                : null}
          </div>
          <h1 style={{ margin: 0, fontFamily: 'Arial, Arimo, Helvetica, sans-serif', fontSize: '16pt', fontWeight: 'bold', lineHeight: 1.2 }}>
            {TITULO_TERMO} - P<em>roject Charter</em>
          </h1>
        </div>

        {/* Quadro de identificação */}
        <table data-testid="quadro-identificacao" style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: '63%' }} /><col style={{ width: '21%' }} /><col style={{ width: '16%' }} /></colgroup>
          <tbody>
            <tr><td colSpan={3} style={{ ...celulaModeloCampo, background: '#bfbfbf', fontWeight: 'bold' }}><CampoAutomatico padding="1px 5px">{linhaOuAviso(instituicao)}</CampoAutomatico></td></tr>
            <tr><td colSpan={3} style={celulaModeloCampo}><CampoAutomatico padding="1px 5px"><B>Nome do projeto:</B> {nomeProjeto}</CampoAutomatico></td></tr>
            <tr>
              <td colSpan={2} style={celulaModelo}>
                <B>Elaborado por:</B>{' '}
                <CampoPessoa
                  id="elaborado-por" rotulo="Elaborado por" ajuda="Quem escreveu este documento. Escolha um membro da equipe."
                  projetoId={ed?.projetoId ?? ''} membros={ed?.membros ?? []} valorId={ed?.elaboradoPorUserId} nome={elaboradoPor}
                  onChange={ed?.onElaboradoPor ?? nada} onCriarMembro={ed?.onCriarMembro}
                />
              </td>
              <td style={celulaModeloCampo}>
                {/* Automática: o número que esta versão tem (ou recebe ao ser salva), v1.0.1, v1.0.2… */}
                <CampoAutomatico padding="1px 5px"><B>Versão:</B> {versao}</CampoAutomatico>
              </td>
            </tr>
            <tr><td colSpan={3} style={celulaModeloCampo}><CampoAutomatico padding="1px 5px"><B>Aprovado por:</B> {aprovador}{aprovador ? ' - Gerente' : ''}</CampoAutomatico></td></tr>
            <tr>
              <td style={{ ...celulaModelo, whiteSpace: 'nowrap' }}><AssinaturaEmLinha url={gerenteSignatureUrl} rotulo={<B>Assinatura:</B>} vazio={editavel ? 'Sem assinatura cadastrada pelo gerente' : undefined} /></td>
              {/* No meio da linha, alinhada com "Assinatura:" (a imagem deixa a linha mais alta). */}
              <td colSpan={2} style={{ ...celulaModelo, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                <B>Data de aprovação:</B>{' '}
                {editavel
                  ? <CampoData id="data-aprovacao" rotulo="Data de aprovação" ajuda="Dia em que o gerente aprovou esta versão." valor={ed?.dataAprovacaoRaw ?? ''} onChange={ed?.onDataAprovacao ?? nada} />
                  : (dataAprovacao || '')}
              </td>
            </tr>
          </tbody>
        </table>

        <SecaoTexto estilo="titulo" titulo="Justificativa do projeto" alturaMinima="auto">
          <CampoTexto formatavel id="justificativa" rotulo="Justificativa" ajuda="Explique o problema ou a oportunidade que motiva o projeto." pergunta="por que este projeto existe?" valor={justificativa} onChange={campo('justificativa')} alinhamento="justify" max={20000} />
        </SecaoTexto>

        <SecaoTexto estilo="titulo" titulo="Objetivo(s) do Projeto" alturaMinima="auto">
          <CampoTexto formatavel id="objetivos" rotulo="Objetivos" ajuda="O que o projeto vai alcançar — de preferência com prazo e custo." pergunta="o que o projeto vai alcançar?" valor={objetivos} onChange={campo('objetivos')} alinhamento="justify" max={20000} />
        </SecaoTexto>

        {(editavel || metodologia) && (
          <SecaoTexto estilo="titulo" titulo="Metodologia do Projeto" alturaMinima="auto">
            <CampoTexto formatavel id="metodologia" rotulo="Metodologia" ajuda="Como o trabalho será organizado (etapas, divisão de tarefas, campanha…)." pergunta="como o trabalho será conduzido?" valor={metodologia} onChange={campo('metodologia')} alinhamento="justify" max={20000} />
          </SecaoTexto>
        )}

        <SecaoTexto estilo="titulo" titulo="Descrição do produto do projeto" alturaMinima="auto">
          <CampoTexto formatavel id="descricao-produto" rotulo="Descrição do produto" ajuda="Descreva o produto, serviço ou resultado entregue no fim do projeto." pergunta="o que será entregue ao final do projeto?" valor={descricaoProduto} onChange={campo('descricaoProduto')} alinhamento="justify" max={20000} />
        </SecaoTexto>

        <SecaoTabela
          estilo="titulo"
          repetirCabecalho={false}
          testId="tabela-premissas"
          titulo="Premissas (hipóteses) e restrições para o projeto"
          colunas={[{ rotulo: 'Premissas (hipóteses)', largura: '50%' }, { rotulo: 'Restrições (imposições)', largura: '50%' }]}
          estiloCabecalho={{ fontSize: '10pt', padding: '1px 5px' }}
          onAdicionar={ed ? adicionarItem : undefined}
          rotuloAdicionar="Adicionar premissa / restrição"
        >
          {itens.map((it, i) => (
            <LinhaLista key={i} onRemover={ed ? () => removerItem(i) : undefined} rotuloRemover={`Remover linha ${i + 1} de premissas e restrições`}>
              <td style={celulaModeloCampo}>
                <CampoTexto id={`premissa-${i}`} rotulo="Premissa" ajuda="Algo que se assume como verdadeiro para o projeto dar certo." pergunta="premissa" valor={it.premissa} onChange={v => mudarItem(i, 'premissas', v)} alinhamento="justify" linha celulaDeTabela max={2000} compacto />
              </td>
              <td style={celulaModeloCampo}>
                <CampoTexto id={`restricao-${i}`} rotulo="Restrição" ajuda="Limite imposto ao projeto: prazo, orçamento, regras." pergunta="restrição" valor={it.restricao} onChange={v => mudarItem(i, 'restricoes', v)} alinhamento="justify" linha celulaDeTabela max={2000} compacto />
              </td>
            </LinhaLista>
          ))}
        </SecaoTabela>

        <SecaoTabela
          estilo="titulo"
          repetirCabecalho={false}
          testId="tabela-macro-fases"
          titulo="Macro Fases, prazos e custo"
          colunas={[{ rotulo: 'Macro fase', largura: '66%', alinhamento: 'center' }, { rotulo: 'Data limite', largura: '15%', alinhamento: 'center' }, { rotulo: 'Custo', largura: '19%', alinhamento: 'center' }]}
          estiloCabecalho={{ fontSize: '10pt', padding: '0 5px' }}
          rodape={
            <tr>
              <td style={{ ...celulaModelo, borderBottom: 'none', borderLeft: 'none' }} />
              <td style={{ ...celulaModelo, textAlign: 'right', fontWeight: 'bold' }}>Custo total</td>
              <td style={{ ...celulaModelo, textAlign: 'right' }}>{moeda(total)}</td>
            </tr>
          }
        >
          {fases.length === 0 && <tr><td colSpan={3} style={{ ...celulaModelo, color: '#6b7280', fontStyle: 'italic' }}>Nenhuma macro fase cadastrada.</td></tr>}
          {/* Só leitura: as macrofases vêm da planilha/EAP e só mudam lá (ajustes de 18/11/2026). */}
          {fases.map((f, i) => (
            <LinhaLista key={f.id}>
              <td style={celulaModelo}><span style={{ paddingRight: 3 }}>{`1.${i + 1}`}</span><span>{f.fase}</span></td>
              <td style={{ ...celulaModelo, textAlign: 'center' }}>{formatDateBR(f.dataLimite)}</td>
              <td style={{ ...celulaModelo, textAlign: 'right' }}>{formatCusto(f.custo)}</td>
            </LinhaLista>
          ))}
        </SecaoTabela>

        <SecaoTexto estilo="titulo" titulo="Principais envolvidos" alturaMinima="auto">
          {editavel ? (
            <EnvolvidosEditor value={principaisEnvolvidos} membros={integrantes} onChange={campo('principaisEnvolvidos')} />
          ) : blocos.length === 0 ? null : (
            <EnvolvidosLayout>
              {blocos.map((g, i) => <GrupoEnvolvidos key={i} titulo={g.rotulo ? <strong>{g.rotulo.replace(/:\s*$/, '')}:</strong> : null}>
                {g.valores.map((v, j) => <p key={j} style={{ margin: 0 }}>- {v.replace(/^\s*-\s?/, '')}</p>)}
              </GrupoEnvolvidos>)}
            </EnvolvidosLayout>
          )}
        </SecaoTexto>

        <SecaoTabela estilo="titulo" repetirCabecalho={false} titulo="Designação de gerente" colunas={[{ largura: '24%' }, {}]}>
          <tr>
            <td style={celulaModelo}>Gerente do projeto</td>
            <td style={celulaModeloCampo}>
              {!gerenteProjeto
                ? <CampoAutomatico padding="1px 5px">Nenhum gerente definido no projeto.</CampoAutomatico>
                : editavel
                  ? (
                    // Texto editável; o nome do gerente vem do cadastro e não se edita.
                    <div data-testid="linha-gerencia" className="flex flex-wrap items-start" style={{ paddingLeft: 2 }}>
                      {/* O campo tem a largura do texto (cópia invisível na mesma célula da grade): o nome vem logo depois. */}
                      <div style={{ display: 'inline-grid', maxWidth: '100%', minWidth: '4ch' }}>
                        <span aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden', whiteSpace: 'pre-wrap', padding: '0 3px' }}>{`${textoGerencia || TEXTO_GERENCIA_PADRAO} `}</span>
                        <div style={{ gridArea: '1 / 1', minWidth: 0 }}><CampoTexto id="texto-gerencia" rotulo="Texto antes do nome do gerente" ajuda="Frase da designação do gerente. O nome do gerente vem do cadastro do projeto e não se edita aqui." pergunta={TEXTO_GERENCIA_PADRAO} valor={textoGerencia ?? ''} onChange={campo('textoGerencia')} max={500} linha compacto preencher={false} /></div>
                      </div>
                      <span title="Nome do gerente do projeto (cadastro do projeto)" style={{ whiteSpace: 'nowrap', paddingRight: 5 }}>{gerenteProjeto}.</span>
                    </div>
                  )
                  : <div style={{ padding: '1px 5px' }}>{`${(textoGerencia ?? '').trim() || TEXTO_GERENCIA_PADRAO} ${gerenteProjeto}.`}</div>}
            </td>
          </tr>
          <tr>
            <td style={celulaModelo}>Limites de autoridade</td>
            <td style={celulaModeloCampo}>
              <CampoTexto formatavel id="limites-autoridade" rotulo="Limites de autoridade" ajuda="O que o gerente pode decidir sozinho: equipe, orçamento, prazos." pergunta="o que o gerente pode decidir sem consultar ninguém?" valor={limitesAutoridade} onChange={campo('limitesAutoridade')} alinhamento="justify" compacto max={5000} />
            </td>
          </tr>
        </SecaoTabela>
      </Folha>
    )
  },
)

export default ProjectCharterDocument
