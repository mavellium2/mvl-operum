// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Packer } from 'docx'
import { writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
const testRequire = createRequire(import.meta.url)
const JSZip = createRequire(testRequire.resolve('docx'))('jszip')
import { join } from 'node:path'
import { arquivoDaAta } from '@/lib/exports/projectDocumentsDocx'
import { buildAtaDocx } from '@/lib/exports/ataDocx'
import { parseDocumentCost } from '@/lib/documentCost'
import { charterChanges } from '@/lib/charterChanges'
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
  // Partes interessadas: o Word sai da própria folha da tela (lib/exports/folhaDocx, testado em folhaDocx.test.ts).
  // Termo: o Word também sai da própria folha (folhaDocx).
  it('ata mantém ações em três colunas e assinaturas vazias', async () => {
    const xml = await inspect('ata', buildAtaDocx({ instituicao: 'Faculdade', numero: 1, nomeProjeto: 'Operum', local: 'Campus', data: new Date('2026-10-05T12:00:00Z'), elaboradoPor: 'Autor', aprovadoPor: null, assuntosTratados: 'Planejamento\nDesenvolvimento', decisoesTomadas: 'Entregar a versão', observacoes: 'Próxima reunião', copiasPara: ['Equipe'], presentes: [{ nome: 'Integrante', setorEmpresa: 'Equipe' }], acoes: [{ acao: 'Entregar projeto', prazo: new Date('2026-11-01T12:00:00Z'), responsavel: 'Integrante' }], anexos: [{ nome: 'Plano de projeto', url: null }] }))
    expect(xml).toContain('Setor/Empresa'); expect(xml).toContain('Responsável'); expect(xml).toContain('________________________'); expect(xml.indexOf('II. Assuntos')).toBeLessThan(xml.indexOf('III. Decisões'))
  })
  it('ata segue o modelo: nº, "nome - função", caixas de cópia, sem o rodapé "©" do modelo', async () => {
    const xml = await inspect('ata-modelo', buildAtaDocx({ instituicao: 'Fatec Garça - Gestão - A definir - 1° Semestre 2025', numero: 3, nomeProjeto: 'Operum', local: 'Sala', data: new Date('2026-10-05T12:00:00Z'), elaboradoPor: 'Ana', elaboradoPorFuncao: 'Back-end', aprovadoPor: 'Bia', aprovadoPorFuncao: 'Gerente', assuntosTratados: '', decisoesTomadas: '', observacoes: '', copiasPara: ['Equipe', 'Plano do Projeto'], presentes: [], acoes: [], anexos: [] }))
    expect(xml).toContain('Ata de Reunião Nº 03')
    expect(xml).toContain('Ana - Back-end'); expect(xml).toContain('Bia - Gerente')
    expect(xml).toContain('Enviar cópias para:'); expect(xml).toContain('☒ Equipe'); expect(xml).toContain('☒ Plano do Projeto')
    expect(xml).toContain('Documentos anexos:'); expect(xml).toContain('Obs:')
    expect(xml).not.toContain('principais envolvidos')
    // O rodapé fica em outra parte do .docx: confere todas.
    const zip = await JSZip.loadAsync(await Packer.toBuffer(buildAtaDocx({ instituicao: '', numero: 1, nomeProjeto: 'P', local: null, data: null, elaboradoPor: null, aprovadoPor: null, assuntosTratados: '', decisoesTomadas: '', observacoes: '', copiasPara: [], presentes: [], acoes: [], anexos: [] })))
    const partes = await Promise.all(Object.values(zip.files).filter(f => f.name.endsWith('.xml')).map(f => f.async('string')))
    expect(partes.join('\n')).not.toContain('01_Form')
  })
})

describe('nome do arquivo da Ata', () => {
  it('número com dois dígitos e o nome do projeto sem acentos', () => {
    expect(arquivoDaAta(3, 'App Horta Comunitária')).toBe('ata-03-app-horta-comunitaria.docx')
    expect(arquivoDaAta(12, '')).toBe('ata-12.docx')
  })
})
