/**
 * Versões dos documentos da Documentação: sequência por documento (tipo +
 * recurso) — 1.0, 1.1, 1.2 … 1.99, 2.0 (pedido do professor, 18/11/2026).
 * Não confundir com a versão do produto nem com o histórico da planilha
 * (v1.0.1, v1.0.2…), que segue outro formato.
 */
export function rotuloVersaoDocumento(numero: number): string {
  if (!Number.isSafeInteger(numero) || numero < 1) throw new Error('Número de versão inválido.')
  return `${1 + Math.floor((numero - 1) / 100)}.${(numero - 1) % 100}`
}

/**
 * Posição de um rótulo na sequência: "1.0" → 1, "1.99" → 100, "2.0" → 101.
 * Rótulos da 1.59.0 ("v1.0.1", "v1.0.2"…) ocupam a mesma posição (v1.0.1 = 1.0).
 * Rótulos livres que não seguem o formato ("1", datas) devolvem null.
 */
export function numeroDaVersao(rotulo: string | null | undefined): number | null {
  const r = rotulo?.trim() ?? ''
  const v = /^v(\d+)\.(\d{1,2})\.(\d{1,2})$/.exec(r)
  if (v) {
    const n = (Number(v[1]) - 1) * 10000 + Number(v[2]) * 100 + Number(v[3])
    return n >= 1 ? n : null
  }
  const m = /^(\d+)\.(\d{1,2})$/.exec(r)
  if (!m || Number(m[1]) < 1) return null
  return (Number(m[1]) - 1) * 100 + Number(m[2]) + 1
}

/** Rótulo para exibir nas listas de versões. */
export const exibirVersao = (rotulo: string | null | undefined) => rotulo?.trim() || '—'

/**
 * Próximo rótulo a partir das versões já salvas do documento: depois da maior
 * posição. Rótulos livres fora do formato também contam (um documento com duas
 * versões assim segue em 1.2).
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
  if (tipo === 'ESCOPO' || tipo === 'RISCOS' || tipo === 'LICOES' || tipo === 'CANVAS' || tipo === 'AVALIACAO_RH')
    return { ...conteudo, cabecalho: { ...((conteudo.cabecalho as object | undefined) ?? {}), versao: rotulo } }
  return conteudo
}
