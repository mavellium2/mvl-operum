import { describe, it, expect } from 'vitest'
import { CANVAS_INICIAL } from '@/components/projetos/documentacao/CanvasDocumento'

const base = {
  nomeProjeto: 'Projeto MARCA', instituicao: 'Fatec Garça', logoUrl: null, gerente: { nome: 'Émerson Guimarães', assinaturaUrl: null },
  termo: { justificativa: 'J', objetivos: 'O', descricaoProduto: 'Produto do Termo', restricoes: '1 – Orçamento', premissas: '1 – Autorização' },
  entregas: { raiz: null, itens: [] },
}

describe('Canvas novo: cada bloco vem de onde o modelo do professor manda', () => {
  it('Termo, Declaração do Escopo, Partes Interessadas, Riscos e macrofases', () => {
    const c = CANVAS_INICIAL({
      ...base,
      escopo: { descricaoProduto: 'Mural artístico', estrategia: '1. Planejamento' },
      stakeholders: ['Émerson', 'Breno'],
      riscos: [{ numero: 1, denominacao: 'Falta de verba' }, { numero: 3, denominacao: 'Sem pintor' }],
      macroFases: [
        { codigo: '1.1', fase: 'Objetivos', dataLimite: '2026-08-14', custo: '23.08' },
        { codigo: '1.2', fase: 'Execução da arte', dataLimite: '', custo: '3182.36' },
      ],
    }, [{ id: 'u1', name: 'Membro', setor: null }])
    expect(c).toMatchObject({
      projeto: 'Projeto MARCA', gerente: 'Émerson Guimarães', solicitante: '',
      justificativa: 'J', objetivos: 'O', restricoes: '1 – Orçamento', premissas: '1 – Autorização',
      escopo: 'Mural artístico', estrategia: '1. Planejamento',
      stakeholders: 'Émerson\nBreno',
      riscos: '1 - Falta de verba\n3 - Sem pintor',
      fases: '1.1 Objetivos\n1.2 Execução da arte',
      cronograma: '1.1 14/08/2026',
      orcamento: '1.1 23,08\n1.2 3.182,36',
      escopoNaoIncluido: '', comunicacao: '',
    })
  })

  it('sem Declaração do Escopo nem Partes Interessadas: descrição do Termo e nomes da equipe', () => {
    const c = CANVAS_INICIAL(base, [{ id: 'u1', name: 'Ana', setor: null }, { id: 'u2', name: 'Bia', setor: null }])
    expect(c.escopo).toBe('Produto do Termo')
    expect(c.estrategia).toBe('')
    expect(c.stakeholders).toBe('Ana\nBia')
    expect([c.riscos, c.fases, c.cronograma, c.orcamento]).toEqual(['', '', '', ''])
  })
})
