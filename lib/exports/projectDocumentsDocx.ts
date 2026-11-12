import { Packer, type Paragraph } from 'docx'
import { safeAvatarUrl } from '@/lib/validation/avatarUrl'
export { parseDocumentCost } from '@/lib/documentCost'
async function save(doc: Parameters<typeof Packer.toBlob>[0], name: string) {
  const url = URL.createObjectURL(await Packer.toBlob(doc)), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/** Imagem para o Word gerado no navegador; indisponível vira "sem imagem" (não impede o download). */
async function imagemNoNavegador(url: string | null | undefined, caixa: { maxW: number; maxH: number; centro?: boolean }): Promise<Paragraph[]> {
  const safe = safeAvatarUrl(url)
  if (!safe) return []
  const { baixarImagem, paragrafoDaImagem } = await import('./imagemDocx')
  const bytes = await baixarImagem(safe, { credentials: 'same-origin' })
  return bytes ? paragrafoDaImagem(bytes, caixa) : []
}

/** Ata no layout do modelo, gerada no navegador com a logo do projeto e as assinaturas dos presentes. */
export async function downloadAtaDocx(d: import('./ataDocx').AtaExportData) {
  const { buildAtaDocx, ataNumero, ataAssinantes } = await import('./ataDocx')
  const { CAIXA_LOGO_ATA, CAIXA_ASSINATURA, CAIXA_ASSINATURA_GERENTE, baixarImagem, runDaImagem } = await import('./imagemDocx')
  const gerenteUrl = safeAvatarUrl(d.assinaturaGerenteUrl)
  const [assinaturaGerente, logo, ...assinaturas] = await Promise.all([
    gerenteUrl ? baixarImagem(gerenteUrl, { credentials: 'same-origin' }).then(bytes => bytes ? runDaImagem(bytes, CAIXA_ASSINATURA_GERENTE) : undefined) : undefined,
    imagemNoNavegador(d.logoUrl, CAIXA_LOGO_ATA),
    ...ataAssinantes(d.presentes).map(p => imagemNoNavegador(p.assinaturaUrl, CAIXA_ASSINATURA)),
  ])
  await save(buildAtaDocx(d, logo, assinaturas, assinaturaGerente), `ata-${ataNumero(d.numero)}.docx`)
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
  const { folhaParaDocx } = await import('./folhaDocx')
  await save(await folhaParaDocx(raiz, titulo), arquivo)
}
