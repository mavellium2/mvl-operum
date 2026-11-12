import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const download = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/exports/projectDocumentsDocx', () => ({
  downloadFolhaDocx: (...args: unknown[]) => download(...args),
  arquivoDaAta: (n: number) => `ata-${String(n).padStart(2, '0')}.docx`,
}))
const fetchWithSession = vi.fn()
vi.mock('@/lib/clientFetch', () => ({ fetchWithSession: (...a: unknown[]) => fetchWithSession(...a) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))

import BaixarWordAta from '@/components/atas/BaixarWordAta'

describe('Word da Ata na lista', () => {
  it('busca os dados, desenha a folha e gera o Word a partir dela', async () => {
    fetchWithSession.mockResolvedValue(new Response(JSON.stringify({
      numero: 3, nomeProjeto: 'Operum', instituicao: 'Fatec', local: 'Sala', data: '2026-11-10T12:00:00.000Z',
      elaboradoPor: 'Ana', aprovadoPor: 'Bia', assuntosTratados: 'Pauta', decisoesTomadas: '', observacoes: '',
      copiasPara: [], presentes: [{ nome: 'Ana', setorEmpresa: 'Equipe' }], acoes: [{ acao: 'Fazer', prazo: '2026-11-20T12:00:00.000Z', responsavel: 'Ana' }], anexos: [],
    }), { status: 200 }))
    render(<BaixarWordAta ataId="a1" numero={3} />)
    fireEvent.click(screen.getByRole('button', { name: 'Baixar Word da ata 03' }))
    await waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(fetchWithSession).toHaveBeenCalledWith('/api/atas/a1/export?formato=dados')
    const [folha, titulo, arquivo] = download.mock.calls[0]
    expect((folha as HTMLElement).textContent).toContain('Fazer')
    expect(titulo).toBe('Ata de Reunião Nº 03')
    expect(arquivo).toBe('ata-03.docx')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Baixar Word da ata 03' })).not.toBeDisabled())
  })
})
