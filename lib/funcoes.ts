import { funcaoKey } from '@/lib/utils/normalize'

/**
 * Separadores que indicam mais de uma função num texto: "Desenvolvedora Front-End |
 * Redatora" são duas. Servem para recusar no cadastro e separar entradas antigas;
 * as funções de uma pessoa são gravadas como lista de vínculos, nunca como texto.
 * Barra (UI/UX) e hífen (Front-End) não separam.
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
