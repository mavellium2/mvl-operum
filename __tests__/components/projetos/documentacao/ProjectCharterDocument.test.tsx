import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import ProjectCharterDocument from '@/components/projetos/documentacao/ProjectCharterDocument'

const base = {
  nomeProjeto: 'Girassol em ação', gerenteProjeto: 'Maria Júlia', elaboradoPor: 'Ana Beatriz', aprovadoPor: 'Maria Júlia',
  versao: '1.0', dataAprovacao: '13/03/2026', justificativa: 'Ação social em um asilo.', objetivos: 'Levar doações.', metodologia: '',
  descricaoProduto: 'Visita ao asilo.', premissas: 'Alunos vão colaborar.\nAsilo aceita a visita.', restricoes: 'Prazo da disciplina.\nCusto limitado.\nRegras do asilo.',
  limitesAutoridade: 'Organizar as atividades.',
  principaisEnvolvidos: 'Instituição de Ensino: Fatec Garça\nProfessor(es): Fábio\nPatrocinador: IBM', membros: [{ name: 'Ana', papel: 'Redatora' }],
  fases: [{ id: 'f1', fase: 'Planejamento inicial', dataLimite: '2026-02-21', custo: '11,26' }, { id: 'f2', fase: 'Divulgação', dataLimite: '2026-03-05', custo: '28,44' }],
  categoria: 'Fatec Garça - Gestão Empresarial',
}

describe('ProjectCharterDocument — modelo "02_Project Charter" do professor', () => {
  it('título com Project Charter e seções com título acima da caixa, sem faixa nem numeração', () => {
    render(<ProjectCharterDocument {...base} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Termo de Abertura de Projeto - Project Charter')
    for (const t of ['Justificativa do projeto', 'Objetivo(s) do Projeto', 'Descrição do produto do projeto', 'Premissas (hipóteses) e restrições para o projeto', 'Macro Fases, prazos e custo', 'Principais envolvidos', 'Designação de gerente']) {
      expect(screen.getByText(t)).toBeInTheDocument()
    }
    expect(screen.queryByText(/^I\. /)).not.toBeInTheDocument()
    expect(screen.queryByText(/02_Project Charter/)).not.toBeInTheDocument()
  })

  it('quadro: instituição, nome, elaborado + versão, aprovado - Gerente, assinatura + data de aprovação', () => {
    render(<ProjectCharterDocument {...base} />)
    const quadro = within(screen.getByTestId('quadro-identificacao'))
    expect(quadro.getByText('Fatec Garça - Gestão Empresarial')).toBeInTheDocument()
    expect([...screen.getByTestId('quadro-identificacao').querySelectorAll('strong')].map(b => b.textContent)).toEqual(
      ['Nome do projeto:', 'Elaborado por:', 'Versão:', 'Aprovado por:', 'Assinatura:', 'Data de aprovação:'],
    )
    expect(quadro.getByText(/Maria Júlia - Gerente/)).toBeInTheDocument()
    expect(quadro.getByText(/13\/03\/2026/)).toBeInTheDocument()
  })

  it('premissas e restrições lado a lado, item a item', () => {
    render(<ProjectCharterDocument {...base} />)
    const linhas = [...screen.getByTestId('tabela-premissas').querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent))
    expect(linhas).toEqual([
      ['Alunos vão colaborar.', 'Prazo da disciplina.'],
      ['Asilo aceita a visita.', 'Custo limitado.'],
      ['', 'Regras do asilo.'],
    ])
  })

  it('macro fases numeradas 1.x, custos em reais e custo total', () => {
    render(<ProjectCharterDocument {...base} />)
    const tabela = within(screen.getByTestId('tabela-macro-fases'))
    expect(tabela.getByText('1.1')).toBeInTheDocument()
    expect(tabela.getByText('Planejamento inicial')).toBeInTheDocument()
    expect(tabela.getByText('R$ 11,26')).toBeInTheDocument()
    expect(tabela.getByText('Custo total')).toBeInTheDocument()
    expect(tabela.getByText('R$ 39,70')).toBeInTheDocument()
  })

  it('principais envolvidos agrupados, com os integrantes depois do professor', () => {
    const { container } = render(<ProjectCharterDocument {...base} />)
    const rotulos = [...container.querySelectorAll('p[style*="bold"]')].map(e => e.textContent)
    expect(rotulos).toEqual(['Instituição de Ensino', 'Professor(es)', 'Integrantes do Grupo', 'Patrocinador'])
    expect(screen.getByText('Ana – Redatora')).toBeInTheDocument()
  })

  it('metodologia só sai no PDF se preenchida', () => {
    const { rerender } = render(<ProjectCharterDocument {...base} />)
    expect(screen.queryByText('Metodologia do Projeto')).not.toBeInTheDocument()
    rerender(<ProjectCharterDocument {...base} metodologia="Scrum" />)
    expect(screen.getByText('Metodologia do Projeto')).toBeInTheDocument()
  })

  it('fora do editor não há campos editáveis', () => {
    const { container } = render(<ProjectCharterDocument {...base} />)
    expect(container.querySelectorAll('textarea, input, select')).toHaveLength(0)
  })
})
