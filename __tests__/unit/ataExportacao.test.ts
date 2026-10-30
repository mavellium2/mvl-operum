// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { Packer } from 'docx'
import { createRequire } from 'node:module'
import { buildAtaDocx, ataComUmaLinhaVazia, ataAssinantes, type AtaExportData } from '@/lib/exports/ataDocx'
import { infoDaImagem, paragrafoDaImagem, CAIXA_ASSINATURA, CAIXA_ASSINATURA_GERENTE, CAIXA_LOGO_ATA, runDaImagem } from '@/lib/exports/imagemDocx'
import { imagemDoStorage } from '@/lib/exports/imagemServidor'

const testRequire = createRequire(import.meta.url)
const JSZip = createRequire(testRequire.resolve('docx'))('jszip')
const xmlDo = async (doc: ReturnType<typeof buildAtaDocx>) => (await JSZip.loadAsync(await Packer.toBuffer(doc))).file('word/document.xml').async('string') as Promise<string>

// PNG 1×1 transparente
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x10, 0x00, 0, 0])
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03, 0, 0, 0])

const base: AtaExportData = {
  instituicao: 'Fatec', numero: 4, nomeProjeto: 'Operum', local: 'Sala', data: new Date('2026-10-05T12:00:00Z'),
  elaboradoPor: 'Ana', aprovadoPor: 'Bia', assuntosTratados: '', decisoesTomadas: '', observacoes: '', copiasPara: [],
  presentes: [{ nome: 'Ana', setorEmpresa: 'Equipe' }, { nome: 'Bia', setorEmpresa: 'Gerente' }, { nome: '', setorEmpresa: null }],
  acoes: [{ acao: 'Entregar', prazo: null, responsavel: 'Ana' }], anexos: [],
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('imagens dos documentos', () => {
  it('lê tipo e tamanho de PNG, GIF e JPEG pelos bytes', () => {
    expect(infoDaImagem(PNG)).toEqual({ tipo: 'png', largura: 1, altura: 1 })
    expect(infoDaImagem(GIF)).toEqual({ tipo: 'gif', largura: 32, altura: 16 })
    expect(infoDaImagem(JPG)).toEqual({ tipo: 'jpg', largura: 64, altura: 48 })
    expect(infoDaImagem(Uint8Array.from([1, 2, 3]))).toBeNull()
  })

  it('formato desconhecido não gera imagem', () => {
    expect(paragrafoDaImagem(Uint8Array.from([1, 2, 3]), CAIXA_ASSINATURA)).toEqual([])
  })

  it('no servidor só baixa do storage do Operum', async () => {
    vi.stubEnv('MINIO_PUBLIC_URL', 'https://storage.operum.test')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await imagemDoStorage('https://outro.site/logo.png', CAIXA_ASSINATURA)).toEqual([])
    expect(await imagemDoStorage('http://169.254.169.254/latest', CAIXA_ASSINATURA)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('imagem do storage entra no documento', async () => {
    vi.stubEnv('MINIO_PUBLIC_URL', 'https://storage.operum.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })))
    expect(await imagemDoStorage('https://storage.operum.test/b/assinatura.png', CAIXA_ASSINATURA)).toHaveLength(1)
  })
})

describe('Word da ata', () => {
  it('presentes e ações: as linhas preenchidas e só uma vazia', () => {
    expect(ataComUmaLinhaVazia(base.presentes, p => !!p.nome.trim(), { nome: '', setorEmpresa: null }).map(p => p.nome)).toEqual(['Ana', 'Bia', ''])
    expect(ataComUmaLinhaVazia([], () => true, 'vazio')).toEqual(['vazio'])
  })

  it('nº da ata no centro da página: coluna vazia da largura da logo à direita', async () => {
    const xml = await xmlDo(buildAtaDocx(base))
    const grade = /<w:tblGrid>(.*?)<\/w:tblGrid>/.exec(xml)![1]
    const larguras = [...grade.matchAll(/w:w="(\d+)"/g)].map(m => Number(m[1]))
    expect(larguras).toHaveLength(3)
    expect(larguras[0]).toBe(larguras[2])
    expect(xml).toContain('Ata de Reunião Nº 04')
  })

  it('assinaturas: imagem cadastrada acima da linha, com o nome de cada presente', async () => {
    const assinaturas = [paragrafoDaImagem(PNG, CAIXA_ASSINATURA), []]
    const xml = await xmlDo(buildAtaDocx(base, [], assinaturas))
    expect(ataAssinantes(base.presentes).map(p => p.nome)).toEqual(['Ana', 'Bia'])
    expect((xml.match(/<pic:pic/g) ?? []).length).toBe(1)
    expect(xml.indexOf('<pic:pic')).toBeLessThan(xml.lastIndexOf('Ana'))
    expect(xml).toContain('Bia')
  })

  it('logo cadastrada entra no cabeçalho', async () => {
    const xml = await xmlDo(buildAtaDocx(base, paragrafoDaImagem(PNG, { maxW: 125, maxH: 72 })))
    expect(xml).not.toContain('Logo do Projeto')
    expect((xml.match(/<pic:pic/g) ?? []).length).toBe(1)
  })
})


describe('assinatura do gerente no quadro inicial da ata Word', () => {
  it('inclui gerente ausente dos presentes, com rótulo e imagem no mesmo parágrafo', async () => {
    const data = { ...base, gerenteProjeto: 'Gerente externo aos presentes', assinaturaGerenteUrl: 'https://storage.operum.test/gerente.png' }
    const xml = await xmlDo(buildAtaDocx(data, paragrafoDaImagem(PNG, CAIXA_LOGO_ATA), [paragrafoDaImagem(PNG, CAIXA_ASSINATURA), []], runDaImagem(PNG, CAIXA_ASSINATURA_GERENTE)))
    const signature = (xml.match(/<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>/g) || []).filter(p => p.includes('Assinatura do gerente:'))
    expect(signature).toHaveLength(1)
    expect(signature[0]).toContain('<wp:inline')
    expect(signature[0]).toContain('<w:drawing>')
    expect(signature[0]).not.toContain('<w:br')
    expect(xml.indexOf('Assinatura do gerente:')).toBeLessThan(xml.indexOf('I. Relação dos presentes'))
    expect((xml.match(/<pic:pic/g) || []).length).toBe(3)
    expect(xml).not.toContain('Logo do Projeto')
    expect(xml).toContain('Ana'); expect(xml).toContain('Bia')
  })
  it.each([{ gerenteProjeto: 'Gerente' }, { assinaturaGerenteUrl: 'https://storage.operum.test/gerente.png' }])('mantém rótulo se imagem indisponível: %j', async fields => {
    const xml = await xmlDo(buildAtaDocx({ ...base, ...fields }))
    expect(xml).toContain('Assinatura do gerente:')
    expect(xml).not.toContain('<pic:pic')
  })
  it('não acrescenta linha do gerente em dados legados sem gerente nem assinatura', async () => {
    expect(await xmlDo(buildAtaDocx(base))).not.toContain('Assinatura do gerente:')
  })
  it.each([[600, 100, 170, 28], [100, 600, 5, 30]])('imagem inline cabe em 170×30 e mantém proporção %i×%i', async (width, height, expectedWidth, expectedHeight) => {
    const bytes = PNG.slice()
    const view = new DataView(bytes.buffer)
    view.setUint32(16, width); view.setUint32(20, height)
    const xml = await xmlDo(buildAtaDocx({ ...base, gerenteProjeto: 'Gerente', presentes: [] }, [], [], runDaImagem(bytes, CAIXA_ASSINATURA_GERENTE)))
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)!
    expect(Number(extent[1]) / 9525).toBe(expectedWidth)
    expect(Number(extent[2]) / 9525).toBe(expectedHeight)
    expect(Math.abs(Number(extent[1]) / 9525 - Number(extent[2]) / 9525 * width / height)).toBeLessThanOrEqual(width / height / 2)
  })
})
