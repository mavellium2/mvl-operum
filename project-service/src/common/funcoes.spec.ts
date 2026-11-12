// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { erroNomeDeFuncao, textoDeFuncoes } from './funcoes'

describe('funções na API (MCP e cadastro)', () => {
  it('papel em texto livre grava funções separadas por vírgula', () => {
    expect(textoDeFuncoes('Tech Lead | Full-stack')).toBe('Tech Lead, Full-stack')
    expect(textoDeFuncoes('Redatora; redatora , QA')).toBe('Redatora, QA')
    expect(textoDeFuncoes(null)).toBeNull()
  })
  it('cadastro recusa nome com mais de uma função', () => {
    expect(erroNomeDeFuncao('Desenvolvedora Front-End | Redatora')).toMatch(/Uma função por vez/)
    expect(erroNomeDeFuncao('Desenvolvedora Front-End')).toBeNull()
  })
})
