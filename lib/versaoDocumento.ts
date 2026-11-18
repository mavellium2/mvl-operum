import { rotuloVersaoPlanilha } from './planilhaVersion'

/**
 * Versões dos documentos da Documentação: sequência por documento (tipo +
 * recurso), no mesmo formato do histórico da planilha — v1.0.1, v1.0.2 …
 * v1.0.99, v1.1.0. Não confundir com a versão do produto.
 */
export const rotuloVersaoDocumento = rotuloVersaoPlanilha

/** Número da sequência de um rótulo "vX.Y.Z"; rótulos antigos ("1.0", "1.1") devolvem null. */
export function numeroDaVersao(rotulo: string | null | undefined): number | null {
  const m = /^v(\d+)\.(\d{1,2})\.(\d{1,2})$/.exec(rotulo?.trim() ?? '')
  if (!m) return null
  const n = (Number(m[1]) - 1) * 10000 + Number(m[2]) * 100 + Number(m[3])
  return n >= 1 ? n : null
}

/** Rótulo para exibir: os novos já vêm com "v" (v1.0.2); os antigos ganham o prefixo (v1.1). */
export const exibirVersao = (rotulo: string | null | undefined) => {
  const r = rotulo?.trim() ?? ''
  return !r ? '—' : r.startsWith('v') ? r : `v${r}`
}

/**
 * Próximo rótulo a partir das versões já salvas do documento. Versões antigas,
 * com rótulo livre ("1.0", "1.1"), contam na sequência: o documento com duas
 * versões antigas segue em v1.0.3.
 */
export function proximaVersaoDocumento(rotulos: (string | null | undefined)[]): string {
  let maior = 0
  let antigas = 0
  for (const r of rotulos) {
    const n = numeroDaVersao(r)
    if (n === null) antigas++
    else maior = Math.max(maior, n)
  }
  return rotuloVersaoDocumento(Math.max(maior, antigas) + 1)
}

/**
 * Grava o rótulo da versão no campo "Versão" do próprio conteúdo, para o
 * documento salvo (PDF, Word, histórico) mostrar a versão que ele é.
 */
export function comVersaoNoConteudo(tipo: string, conteudo: Record<string, unknown>, rotulo: string): Record<string, unknown> {
  if (tipo === 'STAKEHOLDER' && conteudo.header && typeof conteudo.header === 'object')
    return { ...conteudo, header: { ...(conteudo.header as object), versao: rotulo } }
  if (tipo === 'EAP') return { ...conteudo, version: rotulo }
  if (tipo === 'ESCOPO' || tipo === 'RISCOS' || tipo === 'LICOES')
    return { ...conteudo, cabecalho: { ...((conteudo.cabecalho as object | undefined) ?? {}), versao: rotulo } }
  return conteudo
}
