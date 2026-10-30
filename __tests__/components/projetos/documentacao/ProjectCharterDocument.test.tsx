import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ProjectCharterDocument from '@/components/projetos/documentacao/ProjectCharterDocument'

const base = {
  nomeProjeto: 'Projeto Operum', gerenteProjeto: 'Marcelo', elaboradoPor: 'Agnes', aprovadoPor: 'Marcelo',
  versao: '1.0', dataAprovacao: '15/02/2010', justificativa: 'Porque sim', objetivos: 'Facilitar', metodologia: '',
  descricaoProduto: 'Site', premissas: 'Prazo', restricoes: 'Backup', limitesAutoridade: 'Definir equipe',
  principaisEnvolvidos: 'Instituição: Fatec\nProfessor: Fábio\nPatrocinador: IBM', membros: [{ name: 'Ana' }],
  fases: [{ id: 'f1', fase: '1.1 Requisitos', dataLimite: '2010-02-06', custo: '124,4' }],
}

describe('ProjectCharterDocument — folha do Termo (PDF)', () => {
  it('seções numeradas em romano na faixa cinza, na ordem do modelo', () => {
    render(<ProjectCharterDocument {...base} />)
    const titulos = screen.getAllByRole('columnheader').map(th => th.textContent).filter(t => /^[IVX]+\. /.test(t ?? ''))
    expect(titulos).toEqual([
      'I. Justificativa do projeto', 'II. Objetivo(s) do projeto', 'III. Descrição do produto do projeto',
      'IV. Premissas (hipóteses) e restrições para o projeto', 'V. Macro fases, prazos e custo',
      'VI. Principais envolvidos', 'VII. Designação de gerente',
    ])
  })

  it('quadro de identificação: instituição na faixa, elaborado + versão, aprovado (gerente) + data', () => {
    render(<ProjectCharterDocument {...base} />)
    const quadro = within(screen.getByTestId('quadro-identificacao'))
    expect(quadro.getByText('Fatec')).toBeInTheDocument()
    expect(quadro.getByText('Nome do projeto: Projeto Operum')).toBeInTheDocument()
    expect(quadro.getByText(/Elaborado por:/)).toHaveTextContent('Elaborado por: Agnes')
    expect(quadro.getByText('Versão: 1.0')).toBeInTheDocument()
    expect(quadro.getByText('Aprovado por: Marcelo — Gerente do projeto')).toBeInTheDocument()
    expect(quadro.getByText(/Data:/)).toHaveTextContent('Data: 15/02/2010')
  })

  it('custos em reais, total calculado e assinaturas no fim', () => {
    const { container } = render(<ProjectCharterDocument {...base} />)
    expect(screen.getAllByText('R$ 124,40').length).toBe(2)
    expect(container.firstElementChild!.lastElementChild).toBe(screen.getByTestId('bloco-assinaturas'))
    expect(screen.getAllByTestId('assinatura').map(a => a.textContent)).toEqual([
      'AgnesElaborado por', 'MarceloAprovado por — Gerente do projeto',
    ])
  })

  it('principais envolvidos agrupados, com os integrantes depois do professor', () => {
    const { container } = render(<ProjectCharterDocument {...base} />)
    const rotulos = [...container.querySelectorAll('div[style*="bold"]')].map(e => e.textContent)
      .filter(t => ['Instituição', 'Professor', 'Integrantes do Grupo', 'Patrocinador'].includes(t ?? ''))
    expect(rotulos).toEqual(['Instituição', 'Professor', 'Integrantes do Grupo', 'Patrocinador'])
  })

  it('metodologia só aparece no PDF se preenchida (não existe no modelo)', () => {
    const { rerender } = render(<ProjectCharterDocument {...base} />)
    expect(screen.queryByText(/Metodologia do projeto/)).not.toBeInTheDocument()
    rerender(<ProjectCharterDocument {...base} metodologia="Scrum" />)
    expect(screen.getByText('VIII. Metodologia do projeto')).toBeInTheDocument()
  })

  it('fora do editor não há campos editáveis', () => {
    const { container } = render(<ProjectCharterDocument {...base} />)
    expect(container.querySelectorAll('textarea, input, select')).toHaveLength(0)
  })
})
