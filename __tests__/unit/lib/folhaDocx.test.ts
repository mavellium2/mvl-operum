import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { Packer } from 'docx'
import { folhaParaDocx } from '@/lib/exports/folhaDocx'

const testRequire = createRequire(import.meta.url)
const JSZip = createRequire(testRequire.resolve('docx'))('jszip')

/**
 * O jsdom não calcula layout: cada elemento informa a própria caixa em `data-r`
 * ("left,top,width,height" em px) e o texto usa a caixa do elemento pai.
 * A comparação com a tela real (Chrome) foi feita fora dos testes, por PDF.
 */
const caixa = (el: Element | null): DOMRect => {
  const r = el?.closest?.('[data-r]')?.getAttribute('data-r')
  const [l, t, w, h] = (el?.getAttribute?.('data-r') ?? (el && !el.getAttribute('data-r') ? r : null) ?? '0,0,0,0').split(',').map(Number)
  return new DOMRect(l, t, w, h)
}

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { return caixa(this) })
  vi.spyOn(document, 'createRange').mockImplementation(() => {
    let alvo: Node | null = null
    const rect = () => caixa(alvo?.nodeType === Node.TEXT_NODE ? alvo.parentElement : alvo as Element)
    return {
      setStart: (n: Node) => { alvo = n }, setEnd: () => {}, selectNodeContents: (n: Node) => { alvo = n }, detach: () => {},
      getBoundingClientRect: rect, getClientRects: () => [rect()],
    } as unknown as Range
  })
})
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

// Folha A4 em pé a 96 dpi: 794 × 1123 px; margens de 38 px e rodapé de 34 px.
function montar() {
  document.body.innerHTML = `
    <div id="raiz">
      <div data-folha="" data-r="0,0,794,1123" style="padding: 38px 38px 34px; font-family: Arial">
        <h1 data-r="38,38,718,26" style="font-size: 20px; line-height: 26px; text-align: center; font-weight: bold">Formulário de Stakeholder</h1>
        <table data-r="38,80,718,40">
          <tr data-r="38,80,718,20">
            <td data-r="38,80,200,20" style="border: 1px solid #000; background-color: rgb(191, 191, 191); line-height: 15px; font-size: 12px"><strong>Projeto:</strong> Operum</td>
            <td data-r="238,80,518,20" style="border: 1px solid #000; line-height: 15px; font-size: 12px; color: rgb(185, 28, 28)">Inativo</td>
          </tr>
          <tr data-r="38,100,718,20">
            <td colspan="2" data-r="38,100,718,20" style="border: 1px solid #000; line-height: 15px; font-size: 12px; text-align: center">Linha inteira</td>
          </tr>
        </table>
        <div data-rodape-pagina="" data-r="38,1076,718,13" style="font: 8pt Arial; color: rgb(85, 85, 85)"><span></span><span>Página 1 de 1</span></div>
      </div>
    </div>`
  return document.getElementById('raiz')!
}

async function partes(doc: Awaited<ReturnType<typeof folhaParaDocx>>) {
  const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
  return { corpo: await zip.file('word/document.xml').async('string') as string, rodape: (await zip.file('word/footer1.xml')?.async('string') ?? '') as string }
}

describe('Word a partir da folha desenhada', () => {
  it('mantém página, margens, textos, estilos e rodapé com número de página', async () => {
    const { corpo, rodape } = await partes(await folhaParaDocx(montar(), 'Teste'))
    expect(corpo).toContain('w:w="11910"') // 794 px
    expect(corpo).toContain('w:left="570"') // margem de 38 px
    expect(corpo).toContain('Formulário de Stakeholder')
    expect(corpo).toContain('Projeto:')
    expect(corpo).toContain(' Operum')
    expect(corpo).toContain('w:fill="BFBFBF"')
    expect(corpo).toContain('w:color w:val="B91C1C"')
    expect(rodape).toContain('PAGE')
    expect(rodape).toContain('NUMPAGES')
    expect(rodape).toContain('Página ')
  })

  it('tabela com as colunas e as alturas de linha da tela', async () => {
    const { corpo } = await partes(await folhaParaDocx(montar(), 'Teste'))
    expect(corpo).toContain('<w:gridCol w:w="3000"/>') // 200 px
    expect(corpo).toContain('<w:gridCol w:w="7770"/>') // 518 px
    expect(corpo.match(/<w:trHeight w:val="300" w:hRule="exact"\/>/g)).toHaveLength(2) // 20 px
    expect(corpo).toContain('<w:gridSpan w:val="2"/>')
  })

  it('cada folha da tela começa uma página no Word', async () => {
    const raiz = montar()
    const segunda = raiz.querySelector('[data-folha]')!.cloneNode(true) as HTMLElement
    raiz.append(segunda)
    const { corpo } = await partes(await folhaParaDocx(raiz, 'Teste'))
    expect(corpo.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1)
  })
  it('campos posicionados (data-docx-moldura) viram molduras do Word na posição da tela, fora do fluxo da página', async () => {
    document.body.innerHTML = `
      <div id="raiz">
        <div data-folha="" data-r="0,0,1123,794" style="padding: 0; font-family: Arial">
          <div data-docx-moldura="" data-r="20,100,200,120" style="font-size: 12px; line-height: 15px"><div data-r="20,100,200,15">Esquerda</div><div data-r="20,115,200,15" style="padding-left: 0">    - subitem</div></div>
          <div data-docx-moldura="" data-r="300,100,200,120" style="font-size: 12px; line-height: 15px"><div data-r="300,100,200,15">Direita</div></div>
        </div>
      </div>`
    const { corpo } = await partes(await folhaParaDocx(document.getElementById('raiz')!, 'Canvas'))
    const molduras = [...corpo.matchAll(/<w:framePr [^>]*\/>/g)].map(m => m[0])
    expect(molduras.length).toBeGreaterThanOrEqual(2)
    expect(molduras[0]).toContain('w:x="300"') // 20 px
    expect(molduras[0]).toContain('w:y="1500"') // 100 px
    expect(molduras[0]).toContain('w:w="3000"') // 200 px
    expect(molduras[0]).toContain('w:hRule="exact"')
    expect(molduras.some(m => m.includes('w:x="4500"'))).toBe(true) // 300 px
    expect(corpo).toContain('Esquerda')
    expect(corpo).toContain('Direita')
  })
})
