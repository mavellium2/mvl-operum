import { describe, expect, it } from 'vitest'
import { validarDocumento, validarEap, validarRecurso } from '@/lib/validation/documentRevisionSchemas'

describe('validação dos snapshots', () => {
  it('Termo recusa campos capazes de alterar projeto/tenant', () => {
    expect(() => validarDocumento('CHARTER', { name: 'Outro', tenantId: 'outro' })).toThrow()
  })
  it('Termo aceita a função (papel) dos integrantes no contexto do documento', () => {
    const payload = { documentContext: { nomeProjeto: 'P', gerenteProjeto: 'G', membros: [{ name: 'Ana', papel: 'Back-end' }, { name: 'Bia' }] } }
    expect(() => validarDocumento('CHARTER', payload)).not.toThrow()
    expect(() => validarDocumento('CHARTER', { documentContext: { ...payload.documentContext, membros: [{ name: 'Ana', tenantId: 'x' }] } })).toThrow()
  })
  it('somente atas têm identificador de recurso', () => {
    expect(() => validarRecurso('CHARTER', 'ata1', true)).toThrow()
    expect(() => validarRecurso('ATA', '', true)).toThrow()
    expect(() => validarRecurso('ATA', 'ata1', true)).not.toThrow()
  })
  it('EAP valida e recalcula códigos de todos os descendentes', () => {
    const result = validarEap({ nodes: [{ id: 'r', title: 'Raiz', code: 'forjado', children: [{ id: 'c', title: 'Filho', parentId: 'forjado', code: '999', children: [] }] }] })
    expect(result.nodes).toMatchObject([{ code: '1', parentId: null, children: [{ code: '1.1', parentId: 'r' }] }])
  })
  it('recusa descendente inválido, ID repetido e múltiplas raízes', () => {
    expect(() => validarEap({ nodes: [{ id: 'r', children: [{ id: 12 }] }] })).toThrow()
    expect(() => validarEap({ nodes: [{ id: 'r', children: [{ id: 'r' }] }] })).toThrow(/únicos/)
    expect(() => validarEap({ nodes: [{ id: 'a' }, { id: 'b' }] })).toThrow()
  })
  it('limita profundidade antes de percorrer a árvore recursivamente', () => {
    let node: unknown = { id: 'leaf', children: [] }
    for (let depth = 0; depth < 25; depth++) node = { id: `n${depth}`, children: [node] }
    expect(() => validarEap({ nodes: [node] })).toThrow(/Profundidade/)
  })
  it('limita o total, incluindo filhos que não estão no array de raízes', () => {
    expect(() => validarEap({ nodes: [{ id: 'r', children: Array.from({ length: 5000 }, (_, i) => ({ id: `c${i}`, children: [] })) }] })).toThrow(/5000/)
  })
  it('snapshot de ata exige data e autor e não aceita IDs como conteúdo derivado', () => {
    expect(() => validarDocumento('ATA', { data: 'inválida', elaboradoPor: '' })).toThrow()
    expect(validarDocumento('ATA', { data: '2026-10-04T12:00:00.000Z', elaboradoPor: 'Membro', tenantId: 'forjado' })).not.toHaveProperty('tenantId')
  })
  it('avaliação de R.H. tem um recurso por integrante e rodada', () => {
    expect(() => validarRecurso('AVALIACAO_RH', '', true)).toThrow(/avaliação/)
    expect(() => validarRecurso('AVALIACAO_RH', 'rh:3:u1', true)).toThrow(/inválida/)
    expect(() => validarRecurso('AVALIACAO_RH', 'rh:1:u1', true)).not.toThrow()
    expect(() => validarRecurso('AVALIACAO_RH', 'rh:2:u1', false)).not.toThrow()
  })
  it('avaliação de R.H. aceita os critérios do modelo e recusa conceito, rodada ou critério fora dele', () => {
    const valida = { integranteId: 'u1', integrante: 'Ana', rodada: 1, criterios: { pontualidade: 'BOM', iniciativa: null } }
    expect(validarDocumento('AVALIACAO_RH', valida)).toMatchObject({ integranteId: 'u1', rodada: 1 })
    expect(() => validarDocumento('AVALIACAO_RH', { ...valida, rodada: 3 })).toThrow()
    expect(() => validarDocumento('AVALIACAO_RH', { ...valida, criterios: { pontualidade: 'EXCELENTE' } })).toThrow()
    expect(() => validarDocumento('AVALIACAO_RH', { ...valida, criterios: { criterioInexistente: 'BOM' } })).toThrow()
  })
})
