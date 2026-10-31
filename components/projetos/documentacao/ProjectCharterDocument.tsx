'use client'

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
  /** `papel` é a função do membro no projeto (cargos do cadastro); sai como "Nome – Papel". */
  membros: { name: string; papel?: string }[]
  fases: MacroFase[]
}

export type CampoTermo = 'justificativa' | 'objetivos' | 'metodologia' | 'descricaoProduto' | 'premissas' | 'restricoes' | 'limitesAutoridade' | 'principaisEnvolvidos'

/** Ligações da folha com o estado do editor (só usadas dentro do EditorDocumento). */
export interface EdicaoTermo {
  projetoId: string
  membros: MembroEquipeOption[]
  onCriarMembro: (membro: MembroEquipeOption) => void
  onCampo: (campo: CampoTermo, valor: string) => void
  elaboradoPorUserId: string | null
  onElaboradoPor: (membro: MembroEquipeOption | null) => void
  onVersao: (versao: string) => void
  dataAprovacaoRaw: string
  onDataAprovacao: (data: string) => void
  onFase: (id: string, campo: keyof Omit<MacroFase, 'id'>, valor: string) => void
  onAdicionarFase: () => void
  onRemoverFase: (id: string) => void
}

export const TITULO_TERMO = 'Termo de Abertura de Projeto'

// ── Helpers ────────────────────────────────────────────────────────────────────

const moeda = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
function formatCusto(value: string | null | undefined): string {
  const n = parseDocumentCost(value)
  return n === 0 ? '–' : moeda(n)
}

