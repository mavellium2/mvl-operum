import { Packer } from 'docx'
import { safeAvatarUrl } from '@/lib/validation/avatarUrl'
export { parseDocumentCost } from '@/lib/documentCost'
async function save(doc: Parameters<typeof Packer.toBlob>[0], name: string) {
  const url = URL.createObjectURL(await Packer.toBlob(doc)), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/**
 * Capa no Word, idêntica à folha do sistema. A logo é obrigatória quando o projeto
 * tem uma: sem ela o Word sairia diferente da tela, então a falha é avisada.
 */
export async function downloadCapaDocx(d: import('./capaDocx').CapaExportData & { logoUrl?: string | null }) {
  const { buildCapaDocx } = await import('./capaDocx')
  const { baixarImagem } = await import('./imagemDocx')
  const { CAPA } = await import('@/lib/capaLayout')
  const logoUrl = safeAvatarUrl(d.logoUrl)
  const [cabecalho, logo] = await Promise.all([
    baixarImagem(CAPA.cabecalho.src, { credentials: 'same-origin' }),
    logoUrl ? baixarImagem(logoUrl, { credentials: 'same-origin' }) : Promise.resolve(null),
  ])
  if (!cabecalho || (logoUrl && !logo)) throw new Error('Imagem da capa indisponível')
  const nome = d.nomeProjeto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  await save(buildCapaDocx(d, { cabecalho, logo }), `capa${nome ? `-${nome}` : ''}.docx`)
}

/**
 * Word idêntico à folha desenhada na tela (páginas, tabelas, imagens e rodapé).
 * `raiz` é o elemento do <Folha> (a cópia de impressão do documento).
 */
export async function downloadFolhaDocx(raiz: HTMLElement, titulo: string, arquivo: string) {
  const { esperarFolhaPronta, folhaParaDocx } = await import('./folhaDocx')
  await esperarFolhaPronta(raiz)
  await save(await folhaParaDocx(raiz, titulo), arquivo)
}

/** Nome do arquivo da Ata: "ata-03-app-horta-comunitaria.docx". */
export function arquivoDaAta(numero: number, nomeProjeto: string): string {
  const nome = nomeProjeto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase()
  return `ata-${String(numero || 0).padStart(2, '0')}${nome ? `-${nome}` : ''}.docx`
}
