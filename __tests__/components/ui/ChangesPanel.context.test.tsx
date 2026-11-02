import { render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import ChangesPanel from '@/components/ui/ChangesPanel'
vi.mock('@/hooks/useAppearance', () => ({ useAppearance: () => ({ period: 'day', blend: null }) }))
it('isola dados de projeto e permissões e identifica o contexto da função', () => {
  render(<>
    <ChangesPanel context={{ type: 'project', id: 'projeto-1' }} open changes={[{ chave: 'nome', rotulo: 'Nome do projeto', antes: 'Antigo', depois: 'Novo' }]} onClose={vi.fn()} onUndo={vi.fn()} />
    <ChangesPanel context={{ type: 'permissions', id: 'funcao-1', label: 'Gerente' }} floating open changes={[{ chave: 'projeto:ver', rotulo: 'Ver o projeto', antes: 'Desativado', depois: 'Ativado' }]} onClose={vi.fn()} onUndo={vi.fn()} />
  </>)
  const dialogs = screen.getAllByRole('dialog')
  const permissions = dialogs.find(element => element.dataset.context === 'permissions')!
  const project = dialogs.find(element => element.dataset.context === 'project')!
  expect(within(permissions).getByText('Alterações nos acessos de Gerente')).toBeInTheDocument()
  expect(within(permissions).getByText('Ver o projeto')).toBeInTheDocument()
  expect(within(permissions).queryByText('Nome do projeto')).not.toBeInTheDocument()
  expect(within(project).queryByText('Ver o projeto')).not.toBeInTheDocument()
  expect(permissions.id).not.toBe(project.id)
})
