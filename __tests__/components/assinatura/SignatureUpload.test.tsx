import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { upload } = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@/app/actions/profile', () => ({ uploadSignatureAction: upload }))
vi.mock('next/dynamic', () => ({ default: () => function Editor({ onSave, onClose }: { onSave: (file: File) => Promise<void>; onClose: () => void }) {
  return <><button onClick={onClose}>Cancelar</button><button onClick={() => void onSave(new File(['png'], 'assinatura.png', { type: 'image/png' })).catch(() => {})}>Salvar assinatura</button></>
} }))
import SignatureUpload from '@/components/profile/SignatureUpload'

describe('assinatura do perfil', () => {
  beforeEach(() => upload.mockReset())
  it('cancelar preserva assinatura atual sem enviar arquivo', () => {
    render(<SignatureUpload signatureUrl="/atual.png" />)
    fireEvent.click(screen.getByText('Alterar assinatura'))
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.getByAltText('Assinatura atual')).toHaveAttribute('src', '/atual.png')
    expect(upload).not.toHaveBeenCalled()
  })
  it('falha preserva assinatura atual e editor aberto', async () => {
    upload.mockResolvedValue({ error: 'Falha no envio' })
    render(<SignatureUpload signatureUrl="/atual.png" />)
    fireEvent.click(screen.getByText('Alterar assinatura'))
    fireEvent.click(screen.getByText('Salvar assinatura'))
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    expect(screen.getByAltText('Assinatura atual')).toHaveAttribute('src', '/atual.png')
    expect(screen.getByText('Cancelar')).toBeInTheDocument()
  })
  it('sucesso atualiza prévia e fecha editor com confirmação', async () => {
    upload.mockResolvedValue({ signatureUrl: '/nova.png' })
    render(<SignatureUpload signatureUrl="/atual.png" />)
    fireEvent.click(screen.getByText('Alterar assinatura'))
    fireEvent.click(screen.getByText('Salvar assinatura'))
    await screen.findByText('Assinatura salva com sucesso.')
    expect(screen.queryByText('Cancelar')).not.toBeInTheDocument()
    expect(screen.getByAltText('Assinatura atual')).toHaveAttribute('src', '/nova.png')
    expect(upload.mock.calls[0][0].get('file').type).toBe('image/png')
  })
})
