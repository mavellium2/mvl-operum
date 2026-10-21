import { AlignmentType, ImageRun, Packer, Paragraph, TextRun } from 'docx'
import type { CharterDocumentProps } from '@/components/projetos/documentacao/ProjectCharterDocument'
import { observacaoDaLinha, type ProjetoHeader, type Stakeholder } from '@/components/projetos/StakeholderDocument'
import { safeAvatarUrl } from '@/lib/validation/avatarUrl'
import { heading, modelDocument, modelTable, paragraphs, redParagraphs } from './documentModel'
import { parseDocumentCost } from '@/lib/documentCost'
export { parseDocumentCost } from '@/lib/documentCost'
async function image(url?: string | null): Promise<Paragraph[]> {
  if (!url) return []
  if (typeof window === 'undefined') throw new Error('Images are loaded only by the browser')
  const safe = safeAvatarUrl(url); if (!safe) throw new Error('Invalid image URL')
  const response = await fetch(safe, { signal: AbortSignal.timeout(5000), credentials: 'same-origin' })
  if (!response.ok || Number(response.headers.get('content-length')) > 5e6) throw new Error('Image unavailable')
  const mime = response.headers.get('content-type')?.split(';')[0], type = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/gif' ? 'gif' : null
  if (!type) throw new Error('Unsupported image')
  const reader = response.body?.getReader(); if (!reader) throw new Error('Image unavailable')
  const chunks: Uint8Array[] = []; let size = 0
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 5e6) throw new Error('Image too large'); chunks.push(value) } } finally { await reader.cancel() }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime })), ratio = bitmap.width / bitmap.height
  bitmap.close()
  return [new Paragraph({ children: [new ImageRun({ type, data: bytes, transformation: { width: Math.min(100,75*ratio), height: Math.min(75,100/ratio) } })] })]
}
const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (raw?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw ?? ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : raw || '—' }
const title = (text: string) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 26 })] })
async function save(doc: Parameters<typeof Packer.toBlob>[0], name: string) {
  const url = URL.createObjectURL(await Packer.toBlob(doc)), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function buildStakeholderDocx(h: ProjetoHeader, rows: Stakeholder[]) {
  return modelDocument('Formulário de Stakeholders', [ ...await image(h.logoUrl), title('Formulário de Stakeholders'),
    modelTable([11353,3785], [[h.categoria,''],[`Nome do projeto: ${h.nomeProjeto}`,''],[`Gerente do projeto: ${h.gerenteProjeto}`,''],[`Elaborado por: ${h.elaboradoPor}`,''],[`Aprovado por: ${h.aprovadoPor}`,[...paragraphs('Assinatura:'), ...await image(h.signatureUrl)]],[`Versão: ${h.versao}`,`Data de aprovação: ${h.dataAprovacao}`]], false, true),
    heading('Partes interessadas'),
    modelTable([650,2000,1700,2300,2200,1800,2300,2188], [['Ref','Nome','Empresa/Equipe','Cargo/Competência','e-mail','Telefone/Celular','Endereço','Observação'], ...rows.map(s => { const cells = [s.ref,s.nome,s.empresaEquipe,s.cargoCompetencia,s.email,s.telefoneFax,s.endereco,observacaoDaLinha(s)]; return s.inativo ? cells.map(redParagraphs) : cells })], true)
  ], '© 03_Form Stakeholders', true)
}
export async function buildCharterDocx(p: CharterDocumentProps) {
  const total = p.fases.reduce((sum,f) => sum+parseDocumentCost(f.custo),0)
  return modelDocument('Termo de Abertura de Projeto - project charter', [ ...await image(p.logoUrl), title('Termo de Abertura de Projeto - project charter'),
    modelTable([7144,3062], [[p.categoria ?? '',''],[`Nome do projeto: ${p.nomeProjeto}`,''],[`Elaborado por: ${p.elaboradoPor}`,`Versão: ${p.versao}`],[`Aprovado por: ${p.aprovadoPor}`,''],[[...paragraphs('Assinatura:'), ...await image(p.gerenteSignatureUrl)],`Data de aprovação: ${p.dataAprovacao}`]], false, true),
    heading('Justificativa do projeto'), ...paragraphs(p.justificativa), heading('Objetivo(s) do projeto'), ...paragraphs(p.objetivos),
    heading('Descrição do produto do projeto'), ...p.descricaoProduto.split('\n').filter(Boolean).map(text => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text, size: 18 })] })),
    heading('Premissas (hipóteses) e restrições para o projeto'), modelTable([5103,5103],[['Premissas (hipóteses)','Restrições'],[p.premissas,p.restricoes]],true),
    heading('Macro fases, prazos e custo'), modelTable([6124,2041,2041],[['Macro fase','Data limite','Custo'],...p.fases.map((f,i) => [`1.${i+1} ${f.fase}`,date(f.dataLimite),money(parseDocumentCost(f.custo))]),['Custo total','',money(total)]],true),
    heading('Principais envolvidos'), ...paragraphs(p.principaisEnvolvidos), heading('Integrantes do grupo'), ...p.membros.flatMap(m => paragraphs(m.papel?.trim() ? `${m.name} – ${m.papel.trim()}` : m.name)),
    heading('Designação de gerente'), modelTable([3062,7144],[['Gerente do projeto',p.gerenteProjeto],['Limites de autoridade',p.limitesAutoridade]]),
    ...(p.metodologia ? [heading('Metodologia do projeto'),...paragraphs(p.metodologia)] : [])
  ], '© 02_Project Charter')
}
export async function downloadStakeholderDocx(h: ProjetoHeader, rows: Stakeholder[]) { await save(await buildStakeholderDocx(h, rows), 'partes-interessadas.docx') }
export async function downloadCharterDocx(p: CharterDocumentProps) { await save(await buildCharterDocx(p), 'termo-de-abertura.docx') }
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
  const { CAIXA_LOGO_ATA, CAIXA_ASSINATURA } = await import('./imagemDocx')
  const [logo, ...assinaturas] = await Promise.all([
    imagemNoNavegador(d.logoUrl, CAIXA_LOGO_ATA),
    ...ataAssinantes(d.presentes).map(p => imagemNoNavegador(p.assinaturaUrl, CAIXA_ASSINATURA)),
  ])
  await save(buildAtaDocx(d, logo, assinaturas), `ata-${ataNumero(d.numero)}.docx`)
}
