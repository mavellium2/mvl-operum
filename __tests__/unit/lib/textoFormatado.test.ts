import { describe, it, expect } from 'vitest'
import { escreverTexto, fatiarTexto, lerTexto, substituirTexto, tamanhoSimples, textoSimples } from '@/lib/textoFormatado'

describe('texto com formatação dos documentos', () => {
  it('texto simples continua texto simples (documentos antigos não mudam)', () => {
    const v = 'Primeira linha\n\nTerceira <não é tag> & cia'
    expect(escreverTexto(lerTexto(v))).toBe(v)
    expect(textoSimples(v)).toBe(v)
  })

  it('negrito, itálico, sublinhado e alinhamento vão e voltam', () => {
    const doc = [{ a: 'center' as const, t: [{ s: 'Olá ' }, { s: 'mundo', b: true, u: true }] }, { t: [{ s: 'fim', i: true }] }]
    const v = escreverTexto(doc)
    expect(v).toBe('<p a="center">Olá <b><u>mundo</u></b></p><p><i>fim</i></p>')
    expect(lerTexto(v)).toEqual(doc)
    expect(textoSimples(v)).toBe('Olá mundo\nfim')
  })

  it('tags fora da lista e símbolos viram texto (nunca HTML)', () => {
    const v = '<p>a <script>x</script> &lt;b&gt; <img src=x onerror=1></p>'
    expect(textoSimples(v)).toBe('a <script>x</script> <b> <img src=x onerror=1>')
    expect(escreverTexto(lerTexto(v))).toBe('a <script>x</script> <b> <img src=x onerror=1>')
  })

  it('fatia e substitui pelas posições do texto simples, mantendo a formatação', () => {
    const doc = lerTexto('<p a="justify">abc<b>def</b></p><p a="center">ghi</p>')
    expect(tamanhoSimples(doc)).toBe(10)
    const meio = fatiarTexto(doc, 4, 9) // "ef\ngh"
    expect(textoSimples(escreverTexto(meio))).toBe('ef\ngh')
    expect(meio[0]).toEqual({ a: 'justify', t: [{ s: 'ef', b: true }] })
    expect(meio[1].a).toBe('center')
    // Editar o pedaço: troca "ef\ngh" por "EF" sublinhado, juntando os parágrafos.
    const novo = substituirTexto(doc, 4, 9, [{ a: 'right', t: [{ s: 'EF', u: true }] }])
    expect(textoSimples(escreverTexto(novo))).toBe('abcdEFi')
    expect(novo).toEqual([{ a: 'right', t: [{ s: 'abc' }, { s: 'd', b: true }, { s: 'EF', u: true }, { s: 'i' }] }])
  })

  it('pedaço vazio e posições nas pontas', () => {
    const doc = lerTexto('ab\ncd')
    expect(textoSimples(escreverTexto(fatiarTexto(doc, 0, 0)))).toBe('')
    expect(textoSimples(escreverTexto(fatiarTexto(doc, 0, 5)))).toBe('ab\ncd')
    expect(textoSimples(escreverTexto(substituirTexto(doc, 5, 5, lerTexto('!'))))).toBe('ab\ncd!')
    expect(textoSimples(escreverTexto(substituirTexto(doc, 0, 0, lerTexto('>'))))).toBe('>ab\ncd')
    expect(textoSimples(escreverTexto(substituirTexto(doc, 2, 3, lerTexto(''))))).toBe('abcd')
  })
})
