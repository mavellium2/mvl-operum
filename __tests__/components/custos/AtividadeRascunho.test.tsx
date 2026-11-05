import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AtividadeRascunho from '@/components/custos/AtividadeRascunho'
vi.mock('@/components/card/CardModal', () => ({ default: (props: {
  commentsTarget?: HTMLElement | null
  onPatch: (patch: { description: string }) => void
  onAttachmentUpload: (file: File) => void
}) => <>{props.commentsTarget === undefined && <p>Sem comentários ainda.</p>}<button onClick={() => props.onPatch({ description: 'Descrição nova' })}>Editar descrição</button><button onClick={() => props.onAttachmentUpload(new File(['texto'], 'escopo.txt', { type: 'text/plain' }))}>Anexar</button></> }))
describe('painel de atividade em rascunho', () => {
  it('mantém descrição e arquivos no rascunho antes de criar o card', () => {
    const onDescriptionChange = vi.fn()
    const onFilesChange = vi.fn()
    render(<AtividadeRascunho atividade={{ nodeId: 'novo-1', codigo: '1.1.1', titulo: 'Atividade', descricao: '', elaboradores: '', elaboradorIds: [], minReal: 0, horasReal: '0:00', diasReal: '0', minLegado: 0 }} files={[]} onFilesChange={onFilesChange} onDescriptionChange={onDescriptionChange} onTitleChange={vi.fn()} priority="baixa" onPriorityChange={vi.fn()} canEdit />)
    expect(screen.queryByText('Sem comentários ainda.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Editar descrição' }))
    expect(onDescriptionChange).toHaveBeenCalledWith('Descrição nova')
    fireEvent.click(screen.getByRole('button', { name: 'Anexar' }))
    expect(onFilesChange).toHaveBeenCalledWith([expect.objectContaining({ name: 'escopo.txt', file: expect.any(File) })])
    expect(screen.getByText(/salvos automaticamente/)).toBeInTheDocument()
  })
})
