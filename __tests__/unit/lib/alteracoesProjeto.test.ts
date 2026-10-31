import { describe, it, expect } from 'vitest'
import { desfazerAlteracao, listarAlteracoes, type FaseForm, type FormProjeto } from '@/lib/alteracoesProjeto'

const form = (over: Partial<FormProjeto> = {}): FormProjeto => ({
  name: 'Operum', slogan: '', startDate: '', endDate: '2026-11-16', location: 'Fatec', logoUrl: '', initialMemberId: 'u1',
  justificativa: 'Texto antigo', objetivos: '', metodologia: '', descricaoProduto: '', premissas: '', restricoes: '', limitesAutoridade: '',
  semestre: '2', termo: '5', turno: 'Noturno', ano: '2026', anoAms: '', departamentos: ['ADS'], ...over,
})
const fase = (chave: string, over: Partial<FaseForm> = {}): FaseForm => ({ chave, fase: 'Escopo', dataLimite: '2026-09-25', custo: '83,34', ...over })
const nomes = (id: string) => ({ u1: 'Ana', u2: 'Bia' } as Record<string, string>)[id] ?? id

describe('listarAlteracoes', () => {
  it('lista só o que mudou, com valores legíveis', () => {
    const salvo = { form: form(), fases: [fase('a'), fase('b', { fase: 'Tecnologia' })] }
    const atual = {
      form: form({ endDate: '2026-11-30', initialMemberId: 'u2', justificativa: 'Texto novo', semestre: '1', departamentos: ['ADS', 'GE'] }),
      fases: [fase('a', { custo: '100,00' }), fase('c', { fase: 'Homologação', dataLimite: '' })],
    }
    const lista = listarAlteracoes(salvo, atual, nomes)
    const por = (r: string) => lista.find(a => a.rotulo === r)
    expect(por('Fim previsto')).toMatchObject({ antes: '16/11/2026', depois: '30/11/2026', texto: false })
    expect(por('Gerente do projeto')).toMatchObject({ antes: 'Ana', depois: 'Bia' })
    expect(por('Justificativa do Projeto')).toMatchObject({ texto: true })
    expect(por('Período')).toMatchObject({ antes: '2º Semestre', depois: '1º Semestre' })
    expect(por('Departamentos')).toMatchObject({ antes: 'ADS', depois: 'ADS, GE' })
    expect(por('Fase 1.1')).toMatchObject({ antes: 'Escopo · 25/09/2026 · R$ 83,34', depois: 'Escopo · 25/09/2026 · R$ 100,00' })
    expect(por('Fase 1.2 incluída')).toMatchObject({ depois: 'Homologação · sem prazo · R$ 83,34' })
    expect(por('Fase 1.2 removida')).toMatchObject({ antes: 'Tecnologia · 25/09/2026 · R$ 83,34' })
    expect(lista).toHaveLength(8)
  })
  it('sem diferença, lista vazia', () => {
    expect(listarAlteracoes({ form: form(), fases: [fase('a')] }, { form: form(), fases: [fase('a')] })).toEqual([])
  })
})

describe('desfazerAlteracao', () => {
  const salvo = { form: form(), fases: [fase('a'), fase('b')] }
  it('volta um campo ao valor salvo', () => {
    const r = desfazerAlteracao('endDate', salvo, { form: form({ endDate: '2026-12-01', name: 'Outro' }), fases: salvo.fases })
    expect(r.form).toMatchObject({ endDate: '2026-11-16', name: 'Outro' })
  })
  it('fase alterada volta, incluída sai e removida volta na posição', () => {
    expect(desfazerAlteracao('fase:a', salvo, { form: form(), fases: [fase('a', { custo: '1' }), fase('b')] }).fases[0].custo).toBe('83,34')
    expect(desfazerAlteracao('fase:n', salvo, { form: form(), fases: [...salvo.fases, fase('n')] }).fases.map(f => f.chave)).toEqual(['a', 'b'])
    expect(desfazerAlteracao('fase:a', salvo, { form: form(), fases: [fase('b')] }).fases.map(f => f.chave)).toEqual(['a', 'b'])
  })
})