/** "Rótulo: valor" por linha → grupos (o mesmo rótulo repetido junta os valores). */
function agruparEnvolvidos(texto: string): { rotulo: string; valores: string[] }[] {
  const grupos: { rotulo: string; valores: string[] }[] = []
  for (const linha of texto.split('\n').map(l => l.trim()).filter(Boolean)) {
    const i = linha.indexOf(':')
    const rotulo = i > 0 ? linha.slice(0, i).trim() : ''
    const valor = i > 0 ? linha.slice(i + 1).trim() : linha
    const grupo = grupos.find(g => g.rotulo.toLowerCase() === rotulo.toLowerCase())
    if (grupo) grupo.valores.push(valor)
    else grupos.push({ rotulo, valores: [valor] })
  }
  return grupos
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
      principaisEnvolvidos, membros, fases, edicao,
    } = props
    const { editavel } = useEditorFolha()
    const ed = edicao
    const campo = (c: CampoTermo) => (v: string) => ed?.onCampo(c, v)

    const total = fases.reduce((sum, f) => sum + parseDocumentCost(f.custo), 0)
    const grupos = agruparEnvolvidos(principaisEnvolvidos)
    const instituicao = categoria || grupos.find(g => /^institui[cç][aã]o/i.test(g.rotulo))?.valores.join(' / ') || ''
    const integrantes = membros.filter(m => m.name).map(m => (m.papel?.trim() ? `${m.name} – ${m.papel.trim()}` : m.name))
    // "Integrantes do Grupo" (a equipe do projeto) entra depois do professor, como no modelo.
    const idxProfessor = grupos.findIndex(g => /^professor/i.test(g.rotulo))
    const blocos: { rotulo: string; valores: string[] }[] = [...grupos]
    if (integrantes.length > 0) blocos.splice(idxProfessor + 1, 0, { rotulo: 'Integrantes do Grupo', valores: integrantes })
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
      <Folha ref={ref} data-testid="termo-folha" numerar={false} style={{ fontSize: '10pt', gap: '5mm' }}>
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
            <tr><td colSpan={3} style={{ ...celulaModeloCampo, background: '#bfbfbf', fontWeight: 'bold' }}><CampoAutomatico padding="1px 5px">{instituicao}</CampoAutomatico></td></tr>
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
                {editavel
                  ? <div className="flex items-start" style={{ paddingLeft: 5 }}><B>Versão:</B>&nbsp;<div className="flex-1"><CampoTexto id="versao" rotulo="Versão" ajuda="Número desta versão do documento (ex.: 1.0, 1.1)." pergunta="1.0" valor={versao} onChange={ed?.onVersao ?? nada} max={20} linha compacto /></div></div>
                  : <div style={{ padding: '1px 5px' }}><B>Versão:</B> {versao}</div>}
              </td>
            </tr>
            <tr><td colSpan={3} style={celulaModeloCampo}><CampoAutomatico padding="1px 5px"><B>Aprovado por:</B> {aprovador}{aprovador ? ' - Gerente' : ''}</CampoAutomatico></td></tr>
            <tr>
              <td style={{ ...celulaModelo, whiteSpace: 'nowrap' }}><AssinaturaEmLinha url={gerenteSignatureUrl} rotulo={<B>Assinatura:</B>} vazio={editavel ? 'Sem assinatura cadastrada pelo gerente' : undefined} /></td>
              <td colSpan={2} style={{ ...celulaModelo, whiteSpace: 'nowrap' }}>
                <B>Data de aprovação:</B>{' '}
                {editavel
                  ? <CampoData id="data-aprovacao" rotulo="Data de aprovação" ajuda="Dia em que o gerente aprovou esta versão." valor={ed?.dataAprovacaoRaw ?? ''} onChange={ed?.onDataAprovacao ?? nada} />
                  : (dataAprovacao || '')}
              </td>
            </tr>
          </tbody>
        </table>

        <SecaoTexto estilo="titulo" titulo="Justificativa do projeto" alturaMinima="16mm">
          <CampoTexto id="justificativa" rotulo="Justificativa" ajuda="Explique o problema ou a oportunidade que motiva o projeto." pergunta="por que este projeto existe?" valor={justificativa} onChange={campo('justificativa')} alinhamento="justify" max={20000} />
        </SecaoTexto>

        <SecaoTexto estilo="titulo" titulo="Objetivo(s) do Projeto" alturaMinima="16mm">
          <CampoTexto id="objetivos" rotulo="Objetivos" ajuda="O que o projeto vai alcançar — de preferência com prazo e custo." pergunta="o que o projeto vai alcançar?" valor={objetivos} onChange={campo('objetivos')} alinhamento="justify" max={20000} />
        </SecaoTexto>

        {(editavel || metodologia) && (
          <SecaoTexto estilo="titulo" titulo="Metodologia do Projeto" alturaMinima="16mm">
            <CampoTexto id="metodologia" rotulo="Metodologia" ajuda="Como o trabalho será organizado (etapas, divisão de tarefas, campanha…)." pergunta="como o trabalho será conduzido?" valor={metodologia} onChange={campo('metodologia')} alinhamento="justify" max={20000} />
          </SecaoTexto>
        )}

        <SecaoTexto estilo="titulo" titulo="Descrição do produto do projeto" alturaMinima="16mm">
          <CampoTexto id="descricao-produto" rotulo="Descrição do produto" ajuda="Descreva o produto, serviço ou resultado entregue no fim do projeto." pergunta="o que será entregue ao final do projeto?" valor={descricaoProduto} onChange={campo('descricaoProduto')} alinhamento="justify" max={20000} />
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
              <td style={{ ...celulaModeloCampo, height: '13mm' }}>
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
          onAdicionar={ed?.onAdicionarFase}
          rotuloAdicionar="Adicionar fase"
          rodape={
            <tr>
              <td style={{ ...celulaModelo, borderBottom: 'none', borderLeft: 'none' }} />
              <td style={{ ...celulaModelo, textAlign: 'right', fontWeight: 'bold' }}>Custo total</td>
              <td style={celulaModelo}>{moeda(total)}</td>
            </tr>
          }
        >
          {fases.length === 0 && !editavel && <tr><td colSpan={3} style={{ ...celulaModelo, color: '#6b7280', fontStyle: 'italic' }}>Nenhuma macro fase cadastrada.</td></tr>}
          {fases.map((f, i) => (
            <LinhaLista key={f.id} onRemover={ed ? () => ed.onRemoverFase(f.id) : undefined} rotuloRemover={`Remover fase ${f.fase || i + 1}`}>
              <td style={celulaModeloCampo}>
                <div className="flex items-start" style={{ paddingLeft: 5 }}>
                  <span style={{ padding: '0 3px 0 0', whiteSpace: 'nowrap' }}>{`1.${i + 1}`}</span>
                  <div style={{ flex: 1 }}><CampoTexto id={`fase-${f.id}`} rotulo="Macro fase" ajuda="Grande etapa do projeto." pergunta="nome da fase" valor={f.fase} onChange={v => ed?.onFase(f.id, 'fase', v)} max={200} linha compacto /></div>
                </div>
              </td>
              <td style={celulaModelo}>{editavel ? <CampoData id={`fase-data-${f.id}`} rotulo="Data limite" ajuda="Até quando a fase precisa terminar." valor={f.dataLimite ?? ''} onChange={v => ed?.onFase(f.id, 'dataLimite', v)} /> : formatDateBR(f.dataLimite)}</td>
              <td style={celulaModeloCampo}>
                {editavel
                  ? <CampoTexto id={`fase-custo-${f.id}`} rotulo="Custo" ajuda="Custo previsto da fase, em reais (ex.: 900,00)." pergunta="0,00" valor={f.custo ?? ''} onChange={v => ed?.onFase(f.id, 'custo', v)} max={30} linha compacto />
                  : <div style={{ padding: '0 5px' }}>{formatCusto(f.custo)}</div>}
              </td>
            </LinhaLista>
          ))}
        </SecaoTabela>

        <SecaoTexto estilo="titulo" titulo="Principais envolvidos" alturaMinima="20mm">
          {editavel ? (
            <>
              <CampoTexto id="principais-envolvidos" rotulo="Principais envolvidos" ajuda="Uma linha por pessoa ou grupo, no formato “Papel: Nome” (ex.: Professor(es): Fábio). A equipe entra sozinha." pergunta="quem participa ou apoia o projeto? (Papel: Nome)" valor={principaisEnvolvidos} onChange={campo('principaisEnvolvidos')} preencher={false} />
              {integrantes.length > 0 && (
                <CampoAutomatico padding="2px 6px 4px">
                  <strong>Integrantes do Grupo:</strong> {integrantes.join(' · ')}
                </CampoAutomatico>
              )}
            </>
          ) : blocos.length === 0 ? null : (
            <div style={{ padding: '1px 5px 4mm' }}>
              {blocos.map((g, i) => (
                <div key={i} style={{ breakInside: 'avoid' }}>
                  {g.rotulo && <p style={{ fontWeight: 'bold', margin: '0 0 3mm' }}>{g.rotulo}</p>}
                  {g.valores.map((v, j) => <p key={j} style={{ margin: '0 0 3mm' }}>{v}</p>)}
                </div>
              ))}
            </div>
          )}
        </SecaoTexto>

        <SecaoTabela estilo="titulo" repetirCabecalho={false} titulo="Designação de gerente" colunas={[{ largura: '24%' }, {}]}>
          <tr>
            <td style={celulaModelo}>Gerente do projeto</td>
            <td style={celulaModeloCampo}><CampoAutomatico padding="1px 5px">{gerenteProjeto || 'Nenhum gerente definido no projeto.'}</CampoAutomatico></td>
          </tr>
          <tr>
            <td style={celulaModelo}>Limites de autoridade</td>
            <td style={{ ...celulaModeloCampo, height: '16mm' }}>
              <CampoTexto id="limites-autoridade" rotulo="Limites de autoridade" ajuda="O que o gerente pode decidir sozinho: equipe, orçamento, prazos." pergunta="o que o gerente pode decidir sem consultar ninguém?" valor={limitesAutoridade} onChange={campo('limitesAutoridade')} alinhamento="justify" compacto max={5000} />
            </td>
          </tr>
        </SecaoTabela>
      </Folha>
    )
  },
)

export default ProjectCharterDocument
