/**
 * Mesmas regras de `file-service/src/upload/svg-safety.ts` (ADR-042), para os
 * arquivos do projeto, que vão do navegador direto ao storage e não passam
 * pelo file-service. Regra de recusa, não de limpeza: script, eventos `on*`,
 * `javascript:`, HTML embutido, links, recursos externos e DOCTYPE/ENTITY.
 * Manter as duas listas iguais.
 */
const PROIBIDOS: Array<[RegExp, string]> = [
  [/<!doctype|<!entity/i, 'DOCTYPE ou ENTITY'],
  [/<\s*script\b/i, 'script'],
  [/<\s*foreignobject\b/i, 'foreignObject'],
  [/<\s*(iframe|embed|object|audio|video|a|image|use|animate|set|handler|listener)\b/i, 'elemento ativo ou com link'],
  [/\son[a-z]+\s*=/i, 'atributo de evento (on...)'],
  [/javascript\s*:|vbscript\s*:|data\s*:\s*(text\/html|application\/|image\/svg)/i, 'URL executável'],
  [/(?:xlink:)?href\s*=/i, 'link (href)'],
  [/@import|url\s*\(\s*['"]?\s*(?!#)/i, 'recurso externo em CSS'],
]

/** Decodifica entidades numéricas (`&#106;`, `&#x6a;`) para que não escondam palavras proibidas. */
function semEntidades(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16) || 32))
    .replace(/&#([0-9]+);?/g, (_, d: string) => String.fromCodePoint(Number(d) || 32))
}

/** Motivo da recusa (texto para o usuário) ou null se o SVG é simples, sem conteúdo ativo. */
export function motivoSvgInseguro(bruto: string): string | null {
  if (bruto.includes('\u0000') || !/<svg[\s>]/i.test(bruto)) return 'O arquivo .svg não é um SVG válido.'
  const texto = semEntidades(bruto)
  for (const [re, motivo] of PROIBIDOS) {
    if (re.test(texto)) return `SVG recusado: contém ${motivo}. Envie um SVG simples, só com formas e texto, ou exporte como PNG.`
  }
  return null
}
