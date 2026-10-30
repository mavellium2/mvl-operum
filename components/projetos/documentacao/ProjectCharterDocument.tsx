'use client'

import { forwardRef } from 'react'
import type { MacroFase } from './MacroFaseTable'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import { formatDateBR } from '@/lib/date'
import { parseDocumentCost } from '@/lib/documentCost'
import AssinaturaEmLinha from '@/components/documentos/AssinaturaEmLinha'
import {
  Assinaturas, Cabecalho, CampoAutomatico, CampoData, CampoPessoa, CampoTexto, Folha, LinhaLista, Quadro,
  SecaoTabela, SecaoTexto, celula, celulaCampo, faixa, secao, useEditorFolha,
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

export const TITULO_TERMO = 'Termo de Abertura do Projeto'

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

/**
 * Termo de Abertura na folha padrão dos documentos. Dentro do editor os campos
 * são editados direto na folha; fora dele (PDF) sai só o texto.
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

    let n = 0
    const titulo = (t: string) => secao(++n, t)

    return (
      <Folha ref={ref} data-testid="termo-folha">
        <Cabecalho titulo={TITULO_TERMO} logoUrl={logoUrl} />

        <Quadro testId="quadro-identificacao">
          <tr><td colSpan={2} style={{ ...faixa, padding: 0 }}><CampoAutomatico>{instituicao}</CampoAutomatico></td></tr>
          <tr><td colSpan={2} style={celulaCampo}><CampoAutomatico>Nome do projeto: {nomeProjeto}</CampoAutomatico></td></tr>
          <tr>
            <td style={celula}>
              Elaborado por:{' '}
              <CampoPessoa
                id="elaborado-por" rotulo="Elaborado por" ajuda="Quem escreveu este documento. Escolha um membro da equipe."
                projetoId={ed?.projetoId ?? ''} membros={ed?.membros ?? []} valorId={ed?.elaboradoPorUserId} nome={elaboradoPor}
                onChange={ed?.onElaboradoPor ?? nada} onCriarMembro={ed?.onCriarMembro}
              />
            </td>
            <td style={celulaCampo}>
              {editavel
                ? <div className="flex items-start" style={{ paddingLeft: 6 }}><span style={{ padding: '2px 0' }}>Versão:</span><div className="flex-1"><CampoTexto id="versao" rotulo="Versão" ajuda="Número desta versão do documento (ex.: 1.0, 1.1)." pergunta="1.0" valor={versao} onChange={ed?.onVersao ?? nada} max={20} linha /></div></div>
                : <div style={{ padding: '2px 6px' }}>Versão: {versao}</div>}
            </td>
          </tr>
          <tr>
            <td style={celulaCampo}><CampoAutomatico origem="Automático: o aprovador é sempre o gerente do projeto">Aprovado por: {aprovador}{aprovador ? ' — Gerente do projeto' : ''}</CampoAutomatico></td>
            <td style={celula}>
              Data:{' '}
              {editavel
                ? <CampoData id="data-aprovacao" rotulo="Data de aprovação" ajuda="Dia em que o gerente aprovou esta versão." valor={ed?.dataAprovacaoRaw ?? ''} onChange={ed?.onDataAprovacao ?? nada} />
                : (dataAprovacao || '—')}
            </td>
          </tr>
          <tr><td colSpan={2} style={{ ...celula, whiteSpace: 'nowrap' }}><AssinaturaEmLinha url={gerenteSignatureUrl} vazio={editavel ? 'Sem assinatura cadastrada pelo gerente' : undefined} /></td></tr>
        </Quadro>

        <SecaoTexto titulo={titulo('Justificativa do projeto')}>
          <CampoTexto id="justificativa" rotulo="Justificativa" ajuda="Explique o problema ou a oportunidade que motiva o projeto." pergunta="por que este projeto existe?" valor={justificativa} onChange={campo('justificativa')} />
        </SecaoTexto>

        <SecaoTexto titulo={titulo('Objetivo(s) do projeto')} alturaMinima="16mm">
          <CampoTexto id="objetivos" rotulo="Objetivos" ajuda="O que o projeto vai alcançar — de preferência com prazo e custo." pergunta="o que o projeto vai alcançar?" valor={objetivos} onChange={campo('objetivos')} />
        </SecaoTexto>

        <SecaoTexto titulo={titulo('Descrição do produto do projeto')} alturaMinima="16mm">
          <CampoTexto id="descricao-produto" rotulo="Descrição do produto" ajuda="Descreva o produto, serviço ou resultado entregue no fim do projeto." pergunta="o que será entregue ao final do projeto?" valor={descricaoProduto} onChange={campo('descricaoProduto')} />
        </SecaoTexto>

        <SecaoTabela titulo={titulo('Premissas (hipóteses) e restrições para o projeto')} colunas={[{ rotulo: 'Premissas (hipóteses)', largura: '50%' }, { rotulo: 'Restrições', largura: '50%' }]}>
          <tr>
            <td style={{ ...celulaCampo, height: '20mm' }}>
              <CampoTexto id="premissas" rotulo="Premissas" ajuda="O que se assume como verdadeiro para o projeto dar certo. Uma por linha." pergunta="o que estamos assumindo como certo?" valor={premissas} onChange={campo('premissas')} />
            </td>
            <td style={celulaCampo}>
              <CampoTexto id="restricoes" rotulo="Restrições" ajuda="Limites impostos ao projeto: prazo, orçamento, recursos. Uma por linha." pergunta="quais limites o projeto tem?" valor={restricoes} onChange={campo('restricoes')} />
            </td>
          </tr>
        </SecaoTabela>

        <SecaoTabela
          testId="tabela-macro-fases"
          titulo={titulo('Macro fases, prazos e custo')}
          colunas={[{ rotulo: 'Macro fase', largura: '60%' }, { rotulo: 'Data limite', largura: '20%' }, { rotulo: 'Custo', largura: '20%' }]}
          onAdicionar={ed?.onAdicionarFase}
          rotuloAdicionar="Adicionar fase"
          rodape={
            <tr>
              <td style={{ ...celula, fontWeight: 'bold' }}>Custo total</td>
              <td style={celula} />
              <td style={{ ...celula, fontWeight: 'bold' }}>{moeda(total)}</td>
            </tr>
          }
        >
          {fases.length === 0 && !editavel && <tr><td colSpan={3} style={{ ...celula, color: '#6b7280', fontStyle: 'italic' }}>Nenhuma macro fase cadastrada.</td></tr>}
          {fases.map((f, i) => (
            <LinhaLista key={f.id} onRemover={ed ? () => ed.onRemoverFase(f.id) : undefined} rotuloRemover={`Remover fase ${f.fase || i + 1}`}>
              <td style={celulaCampo}><CampoTexto id={`fase-${f.id}`} rotulo="Macro fase" ajuda="Grande etapa do projeto." pergunta="nome da fase" valor={f.fase} onChange={v => ed?.onFase(f.id, 'fase', v)} max={200} linha /></td>
              <td style={celula}>{editavel ? <CampoData id={`fase-data-${f.id}`} rotulo="Data limite" ajuda="Até quando a fase precisa terminar." valor={f.dataLimite ?? ''} onChange={v => ed?.onFase(f.id, 'dataLimite', v)} /> : formatDateBR(f.dataLimite)}</td>
              <td style={celulaCampo}>
                {editavel
                  ? <CampoTexto id={`fase-custo-${f.id}`} rotulo="Custo" ajuda="Custo previsto da fase, em reais (ex.: 900,00)." pergunta="0,00" valor={f.custo ?? ''} onChange={v => ed?.onFase(f.id, 'custo', v)} max={30} linha />
                  : <div style={{ padding: '2px 6px' }}>{formatCusto(f.custo)}</div>}
              </td>
            </LinhaLista>
          ))}
        </SecaoTabela>

        <SecaoTexto titulo={titulo('Principais envolvidos')} alturaMinima="16mm">
          {editavel ? (
            <>
              <CampoTexto id="principais-envolvidos" rotulo="Principais envolvidos" ajuda="Uma linha por pessoa ou grupo, no formato “Papel: Nome” (ex.: Professor: Fábio). A equipe entra sozinha." pergunta="quem participa ou apoia o projeto? (Papel: Nome)" valor={principaisEnvolvidos} onChange={campo('principaisEnvolvidos')} preencher={false} />
              {integrantes.length > 0 && (
                <CampoAutomatico origem="Automático: vem da equipe do projeto">
                  <strong>Integrantes do Grupo:</strong> {integrantes.join(' · ')}
                </CampoAutomatico>
              )}
            </>
          ) : blocos.length === 0 ? null : (
            <div style={{ padding: '2mm 3mm 0' }}>
              {blocos.map((g, i) => (
                <div key={i} style={{ marginBottom: '2.5mm', breakInside: 'avoid' }}>
                  {g.rotulo && <div style={{ fontWeight: 'bold' }}>{g.rotulo}</div>}
                  {g.valores.map((v, j) => <div key={j} style={{ marginLeft: g.rotulo ? '32mm' : 0 }}>{v}</div>)}
                </div>
              ))}
            </div>
          )}
        </SecaoTexto>

        <SecaoTabela titulo={titulo('Designação de gerente')} colunas={[{ largura: '24%' }, {}]}>
          <tr>
            <td style={{ ...celula, fontWeight: 'bold' }}>Gerente do projeto</td>
            <td style={celulaCampo}><CampoAutomatico origem="Automático: vem do gerente do projeto">{gerenteProjeto ? `A gerência do projeto será de responsabilidade de ${gerenteProjeto}.` : 'Nenhum gerente definido no projeto.'}</CampoAutomatico></td>
          </tr>
          <tr>
            <td style={{ ...celula, fontWeight: 'bold' }}>Limites de autoridade</td>
            <td style={{ ...celulaCampo, height: '16mm' }}>
              <CampoTexto id="limites-autoridade" rotulo="Limites de autoridade" ajuda="O que o gerente pode decidir sozinho: equipe, orçamento, prazos." pergunta="o que o gerente pode decidir sem consultar ninguém?" valor={limitesAutoridade} onChange={campo('limitesAutoridade')} />
            </td>
          </tr>
        </SecaoTabela>

        {/* Metodologia não existe no modelo do professor: no PDF só sai se preenchida. */}
        {(editavel || metodologia) && (
          <SecaoTexto titulo={titulo(editavel ? 'Metodologia do projeto (opcional)' : 'Metodologia do projeto')} alturaMinima="12mm">
            <CampoTexto id="metodologia" rotulo="Metodologia" ajuda="Opcional: como o trabalho será organizado (ex.: Scrum, sprints de 2 semanas)." pergunta="como o trabalho será conduzido? (opcional)" valor={metodologia} onChange={campo('metodologia')} />
          </SecaoTexto>
        )}

        <Assinaturas
          assinantes={[
            { nome: elaboradoPor, funcao: 'Elaborado por' },
            { nome: aprovador, funcao: 'Aprovado por — Gerente do projeto', assinaturaUrl: gerenteSignatureUrl },
          ]}
        />
      </Folha>
    )
  },
)

export default ProjectCharterDocument
