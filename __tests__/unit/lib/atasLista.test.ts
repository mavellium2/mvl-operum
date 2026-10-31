import { describe, it, expect } from 'vitest'
import { filtrarAtas, resumoDaAta, statusPorAta, type AtaListItem } from '@/lib/atasLista'

const d = (s: string) => new Date(`${s}T00:00:00Z`)

describe('resumoDaAta', () => {
  it('primeiro assunto preenchido, contagens e ações com prazo vencido', () => {
    const r = resumoDaAta({
      id: 'a1', numero: 3, data: d('2026-09-14'), createdAt: d('2026-09-15'), elaboradoPor: 'Ana', local: 'Lab 3',
      assuntosTratados: '\n  Revisão da sprint;\nOutro assunto', presentes: [{ nome: 'Ana' }, { nome: ' ' }, { nome: 'Bia' }],
      acoes: [{ prazo: d('2026-10-30') }, { prazo: d('2026-10-31') }, { prazo: null }, { prazo: d('2026-11-02') }], anexos: [1, 2],
    }, d('2026-10-31'))
    expect(r).toMatchObject({ assunto: 'Revisão da sprint', presentes: ['Ana', 'Bia'], acoes: 4, acoesVencidas: 1, anexos: 2, data: '2026-09-14T00:00:00.000Z' })
  })

  it('sem data da reunião usa a criação; sem assuntos fica vazio', () => {
    const r = resumoDaAta({ id: 'a', numero: 1, data: null, createdAt: d('2026-01-02'), elaboradoPor: null, local: null, assuntosTratados: null, presentes: [], acoes: [], anexos: [] })
    expect(r).toMatchObject({ data: '2026-01-02T00:00:00.000Z', assunto: '', elaboradoPor: '' })
  })
})

describe('statusPorAta', () => {
  it('usa a versão mais recente de cada ata', () => {
    expect(statusPorAta([
      { resourceId: 'a1', status: 'APPROVED', createdAt: '2026-01-01T00:00:00Z' },
      { resourceId: 'a1', status: 'PENDING', createdAt: '2026-02-01T00:00:00Z' },
      { resourceId: 'a2', status: 'REJECTED', createdAt: '2026-01-01T00:00:00Z' },
      { resourceId: '', status: 'PENDING', createdAt: '2026-03-01T00:00:00Z' },
    ])).toEqual({ a1: 'PENDING', a2: 'REJECTED' })
  })
})

describe('filtrarAtas', () => {
  const ata = (over: Partial<AtaListItem>): AtaListItem => ({ id: 'x', numero: 1, data: '', elaboradoPor: 'Ana', local: null, assunto: '', presentes: [], acoes: 0, acoesVencidas: 0, anexos: 0, ...over })
  const atas = [
    ata({ id: 'a1', numero: 1, assunto: 'Definição da arquitetura', presentes: ['Bia Souza'] }),
    ata({ id: 'a2', numero: 12, local: 'Sala Ômega', acoesVencidas: 2 }),
  ]
  it('busca por assunto (sem acento), pessoa, local e número', () => {
    expect(filtrarAtas(atas, 'definicao', 'todas', {}).map(a => a.id)).toEqual(['a1'])
    expect(filtrarAtas(atas, 'bia', 'todas', {}).map(a => a.id)).toEqual(['a1'])
    expect(filtrarAtas(atas, 'omega', 'todas', {}).map(a => a.id)).toEqual(['a2'])
    expect(filtrarAtas(atas, 'nº 12', 'todas', {}).map(a => a.id)).toEqual(['a2'])
    expect(filtrarAtas(atas, '1', 'todas', {}).map(a => a.id)).toEqual(['a1'])
  })
  it('filtros rápidos', () => {
    expect(filtrarAtas(atas, '', 'pendentes', { a2: 'PENDING' }).map(a => a.id)).toEqual(['a2'])
    expect(filtrarAtas(atas, '', 'vencidas', {}).map(a => a.id)).toEqual(['a2'])
  })
})
