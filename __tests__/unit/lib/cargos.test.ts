import { describe, it, expect } from 'vitest'
import { cargoNoProjeto } from '@/lib/cargos'

describe('cargoNoProjeto', () => {
  it('mostra as funções do projeto, uma após a outra, sem vazios', () => {
    expect(cargoNoProjeto([' Analista ', '', 'Gerente de Projeto'], 'Educador')).toBe('Analista, Gerente de Projeto')
  })

  it('sem função no projeto, cai no cargo global', () => {
    expect(cargoNoProjeto([], 'Educador')).toBe('Educador')
    expect(cargoNoProjeto(null, 'Educador')).toBe('Educador')
  })

  it('sem nenhum dos dois, null', () => {
    expect(cargoNoProjeto(null, null)).toBeNull()
    expect(cargoNoProjeto([' '], ' ')).toBeNull()
  })
})
