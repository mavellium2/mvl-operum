import { describe, it, expect } from 'vitest'
import { linhaInstitucional, periodoDoProjeto, periodoEhSemestral, termoTurno, TERMO_A_DEFINIR } from '@/lib/linhaInstitucional'
import { ataCopias } from '@/lib/exports/ataDocx'

describe('linha institucional dos documentos', () => {
  it('Localização - Departamentos - termo - Período Ano (como no modelo)', () => {
    expect(linhaInstitucional({ location: 'Fatec Garça', departamentos: ['Gestão Empresarial'], semestre: '1', ano: 2025 }))
      .toBe(`Fatec Garça - Gestão Empresarial - ${TERMO_A_DEFINIR} - 1° Semestre 2025`)
  })
  it('omite o que não foi preenchido e junta vários departamentos', () => {
    expect(linhaInstitucional({ departamentos: ['ADS', 'AMS'], ano: 2026 })).toBe(`ADS / AMS - ${TERMO_A_DEFINIR} - 2026`)
    expect(periodoDoProjeto('2', 2026)).toBe('2° Semestre 2026')
    expect(periodoDoProjeto('ano', 2026)).toBe('2026')
  })
})

describe('termo/turno do projeto', () => {
  it('usa o termo e o turno cadastrados no lugar do aviso', () => {
    expect(linhaInstitucional({ location: 'Fatec Garça', departamentos: ['Gestão Empresarial'], semestre: '1', termo: '5', turno: 'Noturno', ano: 2025 }))
      .toBe('Fatec Garça - Gestão Empresarial - 5° termo Noturno - 1° Semestre 2025')
  })
  it('aceita só o termo ou só o turno', () => {
    expect(termoTurno('3', '')).toBe('3° termo')
    expect(termoTurno('', 'Matutino')).toBe('Matutino')
    expect(termoTurno('2° termo', 'Noturno')).toBe('2° termo Noturno')
  })
  it('projeto anual sem termo não mostra o aviso', () => {
    expect(linhaInstitucional({ location: 'Fatec', semestre: 'ano', ano: 2026 })).toBe('Fatec - 2026')
  })
  it('só períodos semestrais pedem termo/turno', () => {
    expect(periodoEhSemestral('1')).toBe(true)
    expect(periodoEhSemestral('2')).toBe(true)
    expect(periodoEhSemestral('ano')).toBe(false)
    expect(periodoEhSemestral('')).toBe(false)
    expect(periodoEhSemestral(null)).toBe(false)
  })
})

describe('caixas de "Enviar cópias para"', () => {
  it('grade de 4 colunas com o rótulo na 1ª célula e "Plano do Projeto" na última', () => {
    const caixas = ataCopias(['Equipe'])
    expect(caixas).toHaveLength(11)
    expect(caixas[0]).toEqual({ texto: 'Equipe', marcado: true })
    expect(caixas.at(-1)).toEqual({ texto: 'Plano do Projeto', marcado: false })
    expect((ataCopias(Array.from({ length: 12 }, (_, i) => `P${i}`)).length + 1) % 4).toBe(0)
  })
})
