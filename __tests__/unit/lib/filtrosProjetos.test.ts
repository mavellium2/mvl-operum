import { describe, it, expect } from 'vitest'
import { FILTROS_VAZIOS, filtrosAtivos, filtrosNaQuery, gravarFiltrosNoCookie, lerFiltrosDoCookie, normalizarFiltros, rotuloTermo } from '@/lib/filtrosProjetos'

describe('filtros de Meus projetos', () => {
  it('normaliza: descarta valores inválidos, repetidos e de tipo errado', () => {
    expect(normalizarFiltros({ anos: [2026, '2025', 99, 2026], departamentos: [' Gestão ', '', 3, 'Gestão'], turmas: ['2', '3'], termos: ['5'], turnos: ['Vespertino', 'Madrugada'], situacoes: ['ACTIVE', 'APAGADO'] }))
      .toEqual({ anos: [2026, 2025], departamentos: ['Gestão'], turmas: ['2'], termos: ['5'], turnos: ['Vespertino'], situacoes: ['ACTIVE'] })
    expect(normalizarFiltros(null)).toEqual(FILTROS_VAZIOS)
  })
  it('cookie: ida e volta; valor corrompido vira filtros vazios', () => {
    const filtros = { ...FILTROS_VAZIOS, departamentos: ['Gestão; Empresarial'], anos: [2026] }
    expect(lerFiltrosDoCookie(gravarFiltrosNoCookie(filtros))).toEqual(filtros)
    expect(lerFiltrosDoCookie('%7Bquebrado')).toEqual(FILTROS_VAZIOS)
  })
  it('query com parâmetros repetidos', () => {
    expect(filtrosNaQuery({ ...FILTROS_VAZIOS, anos: [2026, 2025], situacoes: ['ACTIVE'], departamentos: ['Gestão & TI'] }))
      .toBe('ano=2026&ano=2025&departamento=Gest%C3%A3o+%26+TI&status=ACTIVE')
  })
  it('conta os filtros com opção marcada e escreve o termo', () => {
    expect(filtrosAtivos({ ...FILTROS_VAZIOS, anos: [2026, 2025], turnos: ['Noturno'] })).toBe(2)
    expect(rotuloTermo('5')).toBe('5° termo')
    expect(rotuloTermo('5º termo')).toBe('5º termo')
  })
})
