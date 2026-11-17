import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { EditorFolhaProvider } from '@/components/documentos/editor/folha'
import { FolhasEscopo, escopoInicial } from '@/components/projetos/documentacao/formularios/DeclaracaoEscopo'
import { FolhasRiscos, riscosNormalizado } from '@/components/projetos/documentacao/formularios/FormulariosRiscos'
import { FolhasLicoes } from '@/components/projetos/documentacao/formularios/LicoesAprendidas'
import type { DadosFormularios } from '@/components/projetos/documentacao/formularios/FormularioDocumento'

const sistema: DadosFormularios = {
  nomeProjeto: 'Doatec', instituicao: 'Fatec Garça – ADS – 6° termo Matutino – 1° Semestre 2026', logoUrl: null,
  gerente: { nome: 'João Pedro', assinaturaUrl: null },
  termo: { justificativa: 'Desigualdade no acesso.', objetivos: 'Intermediar doações.', descricaoProduto: 'Plataforma web.' },
  entregas: { raiz: { codigo: '1', titulo: 'Site para Doação' }, itens: [{ codigo: '1.1', titulo: 'Planejamento' }, { codigo: '1.2', titulo: 'Arquitetura' }] },
}
const membros = [{ id: 'u1', name: 'João Pedro', setor: 'Desenvolvedor Full Stack' }, { id: 'u2', name: 'Enzo', setor: null }]
const editavel = (children: ReactNode) => <EditorFolhaProvider value={{ editavel: true, focar: () => {}, registrarLimpar: () => {} }}>{children}</EditorFolhaProvider>

