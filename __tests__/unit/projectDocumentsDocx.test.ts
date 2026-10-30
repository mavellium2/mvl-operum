// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Packer } from 'docx'
import { writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const testRequire = createRequire(import.meta.url)
const JSZip = createRequire(testRequire.resolve('docx'))('jszip')
import { join } from 'node:path'
import { buildCharterDocx, buildStakeholderDocx, downloadAtaDocx } from '@/lib/exports/projectDocumentsDocx'
import { buildAtaDocx } from '@/lib/exports/ataDocx'
import { parseDocumentCost } from '@/lib/documentCost'
import { charterChanges } from '@/lib/charterChanges'
import type { CharterDocumentProps } from '@/components/projetos/documentacao/ProjectCharterDocument'
const charter: CharterDocumentProps = { nomeProjeto: 'Projeto Operum', categoria: 'Instituição / curso / termo / semestre', gerenteProjeto: 'Gerente', elaboradoPor: 'Elaborador', aprovadoPor: '', versao: '1', dataAprovacao: '', justificativa: 'Justificativa documentada', objetivos: 'Objetivo documentado', metodologia: 'Metodologia preservada', descricaoProduto: 'Produto um\nProduto dois', premissas: 'Equipe disponível', restricoes: 'Prazo de entrega', limitesAutoridade: 'Aprovar atividades', principaisEnvolvidos: 'Instituição: Faculdade\nProfessor: Fábio\nPatrocinador: Cliente\nFornecedores: Equipe', membros: [{ name: 'Integrante' }], fases: [{ id: 'f1', fase: 'Planejamento', dataLimite: '2026-10-10', custo: '1.000,50' }, { id: 'f2', fase: 'Entrega', dataLimite: '2026-11-10', custo: '2.000,25' }] }
async function inspect(name: string, doc: Parameters<typeof Packer.toBuffer>[0]) {
  const dir = process.env.OPERUM_DOCUMENT_RENDER_DIR || '/tmp/operum-document-tests'
  await mkdir(dir, { recursive: true }); const path = join(dir, `${name}.docx`)
  const buffer = await Packer.toBuffer(doc)
  if (process.env.OPERUM_DOCUMENT_RENDER_DIR) await writeFile(path, buffer)
  return (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string')
}
describe('modelos documentais', () => {
  it('custo em formato brasileiro preserva milhar e centavos', () => { expect(parseDocumentCost('R$ 1.000,50')).toBe(1000.5); expect(parseDocumentCost('1000.50')).toBe(1000.5) })
  it('diff registra apenas campos alterados, incluindo remoção', () => { expect(charterChanges({ objetivos: 'Antes', metodologia: 'Igual' }, { objetivos: 'Depois', metodologia: 'Igual' })).toEqual([{ field: 'objetivos', before: 'Antes', after: 'Depois' }]); expect(charterChanges({ categoria: 'Faculdade' }, {})).toContainEqual({ field: 'categoria', before: 'Faculdade', after: null }) })
  it('partes interessadas usa paisagem e as oito colunas do modelo', async () => {
    const xml = await inspect('stakeholders', await buildStakeholderDocx({ categoria: 'Faculdade', nomeProjeto: 'Operum', gerenteProjeto: 'Gerente', elaboradoPor: 'Elaborador', aprovadoPor: '', versao: '1', dataCriacao: '', dataAprovacao: '' }, [{ ref: '01', nome: 'Integrante', empresaEquipe: 'Equipe', cargoCompetencia: 'Desenvolvedor', email: 'pessoa@example.test', telefoneFax: '(11) 90000-0000', endereco: 'Campus', observacoes: 'Parte interessada' }]))
    expect(xml).toContain('w:orient="landscape"'); expect(xml).toContain('w:w="15138"'); expect(xml).toContain('Telefone/Celular'); expect(xml).toContain('Observação')
  })
  it('rodapé de stakeholders contém somente o campo de número da página', async () => {
    const doc = await buildStakeholderDocx({ categoria: 'Faculdade', nomeProjeto: 'Operum', gerenteProjeto: 'Gerente', elaboradoPor: '', aprovadoPor: '', versao: '1', dataCriacao: '', dataAprovacao: '' }, [])
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
    const footer = await zip.file('word/footer1.xml').async('string')
    expect(footer).toContain('PAGE')
    expect(footer).not.toContain('©')
    expect(footer).not.toContain('03_Form Stakeholders')
    expect(footer).not.toContain('·')
    const literalText = [...footer.matchAll(/<w:t(?: [^>]*)?>(.*?)<\/w:t>/g)].map(m => m[1]).join('').trim()
    expect(literalText.replace(/1/g, '')).toBe('')
  })
  it('partes interessadas inativas saem em vermelho no docx, com o motivo na observação', async () => {
    const header = { categoria: 'Faculdade', nomeProjeto: 'Operum', gerenteProjeto: 'Gerente', elaboradoPor: '', aprovadoPor: '', versao: '1', dataCriacao: '', dataAprovacao: '' }
    const base = { ref: '01', nome: 'Pessoa', empresaEquipe: 'Equipe', cargoCompetencia: 'Dev', email: 'p@example.test', telefoneFax: '', endereco: '' }
    const ativo = await inspect('stakeholders-ativo', await buildStakeholderDocx(header, [base]))
    const inativo = await inspect('stakeholders-inativo', await buildStakeholderDocx(header, [{ ...base, inativo: true, motivoInativo: 'Contrato encerrado' }]))
    expect(ativo).not.toContain('B91C1C')
    expect(inativo).toContain('B91C1C'); expect(inativo).toContain('Inativo: Contrato encerrado')
  })
  it('termo mantém a ordem do modelo, numera fases e calcula total', async () => {
    const xml = await inspect('charter', await buildCharterDocx(charter))
    expect(xml).toContain('3.000,75'); expect(xml).toContain('1.1 Planejamento'); expect(xml.indexOf('Descrição do produto')).toBeLessThan(xml.indexOf('Macro fases')); expect(xml.indexOf('Designação de gerente')).toBeLessThan(xml.indexOf('Metodologia do projeto'))
  })
  it('integrantes do termo saem como "Nome – Papel" quando o cadastro tem função', async () => {
    const xml = await inspect('charter-papel', await buildCharterDocx({ ...charter, membros: [{ name: 'Ana', papel: 'Desenvolvedora' }, { name: 'Bia' }] }))
    expect(xml).toContain('Ana – Desenvolvedora'); expect(xml).toContain('Bia')
  })
  it('ata mantém ações em três colunas e assinaturas vazias', async () => {
    const xml = await inspect('ata', buildAtaDocx({ instituicao: 'Faculdade', numero: 1, nomeProjeto: 'Operum', local: 'Campus', data: new Date('2026-10-05T12:00:00Z'), elaboradoPor: 'Autor', aprovadoPor: null, assuntosTratados: 'Planejamento\nDesenvolvimento', decisoesTomadas: 'Entregar a versão', observacoes: 'Próxima reunião', copiasPara: ['Equipe'], presentes: [{ nome: 'Integrante', setorEmpresa: 'Equipe' }], acoes: [{ acao: 'Entregar projeto', prazo: new Date('2026-11-01T12:00:00Z'), responsavel: 'Integrante' }], anexos: [{ nome: 'Plano de projeto', url: null }] }))
    expect(xml).toContain('Setor/Empresa'); expect(xml).toContain('Responsável'); expect(xml).toContain('________________________'); expect(xml.indexOf('II. Assuntos')).toBeLessThan(xml.indexOf('III. Decisões'))
  })
  it('ata segue o modelo: nº, "nome – função", caixas de cópia e rodapé', async () => {
    const xml = await inspect('ata-modelo', buildAtaDocx({ instituicao: 'Fatec Garça - Gestão - A definir - 1° Semestre 2025', numero: 3, nomeProjeto: 'Operum', local: 'Sala', data: new Date('2026-10-05T12:00:00Z'), elaboradoPor: 'Ana', elaboradoPorFuncao: 'Back-end', aprovadoPor: 'Bia', aprovadoPorFuncao: 'Gerente', assuntosTratados: '', decisoesTomadas: '', observacoes: '', copiasPara: ['Equipe', 'Plano do Projeto'], presentes: [], acoes: [], anexos: [] }))
    expect(xml).toContain('Ata de Reunião Nº 03')
    expect(xml).toContain('Ana – Back-end'); expect(xml).toContain('Bia – Gerente')
    expect(xml).toContain('Enviar cópias para:'); expect(xml).toContain('☒ Equipe'); expect(xml).toContain('☒ Plano do Projeto')
    expect(xml).toContain('Documentos anexos:'); expect(xml).toContain('Obs:')
  })
})


describe('assinatura do gerente inline no Word', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  const header = { categoria: 'Faculdade', nomeProjeto: 'Operum', gerenteProjeto: 'Gerente', elaboradoPor: '', aprovadoPor: '', versao: '1', dataCriacao: '', dataAprovacao: '' }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
  function images(width: number, height: number) {
    const close = vi.fn()
    vi.stubGlobal('window', {})
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }))
    const fetchImage = vi.fn().mockImplementation(async () => new Response(png, { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchImage)
    return { close, fetchImage }
  }
  for (const kind of ['termo', 'stakeholders'] as const) {
    it.each([[600, 100, 170, 170 / 6], [100, 600, 5, 30]])(`${kind}: rótulo e imagem no mesmo parágrafo, sem distorcer proporção %ix%i`, async (width, height, expectedWidth, expectedHeight) => {
      const { close, fetchImage } = images(width, height)
      const url = 'http://localhost:9000/mvloperum/signatures/gerente.png'
      const doc = kind === 'termo'
        ? await buildCharterDocx({ ...charter, gerenteSignatureUrl: url })
        : await buildStakeholderDocx({ ...header, signatureUrl: url }, [])
      const xml = await inspect(`assinatura-inline-${kind}-${width}`, doc)
      const signatureParagraphs = (xml.match(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g) || []).filter((p: string) => p.includes('Assinatura:'))
      expect(signatureParagraphs).toHaveLength(1)
      const paragraph = signatureParagraphs[0]
      expect(paragraph).toContain('<w:drawing>')
      expect(paragraph).toContain('<wp:inline')
      expect(paragraph).not.toContain('<w:br')
      expect(paragraph.indexOf('Assinatura:')).toBeLessThan(paragraph.indexOf('<w:drawing>'))
      const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(paragraph)!
      const cx = Number(extent[1]), cy = Number(extent[2])
      expect(cx / 9525).toBeCloseTo(expectedWidth, 3)
      expect(cy / 9525).toBeCloseTo(expectedHeight, 3)
      expect(cx / cy).toBeCloseTo(width / height, 3)
      expect(cx).toBeLessThanOrEqual(170 * 9525)
      expect(cy).toBeLessThanOrEqual(30 * 9525)
      expect(close).toHaveBeenCalledOnce()
      expect(fetchImage).toHaveBeenCalledWith(url, expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }))
    })
  }
  it('preserva a caixa atual da logo e a separa da assinatura', async () => {
    images(600, 100)
    const xml = await inspect('logo-e-assinatura', await buildCharterDocx({ ...charter, logoUrl: 'http://localhost:9000/logo.png', gerenteSignatureUrl: 'http://localhost:9000/signature.png' }))
    const extents = [...xml.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)]
    expect(Number(extents[0][1]) / 9525).toBe(100)
    expect(Number(extents[0][2]) / 9525).toBeCloseTo(100 / 6, 3)
    expect(Number(extents[1][1]) / 9525).toBe(170)
  })
  it('mantém rótulo sem imagem quando não existe assinatura cadastrada', async () => {
    const xml = await inspect('sem-assinatura', await buildCharterDocx(charter))
    const paragraph = (xml.match(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g) || []).find((p: string) => p.includes('Assinatura:'))!
    expect(paragraph).toContain('Assinatura:')
    expect(paragraph).not.toContain('<w:drawing>')
  })
  it.each([true, false])('preserva limite de download de 5 MB (content-length: %s)', async (declaredSize) => {
    images(600, 100)
    const cancel = vi.fn()
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5_000_001)) }, cancel })
    const response = new Response(body, { headers: { 'content-type': 'image/png', ...(declaredSize ? { 'content-length': '5000001' } : {}) } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    await expect(buildCharterDocx({ ...charter, gerenteSignatureUrl: 'http://localhost:9000/assinatura.png' })).rejects.toThrow(declaredSize ? 'Image unavailable' : 'Image too large')
    expect(createImageBitmap).not.toHaveBeenCalled()
    if (!declaredSize) expect(cancel).toHaveBeenCalledOnce()
  })

})


