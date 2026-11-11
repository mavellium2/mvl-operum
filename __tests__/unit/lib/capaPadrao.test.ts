import { describe, expect, it } from 'vitest'
import { capaPadrao, conteudoCapa, periodoCapa } from '@/lib/capaPadrao'

describe('valores da Capa vindos do sistema', () => {
  it('monta período, curso e professor/disciplina a partir do projeto e do Termo', () => {
    const padrao = capaPadrao({
      instituicao: ' Fatec Garça ', departamentos: ['ADS', ' '], semestre: '2', ano: 2026,
      principaisEnvolvidos: '## Disciplina\nGestão de Projetos\n## Professor\n- Prof. Esp. Fábio Rodrigues Gonçalves\n## Integrantes do Grupo\n',
    })
    expect(padrao).toEqual({
      instituicao: 'Fatec Garça', curso: 'ADS', disciplina: 'Gestão de Projetos',
      professor: 'Prof. Esp. Fábio Rodrigues Gonçalves', endereco: '', email: '', periodo: '2026 / 2',
    })
  })
  it('período anual mostra só o ano; sem ano fica vazio', () => {
    expect(periodoCapa('ano', 2026)).toBe('2026')
    expect(periodoCapa('1', null)).toBe('')
  })
  it('o conteúdo salvo vale sobre o do sistema, inclusive vazio', () => {
    const padrao = capaPadrao({ semestre: '1', ano: 2026 })
    expect(conteudoCapa(padrao, { periodo: '2026 / 1 (rev.)', email: '' })).toMatchObject({ periodo: '2026 / 1 (rev.)', email: '' })
    expect(conteudoCapa(padrao, null).periodo).toBe('2026 / 1')
  })
})
