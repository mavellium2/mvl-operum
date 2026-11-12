import { describe, expect, it } from 'vitest'
import { ehFuncaoDeGerente, erroNomeDeFuncao, separarFuncoes, textoDeFuncoes } from '@/lib/funcoes'

describe('funções de uma pessoa', () => {
  it('texto composto vira funções separadas', () => {
    expect(separarFuncoes('Desenvolvedora Front-End | Redatora')).toEqual(['Desenvolvedora Front-End', 'Redatora'])
    expect(separarFuncoes(['Tech Lead | Full-stack', 'QA; Back-end'])).toEqual(['Tech Lead', 'Full-stack', 'QA', 'Back-end'])
  })
  it('não separa hífen nem barra de nomes de uma função só', () => {
    expect(separarFuncoes('UI/UX Designer')).toEqual(['UI/UX Designer'])
    expect(separarFuncoes('Front-End')).toEqual(['Front-End'])
  })
  it('tira equivalentes repetidas (acento, caixa, plural)', () => {
    expect(separarFuncoes(['Gerente de Projeto', 'gerente de projetos', 'Redatora', 'redatora'])).toEqual(['Gerente de Projeto', 'Redatora'])
    expect(textoDeFuncoes('A | B, a')).toBe('A, B')
  })
  it('o cadastro aceita uma função por vez', () => {
    expect(erroNomeDeFuncao('Tech Lead | Full-stack')).toMatch(/Uma função por vez.*"Tech Lead" e "Full-stack"/)
    expect(erroNomeDeFuncao('Tech Lead')).toBeNull()
    expect(erroNomeDeFuncao('  ')).toBe('Informe o nome da função.')
  })
  it('"Gerente de Projetos" é o papel de gerente', () => {
    expect(ehFuncaoDeGerente('Gerente de Projetos')).toBe(true)
    expect(ehFuncaoDeGerente('Gerente de Contas')).toBe(false)
  })
})
