/**
 * Funções (cargos) num mesmo texto: "Front-End | Redatora" são duas. Mesma regra de
 * lib/funcoes.ts no monolito. A vírgula é o separador gravado em UserProject.role.
 */
const SEPARADORES = /\s*[|;,]\s*/

const chave = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

/** "A | B, a" → "A, B": separa, apara e tira repetidas (sem diferenciar acento e caixa). */
export function textoDeFuncoes(texto: string | null | undefined): string | null {
  if (texto == null) return null
  const nomes: string[] = []
  for (const parte of texto.split(SEPARADORES)) {
    const nome = parte.trim().replace(/\s+/g, ' ')
    if (nome && !nomes.some(n => chave(n) === chave(nome))) nomes.push(nome)
  }
  return nomes.join(', ') || null
}

/** Nome de UMA função no cadastro: texto com separador é recusado. */
export function erroNomeDeFuncao(nome: string | undefined): string | null {
  if (nome === undefined) return null
  if (SEPARADORES.test(nome.trim())) {
    const partes = nome.split(SEPARADORES).map(p => p.trim()).filter(Boolean)
    return `Uma função por vez: "${nome.trim()}" tem mais de uma. Cadastre separadas (${partes.map(p => `"${p}"`).join(' e ')}).`
  }
  return null
}
