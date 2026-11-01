import { describe, expect, it } from 'vitest'
import { dataProjetoValida, validarProjeto } from '@/lib/validacaoProjeto'

describe('prevenção de erros no projeto', () => {
  it('recusa nome vazio e informa o campo exato', () => {
    expect(validarProjeto({ name: '   ' })).toEqual([{ campo: 'name', mensagem: 'Informe o nome do projeto.' }])
  })
  it.each(['2027-02-31', '2026-02-29', '2026-13-01', '31/12', '2026-00-01'])('recusa data impossível ou incompleta: %s', value => {
    expect(dataProjetoValida(value)).toBe(false)
    expect(validarProjeto({ startDate: value })[0].campo).toBe('startDate')
  })
  it('aceita ano bissexto, mesmo dia de início e fim, e datas opcionais', () => {
    expect(dataProjetoValida('2028-02-29')).toBe(true)
    expect(validarProjeto({ startDate: '2026-11-01', endDate: '2026-11-01' })).toEqual([])
    expect(validarProjeto({ name: 'Teste', startDate: '', endDate: '' })).toEqual([])
  })
  it('não permite fim anterior ao início', () => {
    expect(validarProjeto({ startDate: '2026-11-02', endDate: '2026-11-01' })[0].campo).toBe('endDate')
  })
  it('identifica cada fase repetida sem distinguir caixa e espaços', () => {
    expect(validarProjeto({ macroFases: [{ fase: ' Escopo ' }, { fase: 'escopo' }] }).map(e => e.campo)).toEqual(['fase:0', 'fase:1'])
  })
  it('ignora linha vazia, mas aponta prazo ou custo sem nome e data impossível', () => {
    expect(validarProjeto({ macroFases: [{ fase: '' }] })).toEqual([])
    expect(validarProjeto({ macroFases: [{ fase: '', custo: '100,00', dataLimite: '2026-02-31' }] }).map(e => e.campo)).toEqual(['fase:0', 'dataFase:0'])
  })
  it('recusa custo inválido e aponta a fase correta', () => {
    expect(validarProjeto({ macroFases: [{ fase: 'Escopo', custo: '-100' }] })[0].campo).toBe('custoFase:0')
  })
  it('aceita o limite exato de texto e identifica o excesso antes do envio', () => {
    expect(validarProjeto({ justificativa: 'a'.repeat(20000) })).toEqual([])
    expect(validarProjeto({ justificativa: 'a'.repeat(24641) })[0]).toEqual({ campo: 'justificativa', mensagem: expect.stringContaining('4.641') })
    expect(validarProjeto({ macroFases: [{ fase: 'a'.repeat(501) }] })[0].campo).toBe('fase:0')
  })

})
