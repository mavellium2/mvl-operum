import { describe, expect, it } from 'vitest'
import { alteracoesCapa, capaPadrao, conteudoCapa, CURSO_PADRAO, ENDERECO_PADRAO, INSTITUICAO_PADRAO, periodoCapa } from '@/lib/capaPadrao'

const hoje = new Date(2026, 10, 11)

describe('valores da Capa vindos do sistema', () => {
  it('traz os textos do modelo e professor/disciplina do Termo', () => {
    const padrao = capaPadrao({
      semestre: '2', ano: 2026, hoje,
      principaisEnvolvidos: '## Disciplina\nGestão de Projetos\n## Professor\n- Prof. Esp. Fábio Rodrigues Gonçalves\n## Integrantes do Grupo\n',
    })
    expect(padrao).toEqual({
      instituicao: INSTITUICAO_PADRAO, curso: CURSO_PADRAO, disciplina: 'Gestão de Projetos',
      professor: 'Prof. Esp. Fábio Rodrigues Gonçalves', endereco: ENDERECO_PADRAO, email: '', periodo: '2026 / 2',
    })
    expect(padrao.instituicao).toBe('Faculdade de Tecnologia de Garça Deputado Júlio Julinho Marcondes de Moura”')
    expect(padrao.curso.startsWith('CURSO SUPERIOR DE TECNOLOGIA EM')).toBe(true)
    expect(padrao.endereco).toBe('Av. Presidente Vargas, 2331 – 17404-500 – Garça/SP – Tel.: (14) 3588-1800')
  })
  it('período anual mostra só o ano; sem ano no projeto usa o ano atual', () => {
    expect(periodoCapa('ano', 2026)).toBe('2026')
    expect(periodoCapa('1', null, hoje)).toBe('2026 / 1')
    expect(periodoCapa(null, null, hoje)).toBe('2026')
  })
  it('o conteúdo salvo vale sobre o do sistema, inclusive vazio', () => {
    const padrao = capaPadrao({ semestre: '1', ano: 2026 })
    expect(conteudoCapa(padrao, { periodo: '2026 / 1 (rev.)', email: '' })).toMatchObject({ periodo: '2026 / 1 (rev.)', email: '' })
    expect(conteudoCapa(padrao, null).periodo).toBe('2026 / 1')
  })
  it('o rascunho guarda só os campos trocados', () => {
    const padrao = capaPadrao({ semestre: '2', ano: 2026 })
    expect(alteracoesCapa({ ...padrao, professor: 'Prof. X', endereco: '' }, padrao)).toEqual({ professor: 'Prof. X', endereco: '' })
    expect(alteracoesCapa(padrao, padrao)).toEqual({})
  })
})
