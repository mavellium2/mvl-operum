import { describe, it, expect } from 'vitest'
import { comunicacaoDaEstrategia } from '@/lib/canvasEstrategia'

describe('comunicacaoDaEstrategia: só as partes que falam de comunicação', () => {
  it('item de 1º nível com os subitens recuados', () => {
    const t = '- Trabalhar em equipe;\n- Os canais de comunicação serão:\n   -  E-mail institucional;\n    - WhatsApp;\n- Parceria com os alunos.'
    expect(comunicacaoDaEstrategia(t)).toBe('- Os canais de comunicação serão:\n   -  E-mail institucional;\n    - WhatsApp;')
  })
  it('vários itens, sem acento e com continuação de linha', () => {
    const t = '- Comunicacao semanal por reunião\n- Outro assunto\n  - subitem sobre canais\n- Divulgação\ncontinua: canais oficiais'
    expect(comunicacaoDaEstrategia(t)).toBe('- Comunicacao semanal por reunião\n- Divulgação\ncontinua: canais oficiais')
  })
  it('não pega menção só em subitem nem reuniões sem a palavra', () => {
    expect(comunicacaoDaEstrategia('- Reuniões semanais pelo Teams\n  - comunicação interna\n- Atas')).toBe('')
  })
  it('sem comunicação ou vazio: vazio', () => {
    expect(comunicacaoDaEstrategia('- Trabalhar em equipe;\n- Aquisição de matéria prima')).toBe('')
    expect(comunicacaoDaEstrategia('')).toBe('')
  })
  it('mantém a formatação (negrito) do trecho copiado', () => {
    const t = '<p><b>- Os canais de comunicação serão:</b></p><p>    - WhatsApp;</p><p>- Outro</p>'
    expect(comunicacaoDaEstrategia(t)).toBe('<p><b>- Os canais de comunicação serão:</b></p><p>    - WhatsApp;</p>')
  })
})
