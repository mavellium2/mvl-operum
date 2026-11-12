import { funcaoKey } from '@/lib/utils/normalize'

/**
 * Separadores de funções num mesmo texto. "Desenvolvedora Front-End | Redatora" são
 * duas funções, não uma. A vírgula também separa porque é o formato gravado em
 * UserProject.role ("Front-End, Redatora"). Barra (UI/UX) e hífen (Front-End) não separam.
 */
const SEPARADORES = /\s*[|;,]\s*/

/** Funções distintas, na ordem em que vieram: separa textos compostos e tira equivalentes repetidas. */
export function separarFuncoes(nomes: (string | null | undefined)[] | string | null | undefined): string[] {
  const lista = typeof nomes === 'string' || nomes == null ? [nomes ?? ''] : nomes
  const saida: string[] = []
  for (const texto of lista) {
    for (const parte of (texto ?? '').split(SEPARADORES)) {
      const nome = parte.trim().replace(/\s+/g, ' ').slice(0, 120)
      if (nome && !saida.some(n => funcaoKey(n) === funcaoKey(nome))) saida.push(nome)
    }
  }
  return saida
}

/** Texto gravado em UserProject.role: funções separadas por vírgula, sem repetidas. */
export const textoDeFuncoes = (nomes: Parameters<typeof separarFuncoes>[0]) => separarFuncoes(nomes).join(', ')

/** Nome de UMA função (cadastro): recusa texto com mais de uma. */
export function erroNomeDeFuncao(nome: string): string | null {
  const partes = separarFuncoes(nome)
  if (!partes.length) return 'Informe o nome da função.'
  if (partes.length > 1 || SEPARADORES.test(nome.trim())) {
    return `Uma função por vez: "${nome.trim()}" tem mais de uma. Cadastre separadas (${partes.map(p => `"${p}"`).join(' e ')}).`
  }
  return null
}

/** O rótulo "Gerente de Projeto" (e equivalentes) é o papel de gerente do sistema. */
export const ehFuncaoDeGerente = (nome: string) => funcaoKey(nome) === funcaoKey('Gerente de Projeto')
