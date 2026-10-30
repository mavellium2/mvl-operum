import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import EditorDocumento from '@/components/documentos/editor/EditorDocumento'
import StakeholderDocument from '@/components/projetos/StakeholderDocument'
import { ToastProvider } from '@/components/ui/Toast'

const header = { categoria: 'Fatec', nomeProjeto: 'Operum', gerenteProjeto: 'Ana', elaboradoPor: '', aprovadoPor: '', versao: '1.0', dataCriacao: '', dataAprovacao: '' }

describe('Adicionar parte interessada', () => {
  it('o botão se abre em interno e externo', () => {
    const interno = vi.fn(), externo = vi.fn()
    function Tela({ aberto, onAbrir }: { aberto: boolean; onAbrir: (v: boolean) => void }) {
      return (
        <ToastProvider><EditorDocumento documento="Partes" paisagem editavel status="salvo">
          <StakeholderDocument header={header} stakeholders={[]} menuAdicionar={{ aberto, onAbrir, opcoes: [{ rotulo: 'Stakeholder interno', onClick: interno }, { rotulo: 'Stakeholder externo', onClick: externo }] }} />
        </EditorDocumento></ToastProvider>
      )
    }
    const onAbrir = vi.fn()
    const { rerender } = render(<Tela aberto={false} onAbrir={onAbrir} />)
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parte interessada/ }))
    expect(onAbrir).toHaveBeenCalledWith(true)
    rerender(<Tela aberto onAbrir={onAbrir} />)
    fireEvent.click(screen.getByRole('menuitem', { name: /Stakeholder externo/ }))
    expect(externo).toHaveBeenCalled()
    expect(interno).not.toHaveBeenCalled()
    expect(onAbrir).toHaveBeenLastCalledWith(false)
  })
})
