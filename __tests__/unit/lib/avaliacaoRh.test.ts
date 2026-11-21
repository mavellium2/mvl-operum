import { describe, expect, it } from 'vitest'
import { CRITERIOS_RH, IDS_CRITERIOS_RH, lerRecursoAvaliacaoRh, recursoAvaliacaoRh } from '@/lib/avaliacaoRh'

describe('Avaliação de R.H. — catálogo do modelo', () => {
  it('tem os 12 critérios do modelo, na ordem e com as frases preservadas', () => {
    expect(CRITERIOS_RH).toHaveLength(12)
    expect(IDS_CRITERIOS_RH).toHaveLength(12)
    expect(new Set(IDS_CRITERIOS_RH).size).toBe(12)
    expect(CRITERIOS_RH[0]).toMatchObject({ id: 'pontualidade', recuoFrases: 'maior' })
    expect(CRITERIOS_RH[0].frases).toHaveLength(4)
    expect(CRITERIOS_RH.find(c => c.id === 'responsabilidade')?.frases).toHaveLength(5)
    expect(CRITERIOS_RH.find(c => c.id === 'produtividade')?.frases.at(-1)).toBe('')
  })

  it('identifica cada avaliação por rodada e integrante', () => {
    expect(recursoAvaliacaoRh(1, 'u1')).toBe('rh:1:u1')
    expect(recursoAvaliacaoRh(2, 'abc_DEF-3')).toBe('rh:2:abc_DEF-3')
    expect(lerRecursoAvaliacaoRh('rh:1:u1')).toEqual({ rodada: 1, integranteId: 'u1' })
    expect(lerRecursoAvaliacaoRh('rh:2:abc_DEF-3')).toEqual({ rodada: 2, integranteId: 'abc_DEF-3' })
  })

  it('recusa rodada, separador ou identificador fora do padrão', () => {
    for (const invalido of ['', 'rh:0:u1', 'rh:3:u1', 'rh:1:', 'rh:1:u 1', 'rh:1:u1:x', 'RH:1:u1', 'u1']) {
      expect(lerRecursoAvaliacaoRh(invalido)).toBeNull()
    }
  })
})