describe('Declaração do Escopo — modelo "14 Aula GP"', () => {
  it('documento novo parte do Termo e lista a equipe com a função em Responsabilidades', () => {
    const c = escopoInicial(sistema, membros)
    expect(c).toMatchObject({ justificativa: 'Desigualdade no acesso.', objetivos: 'Intermediar doações.', descricaoProduto: 'Plataforma web.' })
    expect(c.responsabilidades).toBe('João Pedro – Desenvolvedor Full Stack: \nEnzo: ')
  })

  it('quadro do modelo e seções na ordem, com a Lista de entregas (níveis 1 e 2 da EAP)', () => {
    const conteudo = { ...escopoInicial(sistema, membros), cabecalho: { elaboradoPor: 'João Pedro', funcao: 'Desenvolvedor Full Stack', dataAprovacao: '2026-04-07' } }
    render(<FolhasEscopo conteudo={conteudo} sistema={sistema} versaoPadrao="1.0" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Declaração do Escopo')
    const quadro = screen.getByTestId('escopo-quadro')
    expect([...quadro.querySelectorAll('strong')].map(b => b.textContent)).toEqual(
      ['Nome do projeto:', 'Gerente do projeto:', 'Elaborado por:', 'Versão:', 'Aprovado por:', 'Assinatura:', 'Data de aprovação:'],
    )
    expect(within(quadro).getByText(/João Pedro – Desenvolvedor Full Stack/)).toBeInTheDocument()
    expect(within(quadro).getByText(/João Pedro - Gerente/)).toBeInTheDocument()
    expect(within(quadro).getByText(/07\/04\/2026/)).toBeInTheDocument()
    const texto = screen.getByTestId('escopo-folha').textContent ?? ''
    const ordem = ['Justificativa do projeto', 'Objetivo(s) do projeto', 'Descrição do(s) produto(s) ou serviço(s) do projeto', 'Lista de entregas do projeto', 'Ligações com outros projetos', 'Estratégia de condução do projeto', 'Responsabilidades dos setores envolvidos']
    expect(ordem.map(t => texto.indexOf(t))).toEqual([...ordem.map(t => texto.indexOf(t))].sort((a, b) => a - b))
    const entregas = within(screen.getByTestId('escopo-entregas'))
    expect(entregas.getByText('1. Site para Doação')).toBeInTheDocument()
    expect(entregas.getByText('1.1 Planejamento')).toBeInTheDocument()
    expect(entregas.getByText('1.2 Arquitetura')).toBeInTheDocument()
  })

  it('sem EAP, a Lista de entregas orienta a montar a EAP', () => {
    render(<FolhasEscopo conteudo={escopoInicial({ ...sistema, entregas: { raiz: null, itens: [] } }, [])} sistema={{ ...sistema, entregas: { raiz: null, itens: [] } }} versaoPadrao="1.0" />)
    expect(screen.getByText(/Monte a EAP do projeto/)).toBeInTheDocument()
  })
})

describe('Formulários de Riscos — modelo "15 Aula GP", vários por documento', () => {
  const risco = { id: 'a', numero: '01', denominacao: 'Atualização de dependência', impacto: 4, probabilidade: 2, impactoReavaliado: 3, probabilidadeReavaliada: 1, responsavel: 'Enzo', responsavelFuncao: 'Revisor', respostasNaWbs: true }

  it('uma folha por risco, com as quatro etapas e as escalas marcadas como no modelo', () => {
    render(<FolhasRiscos conteudo={{ riscos: [risco, { id: 'b', numero: '02' }] }} sistema={sistema} versaoPadrao="1.0" />)
    const folhas = screen.getAllByTestId('risco-folha')
    expect(folhas).toHaveLength(2)
    const t = folhas[0].textContent ?? ''
    for (const e of ['1ª Etapa: Identificação do Risco', '2ª Etapa: Avaliação do Risco', '3ª Etapa: Desenvolvimento da Resposta', '4ª Etapa: Acompanhamento do Risco']) expect(t).toContain(e)
    expect(t).toContain('● 4 (médio/alto)')
    expect(t).toContain('● 2 (média/baixa)')
    expect(t).toContain('3 – Médio')
    expect(t).toContain('1 – Baixa')
    expect(t).toContain('Enzo – Revisor')
    expect(t).toContain('☒')
    expect(folhas[1].textContent).toContain('☐')
  })

  it('na edição: marca a escala e remove um risco (sempre fica ao menos um)', () => {
    let conteudo = { riscos: [risco, { id: 'b', numero: '02' }] }
    const alterar = vi.fn((fn: (c: typeof conteudo) => typeof conteudo) => { conteudo = fn(conteudo) })
    const { rerender } = render(editavel(<FolhasRiscos conteudo={conteudo} sistema={sistema} versaoPadrao="1.0" alterar={alterar as never} edicao={{ projetoId: 'p', membros }} />))
    fireEvent.click(screen.getAllByRole('radio', { name: 'Impacto 5 (alto)' })[1])
    expect(conteudo.riscos[1]).toMatchObject({ impacto: 5 })
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover este risco' })[0])
    expect(conteudo.riscos.map(r => r.id)).toEqual(['b'])
    rerender(editavel(<FolhasRiscos conteudo={conteudo} sistema={sistema} versaoPadrao="1.0" alterar={alterar as never} edicao={{ projetoId: 'p', membros }} />))
    expect(screen.getByRole('button', { name: 'Remover este risco' })).toBeDisabled()
  })

  it('documento salvo sem riscos volta com um formulário vazio', () => {
    expect(riscosNormalizado({}).riscos).toHaveLength(1)
  })
})

describe('Lições Aprendidas — modelo "20 Aula GP"', () => {
  const conteudo = { cabecalho: {}, aspectos: { a1: { sim: true, comentario: 'Conforme o termo.' }, a7: { sim: false } }, perguntas: { p14: 'O planejamento teórico.' } }

  it('13 aspectos com Sim/Não e comentário, guias "Por quê?" e perguntas 14 a 17', () => {
    render(<FolhasLicoes conteudo={conteudo} sistema={sistema} versaoPadrao="1.0" />)
    const linhas = [...screen.getByTestId('licoes-aspectos').querySelectorAll('tbody tr')]
    expect(linhas).toHaveLength(13)
    expect([...linhas[0].querySelectorAll('td')].map(td => td.textContent)).toEqual([
      '1. Os produtos/serviços entregues correspondem aos descritos na proposta executiva (termo de abertura)?', 'X', '', 'Conforme o termo.',
    ])
    expect(linhas[6].querySelectorAll('td')[2].textContent).toBe('X')
    expect(linhas[6].textContent).toContain('Por quê?')
    expect(linhas[2].textContent).toContain('Quais foram as causas dos desvios?')
    const texto = screen.getByTestId('licoes-folha').textContent ?? ''
    for (const p of ['14. O que faríamos da mesma forma?', '15. O que faríamos de maneira diferente?', '16. O que sabemos hoje, e que não sabíamos antes do projeto?', '17. Que recomendações devemos incluir para melhorar os próximos projetos?']) expect(texto).toContain(p)
    expect(texto).toContain('O planejamento teórico.')
  })

  it('na edição, Sim e Não são excludentes por aspecto', () => {
    let c = conteudo as typeof conteudo & { aspectos: Record<string, { sim?: boolean | null }> }
    const alterar = vi.fn((fn: (x: typeof c) => typeof c) => { c = fn(c) })
    render(editavel(<FolhasLicoes conteudo={c} sistema={sistema} versaoPadrao="1.0" alterar={alterar as never} edicao={{ projetoId: 'p', membros }} />))
    fireEvent.click(screen.getByRole('radio', { name: '1. Não' }))
    expect(c.aspectos.a1).toEqual({ sim: false, comentario: 'Conforme o termo.' })
  })
})
