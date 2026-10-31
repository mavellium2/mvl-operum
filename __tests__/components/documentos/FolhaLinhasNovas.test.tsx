import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SecaoTabela } from '@/components/documentos/editor/folha'

const linhas = (n: number) => Array.from({ length: n }, (_, i) => <tr key={i}><td>linha {i + 1}</td></tr>)

describe('SecaoTabela — pedaço definido pela paginação', () => {
  it('o último pedaço mostra também as linhas novas (Incluir toda a equipe, Adicionar presente)', () => {
    // A paginação mediu 1 linha; depois a lista passou a ter 4.
    const { container } = render(
      <SecaoTabela titulo="I. Presentes" colunas={[{ rotulo: 'Nome' }]} _fatia={{ de: 0, ate: 1, primeiro: true, ultimo: true }}>
        {linhas(4)}
      </SecaoTabela>,
    )
    expect(container.querySelectorAll('tbody tr')).toHaveLength(4)
  })

  it('um pedaço do meio continua mostrando só o seu intervalo', () => {
    const { container } = render(
      <SecaoTabela titulo="I. Presentes" colunas={[{ rotulo: 'Nome' }]} _fatia={{ de: 1, ate: 3, primeiro: false, ultimo: false }}>
        {linhas(6)}
      </SecaoTabela>,
    )
    expect([...container.querySelectorAll('tbody tr')].map(t => t.textContent)).toEqual(['linha 2', 'linha 3'])
  })
})
