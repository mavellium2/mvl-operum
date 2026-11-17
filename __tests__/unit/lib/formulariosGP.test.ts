import { describe, it, expect } from 'vitest'
import { tipoDocumento, validarDocumento, validarRecurso } from '@/lib/validation/documentRevisionSchemas'

describe('formulários de GP como documentos versionados', () => {
  it('ESCOPO e LICOES são documentos únicos (sem resourceId)', () => {
    for (const t of ['ESCOPO', 'LICOES'] as const) {
      expect(tipoDocumento.parse(t)).toBe(t)
      expect(() => validarRecurso(t, 'x')).toThrow()
      expect(() => validarRecurso(t, '', true)).not.toThrow()
    }
  })

  it('RISCOS é um documento por risco, como a ATA: gravar exige o id do risco', () => {
    expect(tipoDocumento.parse('RISCOS')).toBe('RISCOS')
    expect(() => validarRecurso('RISCOS', 'r1', true)).not.toThrow()
    expect(() => validarRecurso('RISCOS', '')).not.toThrow()
    expect(() => validarRecurso('RISCOS', '', true)).toThrow('Identificação do risco obrigatória')
  })

  it('Declaração do Escopo: cabeçalho e seções; recusa campo desconhecido', () => {
    const escopo = { cabecalho: { elaboradoPor: 'João', elaboradoPorUserId: 'u1', funcao: 'Dev', versao: '1.0', dataAprovacao: '2026-04-07' }, justificativa: 'J', ligacoes: 'Nenhuma' }
    expect(validarDocumento('ESCOPO', escopo)).toEqual(escopo)
    expect(() => validarDocumento('ESCOPO', { extra: 'x' })).toThrow()
  })

  it('Risco: um formulário por documento, escala de 1 a 5', () => {
    const risco = { cabecalho: { elaboradoPor: 'Enzo' }, denominacao: 'Dependência', impacto: 4, probabilidade: 2, impactoReavaliado: 3, respostasNaWbs: true }
    expect(validarDocumento('RISCOS', risco)).toEqual(risco)
    expect(() => validarDocumento('RISCOS', { impacto: 6 })).toThrow()
    expect(() => validarDocumento('RISCOS', { riscos: [] })).toThrow()
  })

  it('Lições aprendidas: aspectos 1 a 13 (Sim/Não) e perguntas 14 a 17', () => {
    const licoes = { cabecalho: {}, aspectos: { a1: { sim: true, comentario: 'ok' }, a13: { sim: null } }, perguntas: { p14: 'Igual', p17: 'Planejar' } }
    expect(validarDocumento('LICOES', licoes)).toEqual(licoes)
    expect(() => validarDocumento('LICOES', { aspectos: { a14: { sim: true } } })).toThrow()
    expect(() => validarDocumento('LICOES', { perguntas: { p1: 'x' } })).toThrow()
  })
})
