import { describe, it, expect } from 'vitest'
import { tipoDocumento, validarDocumento, validarRecurso } from '@/lib/validation/documentRevisionSchemas'

describe('formulários de GP como documentos versionados', () => {
  it('ESCOPO, RISCOS e LICOES são tipos de documento sem resourceId', () => {
    for (const t of ['ESCOPO', 'RISCOS', 'LICOES'] as const) {
      expect(tipoDocumento.parse(t)).toBe(t)
      expect(() => validarRecurso(t, 'x')).toThrow()
      expect(() => validarRecurso(t, '', true)).not.toThrow()
    }
  })

  it('Declaração do Escopo: cabeçalho e seções; recusa campo desconhecido', () => {
    const escopo = { cabecalho: { elaboradoPor: 'João', elaboradoPorUserId: 'u1', funcao: 'Dev', versao: '1.0', dataAprovacao: '2026-04-07' }, justificativa: 'J', ligacoes: 'Nenhuma' }
    expect(validarDocumento('ESCOPO', escopo)).toEqual(escopo)
    expect(() => validarDocumento('ESCOPO', { extra: 'x' })).toThrow()
  })

  it('Riscos: vários formulários, escala de 1 a 5', () => {
    const riscos = { riscos: [{ id: 'a', numero: '01', impacto: 4, probabilidade: 2, impactoReavaliado: 3, respostasNaWbs: true }, { id: 'b' }] }
    expect(validarDocumento('RISCOS', riscos)).toEqual(riscos)
    expect(() => validarDocumento('RISCOS', { riscos: [{ id: 'a', impacto: 6 }] })).toThrow()
    expect(() => validarDocumento('RISCOS', { riscos: [{ id: '' }] })).toThrow()
    expect(() => validarDocumento('RISCOS', { riscos: Array.from({ length: 101 }, (_, i) => ({ id: `r${i}` })) })).toThrow()
  })

  it('Lições aprendidas: aspectos 1 a 13 (Sim/Não) e perguntas 14 a 17', () => {
    const licoes = { cabecalho: {}, aspectos: { a1: { sim: true, comentario: 'ok' }, a13: { sim: null } }, perguntas: { p14: 'Igual', p17: 'Planejar' } }
    expect(validarDocumento('LICOES', licoes)).toEqual(licoes)
    expect(() => validarDocumento('LICOES', { aspectos: { a14: { sim: true } } })).toThrow()
    expect(() => validarDocumento('LICOES', { perguntas: { p1: 'x' } })).toThrow()
  })
})
