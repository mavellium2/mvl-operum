import { escreverTexto, lerTexto, type DocTexto, type Paragrafo } from '@/lib/textoFormatado'

/**
 * Blocos do Canvas que vêm da "Estratégia de condução" da Declaração do Escopo
 * (ajustes de 21/11/2026, itens 1.2 e 1.3).
 *
 * - Estratégia de condução: o texto da Declaração do Escopo, como está (mantém
 *   formatação, listas "- " e subitens recuados).
 * - Comunicação: só os itens da estratégia que falam de comunicação. Heurística
 *   conservadora: item de 1º nível que menciona "comunica"/"canal"/"canais",
 *   junto com os subitens recuados abaixo dele. Se nada casar, fica vazio para
 *   a equipe preencher.
 */

const MARCADOR = /^\s*(?:[-–—•*·]|\d+[.)])\s/
const COMUNICACAO = /comunica|\bcanal\b|\bcanais\b/

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR')
const texto = (p: Paragrafo) => p.t.map(x => x.s).join('')
const recuo = (s: string) => {
  let n = 0
  for (const c of s) { if (c === ' ') n += 1; else if (c === '\t') n += 4; else break }
  return n
}

/** Partes da estratégia que tratam de comunicação (formato e formatação preservados). */
export function comunicacaoDaEstrategia(estrategia: string): string {
  const itens = lerTexto(estrategia).map(p => ({ p, t: texto(p) })).filter(i => i.t.trim())
  if (!itens.length) return ''
  const usaMarcadores = itens.some(i => MARCADOR.test(i.t))
  const nivel1 = Math.min(...itens.map(i => recuo(i.t)))

  // Cada item de 1º nível leva junto os subitens recuados e as linhas de continuação (sem marcador).
  const grupos: { itens: Paragrafo[]; t: string }[] = []
  for (const { p, t } of itens) {
    const ehSubitem = recuo(t) > nivel1
    const ehContinuacao = usaMarcadores && !MARCADOR.test(t) && !ehSubitem
    if (grupos.length && (ehSubitem || ehContinuacao)) {
      const g = grupos[grupos.length - 1]
      g.itens.push(p)
      // A menção só conta no próprio item de 1º nível (e nas suas linhas de continuação), não nos subitens.
      if (ehContinuacao) g.t += ` ${t}`
    } else grupos.push({ itens: [p], t })
  }
  const escolhidos = grupos.filter(g => COMUNICACAO.test(semAcento(g.t)))
  if (!escolhidos.length) return ''
  const saida: DocTexto = escolhidos.flatMap(g => g.itens)
  return escreverTexto(saida)
}

/** Origem dos blocos do Canvas preenchidos pela Declaração do Escopo (o que foi copiado da última vez). */
export interface OrigemEscopoCanvas { estrategia?: string; comunicacao?: string }

type CamposEscopo = { estrategia: string; comunicacao: string; origemEscopo?: OrigemEscopoCanvas }

/**
 * Regra de sincronização com a Declaração do Escopo, sem sobrescrever a edição manual:
 * o bloco acompanha a Declaração enquanto estiver vazio ou igual ao que o sistema copiou
 * da última vez (`origemEscopo`). Se o usuário mudou o texto à mão, o bloco dele prevalece.
 * Canvas salvo antes desta regra (sem `origemEscopo`) só é preenchido se o bloco estiver vazio.
 * Se a Declaração ainda não tem estratégia (ou nada de comunicação), nada é apagado.
 */
export function sincronizarComEscopo<T extends CamposEscopo>(salvo: T, estrategiaEscopo: string): T {
  const novaComunicacao = comunicacaoDaEstrategia(estrategiaEscopo)
  const origem = salvo.origemEscopo ?? {}
  const decidir = (atual: string, anterior: string | undefined, nova: string) =>
    nova && (!atual.trim() || atual === anterior) ? nova : atual
  const estrategia = decidir(salvo.estrategia, origem.estrategia, estrategiaEscopo)
  const comunicacao = decidir(salvo.comunicacao, origem.comunicacao, novaComunicacao)
  return {
    ...salvo, estrategia, comunicacao,
    origemEscopo: {
      ...(estrategia === estrategiaEscopo && estrategiaEscopo ? { estrategia: estrategiaEscopo } : origem.estrategia !== undefined ? { estrategia: origem.estrategia } : {}),
      ...(comunicacao === novaComunicacao && novaComunicacao ? { comunicacao: novaComunicacao } : origem.comunicacao !== undefined ? { comunicacao: origem.comunicacao } : {}),
    },
  }
}
