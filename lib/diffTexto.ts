/**
 * Comparação palavra a palavra entre o texto salvo e o texto editado, para
 * mostrar o que mudou ("Alterações não salvas"). Mantém espaços e quebras de
 * linha como partes próprias, para o texto ser remontado igual ao original.
 */

export type ParteDiff = { tipo: 'igual' | 'removido' | 'incluido'; texto: string }

/** Palavras e separadores (espaços/quebras), na ordem. */
function partes(texto: string): string[] {
  return texto.match(/\s+|[^\s]+/g) ?? []
}

/** Acima disso a tabela da LCS fica grande demais: compara o texto inteiro como um bloco. */
const LIMITE_CELULAS = 400_000

export function diffTexto(antes: string, depois: string): ParteDiff[] {
  if (antes === depois) return antes ? [{ tipo: 'igual', texto: antes }] : []
  const a = partes(antes)
  const b = partes(depois)
  if (a.length * b.length > LIMITE_CELULAS) {
    return [
      ...(antes ? [{ tipo: 'removido' as const, texto: antes }] : []),
      ...(depois ? [{ tipo: 'incluido' as const, texto: depois }] : []),
    ]
  }
  // LCS por programação dinâmica (de trás para frente), depois percorre montando o diff.
  const n = a.length, m = b.length
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const saida: ParteDiff[] = []
  const por = (tipo: ParteDiff['tipo'], texto: string) => {
    const ultima = saida[saida.length - 1]
    if (ultima && ultima.tipo === tipo) ultima.texto += texto
    else saida.push({ tipo, texto })
  }
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { por('igual', a[i]); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { por('removido', a[i]); i++ }
    else { por('incluido', b[j]); j++ }
  }
  while (i < n) por('removido', a[i++])
  while (j < m) por('incluido', b[j++])
  return saida
}
