export interface BlocoEnvolvidos { titulo: string; texto: string; equipe?: boolean }
const equipe = (titulo: string) => /^integrantes do grupo:?$/i.test(titulo.trim())

/** Aceita os documentos antigos “Papel: Nome” e os blocos novos com título. */
export function lerEnvolvidos(value: string): BlocoEnvolvidos[] {
  const blocks: BlocoEnvolvidos[] = []
  const headings = /^## /m.test(value)
  for (const line of value.split('\n')) {
    if (headings) {
      if (line.startsWith('## ')) {
        const titulo = line.slice(3)
        blocks.push({ titulo, texto: '', equipe: equipe(titulo) })
      } else if (blocks.length) blocks[blocks.length - 1].texto += `${blocks[blocks.length - 1].texto ? '\n' : ''}${line}`
    } else if (line.trim()) {
      const index = line.indexOf(':')
      const titulo = index > 0 ? line.slice(0, index).trim() : ''
      const texto = (index > 0 ? line.slice(index + 1) : line).trim()
      const existing = blocks.find(block => block.titulo.toLowerCase() === titulo.toLowerCase())
      if (existing) existing.texto += `\n${texto}`
      else blocks.push({ titulo, texto, equipe: equipe(titulo) })
    }
  }
  if (!blocks.some(block => block.equipe)) {
    const professor = blocks.findIndex(block => /^professor/i.test(block.titulo))
    blocks.splice(professor + 1, 0, { titulo: 'Integrantes do Grupo', texto: '', equipe: true })
  }
  return blocks
}
export const gravarEnvolvidos = (blocks: BlocoEnvolvidos[]) => blocks.map(block => `## ${block.titulo.replace(/[\r\n]/g, ' ')}\n${block.equipe ? '' : block.texto}`).join('\n')
export function exibirEnvolvidos(value: string, membros: string[]) {
  return lerEnvolvidos(value).map(block => ({ rotulo: block.titulo, valores: block.equipe ? membros : block.texto.split('\n').map(line => line.trim()).filter(Boolean) }))
}
