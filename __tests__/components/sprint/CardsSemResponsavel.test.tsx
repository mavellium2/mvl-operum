import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CardsSemResponsavel from '@/components/sprint/CardsSemResponsavel'
import { escolherOpcao } from '../../helpers/select'

const pendentes = [
  { id: 'c1', title: 'Corrigir login', coluna: 'Concluído', motivo: 'sem' as const },
  { id: 'c2', title: 'Ajustar EAP', coluna: 'Em andamento', motivo: 'inativo' as const },
]
const users = [{ id: 'u1', name: 'Ana' }, { id: 'u2', name: 'Bia' }]

describe('aviso de cards sem responsável', () => {
  it('sem pendências não aparece', () => {
    const { container } = render(<CardsSemResponsavel pendentes={[]} users={users} onAtribuir={vi.fn()} onAbrirCard={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mostra a contagem, lista os cards com o motivo e atribui pelo diálogo', async () => {
    const onAtribuir = vi.fn().mockResolvedValue({})
    render(<CardsSemResponsavel pendentes={pendentes} users={users} onAtribuir={onAtribuir} onAbrirCard={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /2 cards estão sem responsável ativo/ }))
    expect(screen.getByText('Concluído · sem responsável')).toBeInTheDocument()
    expect(screen.getByText('Em andamento · responsável inativo')).toBeInTheDocument()
    const atribuir = screen.getAllByRole('button', { name: 'Atribuir' })
    expect(atribuir[0]).toBeDisabled()
    escolherOpcao(screen.getByLabelText('Responsável para Corrigir login'), 'Bia')
    fireEvent.click(atribuir[0])
    await waitFor(() => expect(onAtribuir).toHaveBeenCalledWith('c1', 'u2'))
  })

  it('erro do servidor aparece na linha do card', async () => {
    const onAtribuir = vi.fn().mockResolvedValue({ error: 'Sem permissão' })
    render(<CardsSemResponsavel pendentes={pendentes.slice(0, 1)} users={users} onAtribuir={onAtribuir} onAbrirCard={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /1 card está sem responsável ativo/ }))
    escolherOpcao(screen.getByLabelText('Responsável para Corrigir login'), 'Ana')
    fireEvent.click(screen.getByRole('button', { name: 'Atribuir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão')
  })
})
