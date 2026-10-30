import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useGuardaSaida, navegarComGuarda, type SaidaDocumento } from '@/components/documentos/editor/GuardaSaida'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

function Tela({ saida }: { saida: SaidaDocumento }) {
  const { dialogo } = useGuardaSaida(saida)
  return <><a href="/projetos/p1/sprints">Sprints</a>{dialogo}</>
}

beforeEach(() => vi.clearAllMocks())

describe('aviso ao sair com alterações não salvas', () => {
  it('sem alterações, o link segue normalmente', () => {
    render(<Tela saida={{ pendente: false, salvar: vi.fn(), descartar: vi.fn() }} />)
    fireEvent.click(screen.getByText('Sprints'))
    expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument()
  })

  it('com alterações, pergunta; "Descartar alterações" descarta e segue', async () => {
    const descartar = vi.fn()
    render(<Tela saida={{ pendente: true, salvar: vi.fn(), salvarDepois: vi.fn(), descartar }} />)
    fireEvent.click(screen.getByText('Sprints'))
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Descartar alterações/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projetos/p1/sprints'))
    expect(descartar).toHaveBeenCalled()
  })

  it('"Salvar mais tarde" guarda o rascunho e segue; se falhar, fica e avisa', async () => {
    const salvarDepois = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<Tela saida={{ pendente: true, salvar: vi.fn(), salvarDepois, descartar: vi.fn() }} />)
    fireEvent.click(screen.getByText('Sprints'))
    fireEvent.click(screen.getByRole('button', { name: /Salvar mais tarde/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível guardar o rascunho')
    expect(push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Salvar mais tarde/ }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projetos/p1/sprints'))
  })

  it('"Salvar" abre o salvar da versão e só sai quando não houver mais pendência', async () => {
    function Documento() {
      const [pendente, setPendente] = useState(true)
      return <><Tela saida={{ pendente, salvar: () => {}, descartar: vi.fn() }} /><button onClick={() => setPendente(false)}>versão salva</button></>
    }
    render(<Documento />)
    fireEvent.click(screen.getByText('Sprints'))
    fireEvent.click(screen.getByRole('button', { name: /^SalvarSalva uma versão/ }))
    expect(push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('versão salva'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/projetos/p1/sprints'))
  })

  it('"Salvar mais tarde" não aparece quando o documento não admite rascunho', () => {
    render(<Tela saida={{ pendente: true, salvar: vi.fn(), descartar: vi.fn() }} />)
    fireEvent.click(screen.getByText('Sprints'))
    expect(screen.queryByRole('button', { name: /Salvar mais tarde/ })).not.toBeInTheDocument()
  })

  it('troca de documento pelo menu (navegarComGuarda) também pergunta', () => {
    const destino = vi.fn()
    render(<Tela saida={{ pendente: true, salvar: vi.fn(), descartar: vi.fn() }} />)
    navegarComGuarda(destino)
    expect(destino).not.toHaveBeenCalled()
    return waitFor(() => expect(screen.getByText('Alterações não salvas')).toBeInTheDocument())
  })
})
