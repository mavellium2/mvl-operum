import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { EditorFolhaProvider } from '@/components/documentos/editor/folha'
import { CRITERIOS_RH } from '@/lib/avaliacaoRh'
import { FolhaAvaliacao } from '@/components/projetos/documentacao/formularios/AvaliacaoRh'
import type { DadosFormularios } from '@/components/projetos/documentacao/formularios/FormularioDocumento'
import type { AvaliacaoRh } from '@/lib/validation/formulariosGP'

const sistema: DadosFormularios = {
  nomeProjeto: 'Doatec', instituicao: 'Fatec Garça – ADS – 6° termo Matutino – 1° Semestre 2026', logoUrl: null,
  gerente: { nome: 'João Pedro', assinaturaUrl: null },
  termo: { justificativa: 'Desigualdade no acesso.', objetivos: 'Intermediar doações.', descricaoProduto: 'Plataforma web.' },
  entregas: { raiz: null, itens: [] },
}
const membros = [{ id: 'u1', name: 'Ana', setor: 'Desenvolvedora' }, { id: 'u2', name: 'Enzo', setor: null }]
const editavel = (children: ReactNode) => <EditorFolhaProvider value={{ editavel: true, focar: () => {}, registrarLimpar: () => {} }}>{children}</EditorFolhaProvider>

const conteudo: AvaliacaoRh = {
  cabecalho: {}, integranteId: 'u1', integrante: 'Ana', rodada: 1, notaFinal: '9,5', observacoes: 'Bom desempenho no semestre.', data: '2026-11-20',
  criterios: { pontualidade: 'BOM', qualidade: 'OTIMO' },
}

describe('Avaliação de R.H. — modelo "15" do professor', () => {
  it('folha com quadro, participante/rodada e os 12 critérios com as frases do modelo', () => {
    render(<FolhaAvaliacao conteudo={conteudo} sistema={sistema} versaoPadrao="v1.0.1" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Avaliação de Desempenho dos Recursos Humanos')
    expect(screen.getByTestId('avaliacao-rh-quadro')).toHaveTextContent('Doatec')
    expect(screen.getByText('Nome do Participante:').closest('td')).toHaveTextContent('Ana')
    expect(screen.getByText('Versão:').closest('td')).toHaveTextContent('v1.0.1')
    expect(screen.getByText('Gerente do projeto:').closest('td')).toHaveTextContent('João Pedro')
    expect(screen.getByText('Assinatura do Gerente de Projeto')).toBeInTheDocument()
    expect(screen.getByText('Lista')).toBeInTheDocument()

    const linhas = [...screen.getByTestId('avaliacao-rh-criterios').querySelectorAll(':scope > table > tbody > tr')]
    expect(linhas).toHaveLength(CRITERIOS_RH.length)
    expect(linhas[0]).toHaveTextContent('- PONTUALIDADE / ASSIDUIDADE:')
    expect(linhas[0]).toHaveTextContent('Disposição do participante em cumprir integralmente seu trabalho.')
    expect(linhas[0]).toHaveTextContent('Muitas faltas e atrasos constantes.')
    expect(linhas[4]).toHaveTextContent('SENSO DE RESPONSABILIDADE')
  })

  it('marca o X na coluna do conceito escolhido, na linha do critério', () => {
    render(<FolhaAvaliacao conteudo={conteudo} sistema={sistema} versaoPadrao="v1.0.1" />)
    const linhas = [...screen.getByTestId('avaliacao-rh-criterios').querySelectorAll(':scope > table > tbody > tr')]
    const marcas = (linha: Element) => [...linha.querySelectorAll('td')].slice(1).map(td => td.textContent)
    expect(marcas(linhas[0])).toEqual(['', '', 'X', ''])
    expect(marcas(linhas[1])).toEqual(['', '', '', 'X'])
    expect(marcas(linhas[2])).toEqual(['', '', '', ''])
  })

  it('mostra observações, nota final (digitada) e data', () => {
    render(<FolhaAvaliacao conteudo={conteudo} sistema={sistema} versaoPadrao="v1.0.1" />)
    expect(screen.getByText('Bom desempenho no semestre.')).toBeInTheDocument()
    expect(screen.getByText('Nota Final:').closest('td')).toHaveTextContent('9,5')
    expect(screen.getByText('20/11/2026')).toBeInTheDocument()
  })

  it('na edição, o rádio de cada critério grava o conceito e é excludente', () => {
    let atual = { ...conteudo, criterios: { ...conteudo.criterios } }
    const alterar = vi.fn((fn: (c: AvaliacaoRh) => AvaliacaoRh) => { atual = fn(atual) })
    render(editavel(<FolhaAvaliacao conteudo={atual} sistema={sistema} versaoPadrao="v1.0.1" alterar={alterar} edicao={{ projetoId: 'p', membros }} />))
    fireEvent.click(screen.getByRole('radio', { name: 'PONTUALIDADE / ASSIDUIDADE: Ótimo' }))
    expect(atual.criterios.pontualidade).toBe('OTIMO')
    fireEvent.click(screen.getByRole('radio', { name: 'QUALIDADE: Fraco' }))
    expect(atual.criterios.qualidade).toBe('FRACO')
  })
})
