import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Packer } from 'docx'
import { buildCapaDocx } from '@/lib/exports/capaDocx'
import { CAPA, layoutCapa, linhaEmail } from '@/lib/capaLayout'
import { capaPadrao } from '@/lib/capaPadrao'

const testRequire = createRequire(import.meta.url)
const JSZip = createRequire(testRequire.resolve('docx'))('jszip')
const cabecalho = new Uint8Array(readFileSync('public/documentos/cabecalho-fatec-cps-sp.png'))
const capa = { ...capaPadrao({ semestre: '2', ano: 2026, principaisEnvolvidos: '## Disciplina\nGestão de Projetos\n## Professor\n- Prof. Esp. Fábio Rodrigues Gonçalves\n' }), email: 'buddyy@gmail.com' }
const integrantes = ['Marcus Vinicius de Castro Henseler Damaceno', 'Matheus Medeiros de Souza']

async function xml(doc: ReturnType<typeof buildCapaDocx>) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
  return zip.file('word/document.xml').async('string') as Promise<string>
}

describe('layout da Capa (mesmas posições da folha do sistema)', () => {
  // Medidas tiradas da folha renderizada no Chrome (mm a partir do topo).
  it('reproduz as posições medidas no navegador', () => {
    const itens = layoutCapa(capa, integrantes.length)
    const topo = (c: string) => itens.find(i => i.campo === c || i.tipo === c)!.topo
    expect(topo('instituicao')).toBeCloseTo(41.58, 1)
    expect(topo('curso')).toBeCloseTo(55.48, 1)
    expect(topo('disciplina')).toBeCloseTo(69.83, 1)
    expect(topo('professor')).toBeCloseTo(76.18, 1)
    expect(topo('integrantes')).toBeCloseTo(227.29, 1)
    expect(topo('endereco')).toBeCloseTo(263.84, 1)
    expect(topo('email')).toBeCloseTo(269.74, 1)
    expect(topo('periodo')).toBeCloseTo(281.65, 1)
    const logo = itens.find(i => i.tipo === 'logo')!
    expect(logo.topo + (logo.altura - CAPA.logo.caixa) / 2).toBeCloseTo(117.41, 1)
  })
  it('e-mail: "E-mails:" e o endereço centralizados juntos, como na tela', () => {
    expect(linhaEmail('buddyy@gmail.com').texto - CAPA.padding.x).toBeCloseTo(91.9, 1)
  })
  it('usa as linhas medidas na folha quando informadas', () => {
    const uma = layoutCapa(capa, 2).find(i => i.campo === 'curso')!
    const duas = layoutCapa(capa, 2, { curso: 2 }).find(i => i.campo === 'curso')!
    expect(duas.altura - uma.altura).toBeCloseTo(15 * 25.4 / 72, 2)
  })
})

describe('Word da Capa', () => {
  it('tem os textos da folha, banner, linha e logo, em uma página A4', async () => {
    const doc = await xml(buildCapaDocx({ capa, nomeProjeto: 'Buddy', integrantes }, { cabecalho, logo: cabecalho }))
    for (const t of ['Faculdade de Tecnologia de Garça Deputado Júlio Julinho Marcondes de Moura”', 'CURSO SUPERIOR DE...', 'Gestão de Projetos',
      'Prof. Esp. Fábio Rodrigues Gonçalves', 'Integrantes (Membro da Equipe)', ...integrantes,
      'Av. Presidente Vargas, 2331 – 17404-500 – Garça/SP – Tel.: (14) 3588-1800', 'E-mails:', 'buddyy@gmail.com', '2026 / 2']) {
      expect(doc).toContain(t)
    }
    expect(doc.match(/<wp:anchor/g)).toHaveLength(3)
    expect(doc).toContain('w:w="11906"')
    expect(doc).toContain('w:color w:val="C00000"')
  })
  it('sem logo mostra o nome do projeto e "Nenhum membro" quando não há integrantes', async () => {
    const doc = await xml(buildCapaDocx({ capa: { ...capa, email: '' }, nomeProjeto: 'Projeto X', integrantes: [] }, { cabecalho, logo: null }))
    expect(doc).toContain('Projeto X')
    expect(doc).toContain('Nenhum membro ativo no projeto.')
    expect(doc).not.toContain('E-mails:')
    expect(doc.match(/<wp:anchor/g)).toHaveLength(2)
  })
})
