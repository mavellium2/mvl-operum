'use client'

import { CampoTexto, Folha, SecaoTabela, SecaoTexto, useEditorFolha } from '@/components/documentos/editor/folha'
import {
  ASPECTOS_LICOES, PERGUNTAS_LICOES, type CabecalhoFormulario, type IdAspecto, type IdPergunta, type LicoesConteudo, type RespostaAspecto,
} from '@/lib/validation/formulariosGP'
import type { MembroEquipeOption } from '../MembroEquipeSelect'
import FormularioDocumento, { type RenderFormulario } from './FormularioDocumento'
import { celulaGP, celulaGPCampo, FONTE_FORMULARIO, QuadroFormulario, TituloFormulario } from './QuadroFormulario'

export const TITULO_LICOES = 'Formulário de Lições Aprendidas'
export const DOCUMENTO_LICOES = 'Lições Aprendidas'

type Licoes = {
  cabecalho: CabecalhoFormulario
  aspectos: Partial<Record<IdAspecto, RespostaAspecto>>
  perguntas: Partial<Record<IdPergunta, string>>
}

export const licoesInicial = (): Licoes => ({ cabecalho: {}, aspectos: {}, perguntas: {} })
export const licoesNormalizado = (salvo: LicoesConteudo): Licoes => ({ cabecalho: salvo.cabecalho ?? {}, aspectos: salvo.aspectos ?? {}, perguntas: salvo.perguntas ?? {} })

const cinzaAspecto = '#e7e6e6'

/** Sim ou Não do aspecto: rádio na edição; "X" no documento, como no modelo. */
function MarcaSimNao({ id, rotulo, marcado, onMarcar }: { id: string; rotulo: string; marcado: boolean; onMarcar?: () => void }) {
  const { editavel } = useEditorFolha()
  if (!editavel || !onMarcar) return <>{marcado ? 'X' : ''}</>
  // Rádio nativo: controle de escolha (permitido fora da base dos campos de texto).
  return (
    <label className="flex h-full w-full cursor-pointer items-center justify-center rounded transition-colors hover:bg-blue-50 focus-within:outline focus-within:outline-2 focus-within:outline-blue-500">
      <input type="radio" name={id} checked={marcado} onChange={onMarcar} aria-label={rotulo} className="h-3 w-3 cursor-pointer accent-blue-600" />
    </label>
  )
}

export function FolhasLicoes({ conteudo, sistema, versaoPadrao, alterar, edicao }: RenderFormulario<Licoes>) {
  const responder = (id: IdAspecto, parcial: RespostaAspecto) =>
    alterar?.(c => ({ ...c, aspectos: { ...c.aspectos, [id]: { ...c.aspectos[id], ...parcial } } }))
  return (
    <Folha data-testid="licoes-folha" rodape={`© ${TITULO_LICOES}`} style={{ fontFamily: FONTE_FORMULARIO, fontSize: '10pt', gap: 0 }}>
      <TituloFormulario titulo={TITULO_LICOES} logoUrl={sistema.logoUrl} />
      <div style={{ height: '4mm' }} />
      <QuadroFormulario testId="licoes-quadro" prefixoId="licoes" sistema={sistema} cabecalho={conteudo.cabecalho} versaoPadrao={versaoPadrao}
        edicao={edicao && { ...edicao, onCabecalho: cab => alterar?.(c => ({ ...c, cabecalho: cab })) }} />
      <SecaoTabela
        semFaixa colado repetirCabecalho
        testId="licoes-aspectos"
        titulo="Aspectos"
        colunas={[
          { rotulo: 'Aspecto', largura: '45%' },
          { rotulo: 'Sim', largura: '6%', alinhamento: 'center' },
          { rotulo: 'Não', largura: '6%', alinhamento: 'center' },
          { rotulo: <>Comentários <span style={{ fontWeight: 'normal', fontSize: '9pt' }}>(utilize folhas adicionais, se necessário)</span></>, largura: '43%' },
        ]}
        estiloCabecalho={{ fontSize: '10pt', padding: '1px 5px', fontWeight: 'bold', background: '#fff' }}
      >
        {ASPECTOS_LICOES.map((a, i) => {
          const r = conteudo.aspectos[a.id] ?? {}
          return (
            <tr key={a.id} style={{ breakInside: 'avoid' }}>
              <td style={{ ...celulaGP, background: cinzaAspecto, paddingLeft: '4mm', textIndent: '-3mm' }}>{`${i + 1}. ${a.texto}`}</td>
              <td style={{ ...celulaGPCampo, background: cinzaAspecto, textAlign: 'center', verticalAlign: 'middle' }}>
                <MarcaSimNao id={`licoes-${a.id}`} rotulo={`${i + 1}. Sim`} marcado={r.sim === true} onMarcar={alterar && (() => responder(a.id, { sim: true }))} />
              </td>
              <td style={{ ...celulaGPCampo, background: cinzaAspecto, textAlign: 'center', verticalAlign: 'middle' }}>
                <MarcaSimNao id={`licoes-${a.id}`} rotulo={`${i + 1}. Não`} marcado={r.sim === false} onMarcar={alterar && (() => responder(a.id, { sim: false }))} />
              </td>
              <td style={celulaGPCampo}>
                {'guia' in a && <div style={{ padding: '1px 5px 0' }}>{a.guia}</div>}
                <CampoTexto id={`licoes-${a.id}-comentario`} rotulo={`Comentário do aspecto ${i + 1}`} ajuda={a.texto} pergunta="comentário" valor={r.comentario ?? ''} onChange={v => responder(a.id, { comentario: v })} alinhamento="left" max={5000} compacto />
              </td>
            </tr>
          )
        })}
      </SecaoTabela>
      {PERGUNTAS_LICOES.map((p, i) => (
        <SecaoTexto key={p.id} estilo="interno" colado titulo={<span style={{ fontWeight: 'normal' }}>{`${ASPECTOS_LICOES.length + i + 1}. ${p.texto}`}</span>} alturaMinima="16mm">
          <CampoTexto id={`licoes-${p.id}`} rotulo={p.texto} ajuda="Resposta da equipe, com exemplos do que aconteceu no projeto." pergunta="resposta da equipe" valor={conteudo.perguntas[p.id] ?? ''} onChange={v => alterar?.(c => ({ ...c, perguntas: { ...c.perguntas, [p.id]: v } }))} alinhamento="justify" max={20000} />
        </SecaoTexto>
      ))}
    </Folha>
  )
}

const renderizar = (r: RenderFormulario<Licoes>) => <FolhasLicoes {...r} />
const normalizar = (salvo: Licoes) => licoesNormalizado(salvo)

/** Formulário de Lições Aprendidas no modelo "20 Aula GP" do professor. */
export default function LicoesAprendidas({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  return (
    <FormularioDocumento<Licoes>
      tipo="LICOES" documento={DOCUMENTO_LICOES} titulo={TITULO_LICOES} arquivo="licoes-aprendidas.docx"
      membros={membros} inicial={licoesInicial} normalizar={normalizar} render={renderizar}
    />
  )
}
