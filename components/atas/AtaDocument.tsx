'use client'

import { forwardRef, type ReactNode } from 'react'
import { Users } from 'lucide-react'
import AssinaturaEmLinha from '@/components/documentos/AssinaturaEmLinha'
import {
  ATA_ASSINATURAS_POR_LINHA, ataAssinantes, ataComUmaLinhaVazia, ataCopias, ataData, ataNumero, ataPessoa,
  type AtaExportData,
} from '@/lib/exports/ataDocx'
import type { MembroEquipeOption } from '@/components/projetos/documentacao/MembroEquipeSelect'
import {
  Assinaturas, Cabecalho, CampoAutomatico, CampoData, CampoPessoa, CampoTexto, CINZA_CLARO, Folha, LinhaLista, Quadro,
  SecaoTabela, SecaoTexto, celula, celulaCampo, faixa, secao, useEditorFolha,
} from '@/components/documentos/editor/folha'

/**
 * Ata de Reunião na folha padrão dos documentos, com o conteúdo do modelo
 * "01_Form Ata de Reunião" (mesmas regras de linhas do Word em
 * lib/exports/ataDocx.ts). Dentro do EditorDocumento tudo é editado direto na
 * folha; fora dele (PDF) sai só o texto.
 */

export const TITULO_ATA = 'Ata de Reunião'

export type CampoTextoAta = 'local' | 'assuntosTratados' | 'decisoesTomadas' | 'observacoes'

/** Ligações da folha com o estado do editor (só usadas dentro do EditorDocumento). */
export interface EdicaoAta {
  projetoId: string
  membros: MembroEquipeOption[]
  onCriarMembro: (membro: MembroEquipeOption) => void
  onTexto: (campo: CampoTextoAta, valor: string) => void
  dataRaw: string
  onData: (data: string) => void
  elaboradoPorUserId: string | null
  onElaboradoPor: (membro: MembroEquipeOption | null) => void
  aprovadoPorUserId: string | null
  onAprovadoPor: (membro: MembroEquipeOption | null) => void
  /** Presentes como estão no formulário (sem a linha vazia do modelo). */
  presentes: { userId: string; setorEmpresa: string }[]
  onPresente: (indice: number, membro: MembroEquipeOption | null) => void
  onSetor: (indice: number, valor: string) => void
  onAdicionarPresente: () => void
  onRemoverPresente: (indice: number) => void
  onIncluirEquipe?: () => void
  avisoPresente?: string | null
  acoes: { acao: string; prazoRaw: string; responsavelUserId: string }[]
  onAcao: (indice: number, valor: string) => void
  onPrazo: (indice: number, valor: string) => void
  onResponsavel: (indice: number, membro: MembroEquipeOption | null) => void
  onAdicionarAcao: () => void
  onRemoverAcao: (indice: number) => void
  /** Ata nova: o número mostrado é o previsto e só é confirmado ao salvar. */
  numeroPrevisto?: boolean
  /** Edição dos anexos (lista + enviar arquivo) e das cópias (seletor de e-mails). */
  anexos: ReactNode
  copias: ReactNode
}

const pilula = 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-sans text-[13px] font-medium text-blue-600 shadow-sm hover:border-blue-300 hover:bg-blue-50'

