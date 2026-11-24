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

describe('Canvas novo passa na validação do servidor (rascunho e versão)', () => {
  it('o conteúdo montado por CANVAS_INICIAL é aceito pelo schema CANVAS', async () => {
    const { validarDocumento } = await import('@/lib/validation/documentRevisionSchemas')
    const c = CANVAS_INICIAL({ ...base, stakeholders: ['A'], riscos: [{ numero: 1, denominacao: 'R' }], macroFases: [{ codigo: '1.1', fase: 'F', dataLimite: '2026-08-14', custo: '10' }] }, [])
    expect(() => validarDocumento('CANVAS', c)).not.toThrow()
  })
})

const ESTRATEGIA_PDF = [
  '- Trabalhar em equipe;',
  '- Aquisição de matéria prima de qualidade;',
  '- O Projeto será conduzido respeitando todas as restrições em questão de tempo e gastos nos processos.',
  '- Divisão das funções entre o grupo, desta forma os integrantes conseguem ser mais eficazes em suas tarefas.',
  '- Realização de reuniões semanais em sala de aula ou pelo Microsoft Teams para o acompanhamento das ações, monitorando os prazos, custos e escopo do projeto.',
  '- Serão realizadas reuniões mensais com o grupo, com os stakeholders, devidamente registradas através de atas e supervisionadas pelo gerente do projeto.',
  '- Os canais de comunicação serão:',
  '    - E-mail institucional;',
  '    - WhatsApp;',
  '    - MS Teams;',
  '    - Celular.',
  '- Parceria com os alunos e professores do curso de Mecatrônica para auxílio na automação do projeto.',
  '- Estudos e aprovação do local ideal para a realização (fase de execução) do projeto.',
].join('\n')
const COMUNICACAO_PDF = ['- Os canais de comunicação serão:', '    - E-mail institucional;', '    - WhatsApp;', '    - MS Teams;', '    - Celular.'].join('\n')

describe('Canvas: Estratégia de condução e Comunicação vêm da Declaração do Escopo (ajustes de 21/11)', () => {
  it('Canvas novo: estratégia inteira e só o item de comunicação com os subitens', () => {
    const c = CANVAS_INICIAL({ ...base, escopo: { descricaoProduto: '', estrategia: ESTRATEGIA_PDF } }, [])
    expect(c.estrategia).toBe(ESTRATEGIA_PDF)
    expect(c.comunicacao).toBe(COMUNICACAO_PDF)
  })

  it('Canvas já salvo com o bloco vazio é preenchido; a origem registra o que foi copiado', async () => {
    const { sincronizarComEscopo } = await import('@/lib/canvasEstrategia')
    const salvo = { ...CANVAS_INICIAL(base, []), estrategia: '', comunicacao: '' }
    const r = sincronizarComEscopo(salvo, ESTRATEGIA_PDF)
    expect(r.estrategia).toBe(ESTRATEGIA_PDF)
    expect(r.comunicacao).toBe(COMUNICACAO_PDF)
    expect(r.origemEscopo).toEqual({ estrategia: ESTRATEGIA_PDF, comunicacao: COMUNICACAO_PDF })
  })

  it('o que o usuário editou à mão não é sobrescrito; o que só foi copiado acompanha a Declaração', async () => {
    const { sincronizarComEscopo } = await import('@/lib/canvasEstrategia')
    const copiado = sincronizarComEscopo({ ...CANVAS_INICIAL(base, []), estrategia: '', comunicacao: '' }, '- A\n- Canais de comunicação:\n  - E-mail')
    // Declaração mudou: o bloco não editado acompanha.
    const novo = sincronizarComEscopo(copiado, '- B\n- Comunicação por WhatsApp')
    expect(novo.estrategia).toBe('- B\n- Comunicação por WhatsApp')
    expect(novo.comunicacao).toBe('- Comunicação por WhatsApp')
    // Usuário editou a estratégia: a edição dele prevalece (e a comunicação, intocada, continua acompanhando).
    const editado = sincronizarComEscopo({ ...copiado, estrategia: 'Meu texto' }, '- C\n- Comunicação por Teams')
    expect(editado.estrategia).toBe('Meu texto')
    expect(editado.comunicacao).toBe('- Comunicação por Teams')
    // Canvas antigo com texto manual e sem origem: preservado.
    expect(sincronizarComEscopo({ ...CANVAS_INICIAL(base, []), estrategia: 'Escrito à mão', comunicacao: 'Por e-mail' }, '- X\n- Comunicação Y').comunicacao).toBe('Por e-mail')
    // Declaração vazia: nada é apagado.
    expect(sincronizarComEscopo(copiado, '').estrategia).toBe(copiado.estrategia)
  })

  it('conteúdo com origemEscopo passa na validação do servidor', async () => {
    const { validarDocumento } = await import('@/lib/validation/documentRevisionSchemas')
    const c = CANVAS_INICIAL({ ...base, escopo: { descricaoProduto: '', estrategia: ESTRATEGIA_PDF } }, [])
    expect(() => validarDocumento('CANVAS', c)).not.toThrow()
  })
})
