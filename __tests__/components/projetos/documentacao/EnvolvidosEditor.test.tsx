import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EnvolvidosEditor from '@/components/projetos/documentacao/EnvolvidosEditor'
import { exibirEnvolvidos } from '@/lib/charterEnvolvidos'
vi.mock('@/components/documentos/editor/folha', () => ({ CampoTexto: ({ valor, rotulo, onChange }: { valor: string; rotulo: string; onChange: (value: string) => void }) => <textarea aria-label={rotulo} value={valor} onChange={event => onChange(event.target.value)} /> }))
describe('editor dos principais envolvidos', () => {
  it('exclui um título criado com as pessoas dele; Integrantes do Grupo não tem excluir', () => {
    let stored = '## Professor\nAna\n## Integrantes do Grupo\n\n## Patrocinador\nPrefeitura'
    function Form() {
      const [value, setValue] = useState(stored)
      return <EnvolvidosEditor value={value} membros={['Luan']} onChange={next => { stored = next; setValue(next) }} />
    }
    render(<Form />)
    expect(screen.queryByRole('button', { name: /Excluir o título Integrantes do Grupo/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir o título Professor e as pessoas dele' }))
    expect(exibirEnvolvidos(stored, ['Luan'])).toEqual([{ rotulo: 'Integrantes do Grupo', valores: ['Luan'] }, { rotulo: 'Patrocinador', valores: ['Prefeitura'] }])
    fireEvent.click(screen.getByRole('button', { name: 'Excluir o título Patrocinador e as pessoas dele' }))
    expect(exibirEnvolvidos(stored, ['Luan'])).toEqual([{ rotulo: 'Integrantes do Grupo', valores: ['Luan'] }])
  })

  it('adiciona título, mantém pessoas em linhas e move conteúdo com o título', () => {
    let stored = ''
    function Form() {
      const [value, setValue] = useState('')
      return <EnvolvidosEditor value={value} membros={['Luan – Front End', 'Márcio – FullStack']} onChange={next => { stored = next; setValue(next) }} />
    }
    render(<Form />)
    expect(screen.getByText('Luan – Front End').closest('p')?.tagName).toBe('P')
    expect(screen.getByText('Márcio – FullStack').closest('p')?.tagName).toBe('P')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar título' }))
    expect(screen.getByRole('textbox', { name: 'Título do grupo 2' })).toHaveFocus()
    fireEvent.change(screen.getByRole('textbox', { name: 'Título do grupo 2' }), { target: { value: 'Professores' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Título do grupo 2' }), { key: 'Tab' })
    expect(screen.getByRole('textbox', { name: 'Pessoa 1 de Professores' })).toHaveFocus()
    const first = screen.getByRole('textbox', { name: 'Pessoa 1 de Professores' })
    fireEvent.change(first, { target: { value: 'Ana' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Pessoa 2 de Professores' }), { target: { value: 'Carlos' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mover Professores para cima' }))
    expect(exibirEnvolvidos(stored, ['Luan', 'Márcio'])).toEqual([{ rotulo: 'Professores', valores: ['Ana', 'Carlos'] }, { rotulo: 'Integrantes do Grupo', valores: ['Luan', 'Márcio'] }])
    fireEvent.click(screen.getByRole('button', { name: 'Remover pessoa 2 de Professores' }))
    expect(exibirEnvolvidos(stored, [])[0].valores).toEqual(['Ana'])
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Pessoa 1 de Professores' }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Pessoa 2 de Professores' }), { key: 'Backspace' })
    expect(screen.queryByRole('textbox', { name: 'Pessoa 2 de Professores' })).not.toBeInTheDocument()
    expect(exibirEnvolvidos(stored, [])[0].valores).toEqual(['Ana'])
  })
})
