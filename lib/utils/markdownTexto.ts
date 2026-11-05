/**
 * Converte Markdown em texto simples para resumos de uma ou duas linhas
 * (minicard do quadro, dicas ao passar o mouse). Não precisa ser perfeito:
 * só tira os símbolos que atrapalham a leitura.
 */
export function markdownParaTexto(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')                       // blocos de código
    .replace(/^(?=[^\n]*\|)(?=[^\n]*-)[\s|:-]+$/gm, ' ')    // separador de tabela (|---|:-:|)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')               // imagens
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')                // links
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')                     // títulos
    .replace(/^\s{0,3}>\s?/gm, '')                          // citações
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '') // listas e checklists
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ')       // linhas horizontais
    .replace(/\|/g, ' ')                                    // células de tabela
    .replace(/(\*\*|__)(.+?)\1/g, '$2')                     // negrito
    .replace(/(\*|_)(.+?)\1/g, '$2')                        // itálico
    .replace(/~~(.+?)~~/g, '$1')                            // riscado
    .replace(/`([^`]+)`/g, '$1')                            // código em linha
    .replace(/\s+/g, ' ')
    .trim()
}
