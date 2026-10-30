import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StakeholderDocument, { observacaoDaLinha, type ProjetoHeader, type Stakeholder } from '@/components/projetos/StakeholderDocument'

const header: ProjetoHeader = {
  categoria: 'Fatec', nomeProjeto: 'Operum', gerenteProjeto: 'Ana', elaboradoPor: '', aprovadoPor: '',
  versao: '1.0', dataCriacao: '', dataAprovacao: '',
}
const linha = (over: Partial<Stakeholder>): Stakeholder => ({
  ref: '01', nome: 'Beta', empresaEquipe: 'Beta LTDA', cargoCompetencia: 'Consultoria', email: 'b@x.com',
  telefoneFax: '', endereco: '', ...over,
})

describe('Formulário de partes interessadas — inativos em vermelho', () => {
  it('a linha do inativo fica vermelha e a observação traz o motivo antes das notas', () => {
    const { container } = render(
      <StakeholderDocument
        header={header}
        stakeholders={[
          linha({ ref: '01', nome: 'Ativo' }),
          linha({ ref: '02', nome: 'Inativo', inativo: true, motivoInativo: 'Contrato encerrado', observacoes: 'Ligar antes' }),
        ]}
      />,
    )
    const linhas = [...container.querySelectorAll('table')[1].querySelectorAll('tbody tr')] as HTMLElement[]
    expect(linhas[0].style.color).toBe('')
    expect(linhas[0].dataset.inativo).toBeUndefined()
    expect(linhas[1].style.color).toBe('rgb(185, 28, 28)')
    expect(linhas[1].dataset.inativo).toBe('true')
    expect(screen.getByText(/Inativo: Contrato encerrado/)).toBeInTheDocument()
    expect(screen.getByText(/Ligar antes/)).toBeInTheDocument()
  })

  it('observacaoDaLinha', () => {
    expect(observacaoDaLinha(linha({ observacoes: 'x' }))).toBe('x')
    expect(observacaoDaLinha(linha({ inativo: true }))).toBe('Inativo')
    expect(observacaoDaLinha(linha({ inativo: true, motivoInativo: 'Saiu', observacoes: 'x' }))).toBe('Inativo: Saiu\nx')
  })
})

describe('Formulário de partes interessadas — layout do modelo 03_Form Stakeholders', () => {
  it('quadro com rótulos em negrito, tabela sem faixa de seção, telefone formatado e sem o rodapé do modelo', () => {
    const { container } = render(
      <StakeholderDocument
        header={{ ...header, elaboradoPor: 'Ana', dataAprovacao: '13/03/2026' }}
        stakeholders={[linha({ telefoneFax: '14998592681' }), linha({ ref: '02', telefoneFax: '1434714723' })]}
      />,
    )
    expect(screen.getByText('Formulário de Stakeholder – Partes Interessadas')).toBeInTheDocument()
    const quadro = screen.getByTestId('quadro-identificacao')
    expect([...quadro.querySelectorAll('strong')].map(b => b.textContent)).toEqual([
      'Nome do projeto:', 'Gerente do projeto:', 'Elaborado por:', 'Aprovado por:', 'Versão:', 'Assinatura:', 'Data de aprovação:',
    ])
    const cabecalho = [...container.querySelectorAll('table')[1].querySelectorAll('thead th')].map(th => th.textContent)
    expect(cabecalho).toEqual(['Ref.', 'Nome', 'Empresa/Equipe', 'Cargo/Competência', 'e-mail', 'Telefone/Fax', 'Endereço', 'Observações'])
    expect(screen.getByText('(14) 99859-2681')).toBeInTheDocument()
    expect(screen.getByText('(14) 3471-4723')).toBeInTheDocument()
    expect(screen.queryByText(/03_Form Stakeholders/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('bloco-assinaturas')).not.toBeInTheDocument()
  })
})
