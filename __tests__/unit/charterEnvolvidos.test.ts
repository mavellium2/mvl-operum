import { describe, expect, it } from 'vitest'
import { lerEnvolvidos, gravarEnvolvidos, exibirEnvolvidos } from '@/lib/charterEnvolvidos'
describe('blocos de principais envolvidos', () => {
  it('recupera documentos antigos sem perder pessoas e mantém a equipe após professores', () => {
    const blocks = exibirEnvolvidos('Professor(es): Ana\nCliente: João\nCliente: Maria', ['Luan – Front End', 'Márcio – FullStack'])
    expect(blocks).toEqual([{ rotulo: 'Professor(es)', valores: ['Ana'] }, { rotulo: 'Integrantes do Grupo', valores: ['Luan – Front End', 'Márcio – FullStack'] }, { rotulo: 'Cliente', valores: ['João', 'Maria'] }])
  })
  it('preserva títulos e pessoas ao reordenar, inclusive a equipe automática', () => {
    const blocks = lerEnvolvidos('Cliente: João\nCliente: Maria')
    blocks.reverse()
    const stored = gravarEnvolvidos(blocks)
    expect(exibirEnvolvidos(stored, ['Luan', 'Hellen'])).toEqual([{ rotulo: 'Cliente', valores: ['João', 'Maria'] }, { rotulo: 'Integrantes do Grupo', valores: ['Luan', 'Hellen'] }])
    expect(gravarEnvolvidos(lerEnvolvidos(stored))).toBe(stored)
  })
  it('preserva pontuação e espaços do título durante a digitação', () => {
    const title = 'Equipe: apoio / cliente & parceiros! '
    expect(lerEnvolvidos(gravarEnvolvidos([{ titulo: title, texto: 'Ana' }])).find(block => !block.equipe)?.titulo).toBe(title)
  })
  it('mantém um título novo vazio e seu campo enquanto o usuário digita', () => {
    const blocks = [...lerEnvolvidos(''), { titulo: '', texto: '' }]
    const restored = lerEnvolvidos(gravarEnvolvidos(blocks))
    expect(restored).toHaveLength(2)
    expect(restored[1]).toMatchObject({ titulo: '', texto: '' })
  })
})