export default forwardRef<HTMLDivElement, { data: AtaExportData; edicao?: EdicaoAta }>(function AtaDocument({ data: d, edicao }, ref) {
  const { editavel } = useEditorFolha()
  const ed = editavel ? edicao : undefined
  const presentes = ataComUmaLinhaVazia(d.presentes, p => !!p.nome?.trim(), { nome: '', setorEmpresa: null })
  const acoes = ataComUmaLinhaVazia(d.acoes, a => !!a.acao?.trim(), { acao: '', prazo: null, responsavel: null })
  const caixas = ataCopias(d.copiasPara)
  const assinantes = ataAssinantes(d.presentes)
  const membrosLivres = (userId: string) => (ed?.membros ?? []).filter(m => m.id === userId || !ed?.presentes.some(p => p.userId === m.id))

  return (
    <Folha ref={ref} data-testid="ata-folha">
      <Cabecalho
        titulo={
          <span data-testid="ata-titulo">
            {TITULO_ATA} Nº{' '}
            {/* Número sequencial do projeto: gerado pelo sistema, não é digitado. */}
            <CampoAutomatico inline origem={edicao?.numeroPrevisto ? 'Automático: próximo número das atas do projeto (confirmado ao salvar)' : 'Automático: número sequencial das atas do projeto'}>
              {ataNumero(d.numero)}
            </CampoAutomatico>
          </span>
        }
        logoUrl={d.logoUrl}
      />

      <Quadro testId="quadro-identificacao">
        <tr><td colSpan={2} style={{ ...faixa, padding: 0 }}><CampoAutomatico>{d.instituicao}</CampoAutomatico></td></tr>
        <tr><td colSpan={2} style={celulaCampo}><CampoAutomatico>Nome do projeto: {d.nomeProjeto}</CampoAutomatico></td></tr>
        <tr>
          <td style={celulaCampo}>
            {ed
              ? <div className="flex items-start" style={{ paddingLeft: 6 }}><span style={{ padding: '2px 0' }}>Local:</span><div className="flex-1"><CampoTexto id="ata-local" rotulo="Local" ajuda="Onde a reunião aconteceu (sala, endereço ou on-line)." pergunta="sala / on-line" valor={d.local ?? ''} onChange={v => ed.onTexto('local', v)} max={200} linha /></div></div>
              : <div style={{ padding: '2px 6px' }}>Local: {d.local}</div>}
          </td>
          <td style={celula}>
            Data:{' '}
            {ed
              ? <CampoData id="ata-data" rotulo="Data da reunião" ajuda="Dia da reunião (obrigatório)." valor={ed.dataRaw} onChange={ed.onData} />
              : ataData(d.data)}
          </td>
        </tr>
        <tr>
          <td colSpan={2} style={celula}>
            Elaborado por:{' '}
            {ed
              ? <CampoPessoa id="ata-elaborado-por" rotulo="Elaborado por" ajuda="Quem redigiu a ata. Escolha um membro da equipe." projetoId={ed.projetoId} membros={ed.membros} valorId={ed.elaboradoPorUserId} nome={d.elaboradoPor ?? ''} onChange={ed.onElaboradoPor} onCriarMembro={ed.onCriarMembro} />
              : ataPessoa(d.elaboradoPor, d.elaboradoPorFuncao)}
          </td>
        </tr>
        <tr>
          <td colSpan={2} style={celula}>
            Aprovado por:{' '}
            {ed
              ? <CampoPessoa id="ata-aprovado-por" rotulo="Aprovado por" ajuda="Quem aprova a ata (normalmente o gerente do projeto)." projetoId={ed.projetoId} membros={ed.membros} valorId={ed.aprovadoPorUserId} nome={d.aprovadoPor ?? ''} onChange={ed.onAprovadoPor} onCriarMembro={ed.onCriarMembro} />
              : ataPessoa(d.aprovadoPor, d.aprovadoPorFuncao)}
          </td>
        </tr>
        {(d.gerenteProjeto || d.assinaturaGerenteUrl) && <tr><td colSpan={2} style={{ ...celula, whiteSpace: 'nowrap' }}><AssinaturaEmLinha url={d.assinaturaGerenteUrl} rotulo="Assinatura do gerente:" vazio={editavel ? 'Sem assinatura cadastrada pelo gerente' : undefined} /></td></tr>}
      </Quadro>

      <SecaoTabela
        testId="ata-presentes"
        titulo={secao(1, 'Relação dos presentes')}
        colunas={[{ rotulo: 'Nome', largura: '70%' }, { rotulo: 'Setor/Empresa', largura: '30%' }]}
        onAdicionar={ed?.onAdicionarPresente}
        rotuloAdicionar="Adicionar presente"
        extrasAdicionar={ed?.onIncluirEquipe && (
          <button type="button" onClick={ed.onIncluirEquipe} className={pilula}>
            <Users className="h-4 w-4" /> Incluir toda a equipe
          </button>
        )}
      >
        {ed
          ? ed.presentes.map((p, i) => (
            <LinhaLista key={i} onRemover={() => ed.onRemoverPresente(i)} rotuloRemover={`Remover ${d.presentes[i]?.nome || `presente ${i + 1}`}`}>
              <td style={celula}>
                <CampoPessoa id={`ata-presente-${i}`} rotulo="Presente" ajuda="Membro da equipe que participou da reunião." projetoId={ed.projetoId} membros={membrosLivres(p.userId)} valorId={p.userId} nome={d.presentes[i]?.nome ?? ''} onChange={m => ed.onPresente(i, m)} onCriarMembro={ed.onCriarMembro} />
              </td>
              <td style={celulaCampo}>
                <CampoTexto id={`ata-setor-${i}`} rotulo="Setor/Empresa" ajuda="Preenchido pela função do membro; pode ser ajustado." pergunta="setor" valor={p.setorEmpresa} onChange={v => ed.onSetor(i, v)} max={120} linha />
              </td>
            </LinhaLista>
          ))
          : presentes.map((p, i) => <tr key={i} style={{ breakInside: 'avoid' }}><td style={{ ...celula, height: '1.4em' }}>{p.nome}</td><td style={celula}>{p.setorEmpresa}</td></tr>)}
      </SecaoTabela>
      {ed?.avisoPresente && <p role="alert" className="font-sans text-sm text-amber-700">{ed.avisoPresente}</p>}

      <SecaoTexto titulo={secao(2, 'Assuntos tratados')}>
        <CampoTexto id="ata-assuntos" rotulo="Assuntos tratados" ajuda="O que foi discutido na reunião." pergunta="quais assuntos foram tratados?" valor={d.assuntosTratados ?? ''} onChange={v => edicao?.onTexto('assuntosTratados', v)} max={10000} />
      </SecaoTexto>
      <SecaoTexto titulo={secao(3, 'Decisões tomadas')}>
        <CampoTexto id="ata-decisoes" rotulo="Decisões tomadas" ajuda="O que ficou decidido." pergunta="o que foi decidido?" valor={d.decisoesTomadas ?? ''} onChange={v => edicao?.onTexto('decisoesTomadas', v)} max={10000} />
      </SecaoTexto>

      <SecaoTabela
        testId="ata-acoes"
        faixaNasColunas
        titulo={secao(4, 'Ações a serem empreendidas')}
        colunas={[{ rotulo: 'Ação', largura: '57%' }, { rotulo: 'Prazo', largura: '19%' }, { rotulo: 'Responsável', largura: '24%' }]}
        onAdicionar={ed?.onAdicionarAcao}
        rotuloAdicionar="Adicionar ação"
      >
        {ed
          ? ed.acoes.map((a, i) => (
            <LinhaLista key={i} onRemover={() => ed.onRemoverAcao(i)} rotuloRemover={`Remover ação ${i + 1}`}>
              <td style={celulaCampo}><CampoTexto id={`ata-acao-${i}`} rotulo="Ação" ajuda="O que precisa ser feito depois da reunião." pergunta="o que será feito?" valor={a.acao} onChange={v => ed.onAcao(i, v)} max={2000} celulaDeTabela /></td>
              <td style={celula}><CampoData id={`ata-prazo-${i}`} rotulo="Prazo" ajuda="Até quando a ação deve ser feita." valor={a.prazoRaw} onChange={v => ed.onPrazo(i, v)} /></td>
              <td style={celula}><CampoPessoa id={`ata-responsavel-${i}`} rotulo="Responsável" ajuda="Membro da equipe responsável pela ação." projetoId={ed.projetoId} membros={ed.membros} valorId={a.responsavelUserId} nome={d.acoes[i]?.responsavel ?? ''} onChange={m => ed.onResponsavel(i, m)} onCriarMembro={ed.onCriarMembro} /></td>
            </LinhaLista>
          ))
          : acoes.map((a, i) => <tr key={i} style={{ breakInside: 'avoid' }}><td style={{ ...celula, height: '1.4em', whiteSpace: 'pre-wrap' }}>{a.acao}</td><td style={celula}>{a.prazo ? ataData(a.prazo) : ''}</td><td style={celula}>{a.responsavel}</td></tr>)}
      </SecaoTabela>

      {/* Documentos anexos */}
      <div style={{ ...celula, background: CINZA_CLARO, minHeight: '10mm' }}>
        <strong>Documentos anexos:</strong>
        {ed ? ed.anexos : d.anexos.length > 0 && <div style={{ whiteSpace: 'pre-wrap' }}>{d.anexos.map(a => `${a.nome}${a.url ? ` — ${a.url}` : ''}`).join('\n')}</div>}
      </div>

      {/* Enviar cópias para */}
      <div style={{ ...celula, background: CINZA_CLARO }}>
        {ed ? (
          <><strong>Enviar cópias para:</strong>{ed.copias}</>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', columnGap: 8 }}>
            <div><strong>Enviar cópias para:</strong></div>
            {caixas.map((c, i) => <div key={i}>{c.marcado ? '☒' : '☐'} {c.texto}</div>)}
          </div>
        )}
      </div>

      <Assinaturas
        titulo={<>Assinaturas <span style={{ fontWeight: 'normal' }}>&lt;principais envolvidos&gt;</span></>}
        porLinha={ATA_ASSINATURAS_POR_LINHA}
        assinantes={assinantes.map(p => ({ nome: p.nome, funcao: p.setorEmpresa, assinaturaUrl: p.assinaturaUrl }))}
        obs={
          <div className="flex" style={{ paddingLeft: 6 }}>
            <strong style={{ padding: '2px 0' }}>Obs:</strong>
            <div style={{ flex: 1 }}>
              <CampoTexto id="ata-observacoes" rotulo="Observações" ajuda="Observações gerais da ata (opcional)." pergunta="alguma observação?" valor={d.observacoes ?? ''} onChange={v => edicao?.onTexto('observacoes', v)} max={5000} preencher={false} />
            </div>
          </div>
        }
      />
    </Folha>
  )
})
