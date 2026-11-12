import { describe, expect, it } from 'vitest'
import { gravarRecentes, lerRecentes, MAX_RECENTES, recentProjectKey, registrarRecente } from '@/lib/recentProject'

describe('projetos recentes do usuário', () => {
  it('cada abertura leva o projeto para o início e mantém a ordem dos demais', () => {
    // Lista inicial (ordem de criação): Janus, Operum, Fechai — nenhum aberto ainda.
    let recentes: string[] = []
    recentes = registrarRecente(recentes, 'fechai')
    expect(recentes).toEqual(['fechai'])
    recentes = registrarRecente(recentes, 'janus')
    expect(recentes).toEqual(['janus', 'fechai'])
    recentes = registrarRecente(recentes, 'operum')
    expect(recentes).toEqual(['operum', 'janus', 'fechai'])
    recentes = registrarRecente(recentes, 'fechai')
    expect(recentes).toEqual(['fechai', 'operum', 'janus'])
  })
  it('lê o cookie antigo (um ID) e o novo (lista), sem repetidos nem IDs inválidos', () => {
    expect(lerRecentes('p1')).toEqual(['p1'])
    expect(lerRecentes(encodeURIComponent(gravarRecentes(['p2', 'p1'])))).toEqual(['p2', 'p1'])
    expect(lerRecentes('p2,p1,p2,<x>, p3')).toEqual(['p2', 'p1', 'p3'])
    expect(lerRecentes(undefined)).toEqual([])
  })
  it('guarda no máximo os 50 mais recentes', () => {
    let recentes: string[] = []
    for (let i = 0; i < 60; i++) recentes = registrarRecente(recentes, `p${i}`)
    expect(recentes).toHaveLength(MAX_RECENTES)
    expect(recentes[0]).toBe('p59')
  })
  it('a lista é de cada usuário em cada instituição', () => {
    expect(recentProjectKey('u1', 't1')).not.toBe(recentProjectKey('u2', 't1'))
    expect(recentProjectKey('u1', 't1')).not.toBe(recentProjectKey('u1', 't2'))
  })
})
