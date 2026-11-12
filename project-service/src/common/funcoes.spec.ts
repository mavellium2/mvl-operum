// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { erroNomeDeFuncao, funcaoKey, nomesDeFuncoes } from './funcoes'

describe('funções na API (MCP e cadastro)', () => {
  it('entrada em lista ou texto antigo vira nomes de funções distintas', () => {
    expect(nomesDeFuncoes('Tech Lead | Full-stack')).toEqual(['Tech Lead', 'Full-stack'])
    expect(nomesDeFuncoes(['Redatora', 'redatoras', 'QA'])).toEqual(['Redatora', 'QA'])
    expect(nomesDeFuncoes(null)).toEqual([])
  })
  it('equivalência igual à do monolito (acento, caixa, plural)', () => {
    expect(funcaoKey('Gerente de Projetos')).toBe(funcaoKey('gerente de projéto'))
  })
  it('cadastro recusa nome com mais de uma função', () => {
    expect(erroNomeDeFuncao('Desenvolvedora Front-End | Redatora')).toMatch(/Uma função por vez/)
    expect(erroNomeDeFuncao('Desenvolvedora Front-End')).toBeNull()
  })
})
