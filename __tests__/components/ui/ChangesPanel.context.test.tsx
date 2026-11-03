import { act, render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
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

it('mantém o HTML inicial igual ao hidratar o painel flutuante', async () => {
  const props = { context: { type: 'spreadsheet' as const, id: 'projeto-1' }, open: false, changes: [], onClose: vi.fn(), onUndo: vi.fn(), floating: true }
  const container = document.createElement('div')
  container.innerHTML = renderToString(<><span>Antes</span><ChangesPanel {...props} /><span>Depois</span></>)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root: ReturnType<typeof hydrateRoot> | undefined
  try {
    await act(async () => { root = hydrateRoot(container, <><span>Antes</span><ChangesPanel {...props} /><span>Depois</span></>) })
    expect(error).not.toHaveBeenCalled()
    expect(container.textContent).toBe('AntesDepois')
  } finally {
    await act(async () => root?.unmount())
    error.mockRestore()
  }
})