describe('download da Ata no navegador', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
  it('carrega assinatura do gerente sem depender dos presentes e mantém logo e assinaturas anteriores', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
    const fetchImage = vi.fn().mockImplementation(async () => new Response(png, { headers: { 'content-type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchImage)
    const click = vi.fn()
    vi.stubGlobal('document', { createElement: () => ({ click }) })
    const pack = vi.spyOn(Packer, 'toBlob').mockResolvedValue(new Blob())
    await downloadAtaDocx({ numero: 1, nomeProjeto: 'Operum', local: null, data: null, elaboradoPor: 'Ana', aprovadoPor: 'Gerente', assuntosTratados: '', decisoesTomadas: '', observacoes: '', copiasPara: [], presentes: [{ nome: 'Ana', setorEmpresa: null, assinaturaUrl: 'https://storage.operum.test/ana.png' }], acoes: [], anexos: [], logoUrl: 'https://storage.operum.test/logo.png', gerenteProjeto: 'Gerente', assinaturaGerenteUrl: 'https://storage.operum.test/gerente.png' })
    expect(fetchImage).toHaveBeenCalledWith('https://storage.operum.test/gerente.png', expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }))
    expect(fetchImage).toHaveBeenCalledTimes(3)
    expect(click).toHaveBeenCalledOnce()
    const xml = await inspect('ata-browser-gerente', pack.mock.calls[0][0])
    expect(xml).toContain('Assinatura do gerente:')
    expect((xml.match(/<pic:pic/g) || []).length).toBe(3)
    const paragraph = (xml.match(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g) || []).find((p: string) => p.includes('Assinatura do gerente:'))!
    expect(paragraph).toContain('<wp:inline')
  })
})
