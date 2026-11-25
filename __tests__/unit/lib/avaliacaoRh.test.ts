import { describe, expect, it } from 'vitest'
import { CRITERIOS_RH, IDS_CRITERIOS_RH, lerRecursoAvaliacaoRh, listaRodadasRh, recursoAvaliacaoRh, rotuloRodadaRh, totalRodadasRh } from '@/lib/avaliacaoRh'

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
    expect(lerRecursoAvaliacaoRh('rh:3:u1')).toEqual({ rodada: 3, integranteId: 'u1' })
    expect(lerRecursoAvaliacaoRh('rh:10:u1')).toEqual({ rodada: 10, integranteId: 'u1' })
    for (const invalido of ['', 'rh:0:u1', 'rh:11:u1', 'rh:01:u1', 'rh:100:u1', 'rh:1:', 'rh:1:u 1', 'rh:1:u1:x', 'RH:1:u1', 'u1']) {
      expect(lerRecursoAvaliacaoRh(invalido)).toBeNull()
    }
  })

  it('rotula as rodadas: 1ª = AC, 2ª = AF, as seguintes sem sigla', () => {
    expect(rotuloRodadaRh(1)).toBe('1ª Avaliação (AC)')
    expect(rotuloRodadaRh(2)).toBe('2ª Avaliação (AF)')
    expect(rotuloRodadaRh(3)).toBe('3ª Avaliação')
  })

  it('total de rodadas: mínimo 2, cobre documentos existentes e respeita o limite', () => {
    expect(totalRodadasRh(undefined)).toBe(2)
    expect(totalRodadasRh(1)).toBe(2)
    expect(totalRodadasRh(3)).toBe(3)
    expect(totalRodadasRh(2, [1, 4])).toBe(4)
    expect(totalRodadasRh(99)).toBe(10)
    expect(listaRodadasRh(3)).toEqual([1, 2, 3])
    expect(listaRodadasRh(0)).toEqual([1, 2])
  })
})

import { lerTitulosRodadaRh, nomeRodadaRh } from '@/lib/avaliacaoRh'
import { describe as d2, expect as e2, it as i2 } from 'vitest'
d2('títulos personalizados das rodadas', () => {
  i2('usa o título do gerente ou o padrão', () => {
    e2(nomeRodadaRh(1)).toBe('1ª Avaliação – AC')
    e2(nomeRodadaRh(3)).toBe('3ª Avaliação')
    e2(nomeRodadaRh(1, { '1': 'Avaliação inicial' })).toBe('Avaliação inicial')
  })
  i2('lê só texto de rodadas válidas', () => {
    e2(lerTitulosRodadaRh({ '1': ' A ', '99': 'x', '2': 3, 'z': 'y' })).toEqual({ '1': 'A' })
    e2(lerTitulosRodadaRh(null)).toEqual({})
  })
})
