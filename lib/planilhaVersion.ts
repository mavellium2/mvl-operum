/** Sequência do conteúdo da planilha, independente da versão do produto. */
export function rotuloVersaoPlanilha(numero: number) {
  if (!Number.isSafeInteger(numero) || numero < 1) throw new Error('Número de versão inválido.')
  return `v${1 + Math.floor(numero / 10000)}.${Math.floor(numero / 100) % 100}.${numero % 100}`
}
