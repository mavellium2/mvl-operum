import { useEffect, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ empty: true, clear: vi.fn(), fromData: vi.fn(), off: vi.fn(), destroy: vi.fn(), terminate: vi.fn(), getDocument: vi.fn(), getPage: vi.fn() }))
vi.mock('signature_pad', () => ({ default: class {
  isEmpty() { return mocks.empty }
  toData() { return [] }
  clear = mocks.clear
  fromData = mocks.fromData
  off = mocks.off
} }))
vi.mock('pdfjs-dist', () => ({ PDFWorker: { create: vi.fn(() => ({ destroy: vi.fn() })) }, getDocument: mocks.getDocument }))
vi.mock('@/components/ui/Modal', () => ({ default: function DeferredModal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  // The real modal mounts its portal after the parent's first effect.
  useEffect(() => { setMounted(true) }, [])
  return mounted ? <div>{children}</div> : null
} }))
import SignatureEditor from '@/components/assinatura/SignatureEditor'
import { escolherOpcao, opcoesDo } from '../../helpers/select'

describe('editor reutilizável de assinatura', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.empty = true
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('Worker', class { terminate = mocks.terminate })
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 600 } as DOMRect)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ scale: vi.fn(), drawImage: vi.fn(), getImageData: () => ({ data: [0, 0, 0, 255] }) } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(cb => cb(new Blob(['png'], { type: 'image/png' })))
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,aA==')
    mocks.getPage.mockResolvedValue({ getViewport: () => ({ width: 600, height: 800 }), render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }), cleanup: vi.fn() })
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: mocks.getPage }), destroy: mocks.destroy })
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
  it('rejeita desenho vazio sem enviar ao servidor', async () => {
    const save = vi.fn()
    render(<SignatureEditor onClose={vi.fn()} onSave={save} />)
    fireEvent.click(screen.getByText('Salvar assinatura'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Desenhe sua assinatura')
    expect(save).not.toHaveBeenCalled()
  })
  it('exporta desenho para PNG e mostra erros retornados pelo envio', async () => {
    mocks.empty = false
    const save = vi.fn().mockRejectedValue(new Error('Servidor indisponível'))
    render(<SignatureEditor onClose={vi.fn()} onSave={save} />)
    fireEvent.click(screen.getByText('Salvar assinatura'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor indisponível')
    expect(save.mock.calls[0][0].type).toBe('image/png')
    expect(screen.getByText('Salvar assinatura')).toBeEnabled()
  })
  it('limpa o desenho e remove listeners ao sair', () => {
    const { unmount } = render(<SignatureEditor onClose={vi.fn()} onSave={vi.fn()} />)
    fireEvent.click(screen.getByText('Limpar'))
    expect(mocks.clear).toHaveBeenCalled()
    unmount()
    expect(mocks.off).toHaveBeenCalled()
  })
  function uploadPdf() {
    fireEvent.click(screen.getByText('Enviar arquivo'))
    fireEvent.change(screen.getByLabelText(/PNG, JPG ou PDF/), { target: { files: [new File(['%PDF'], 'assinatura.pdf', { type: 'application/pdf' })] } })
  }
  it('renderiza PDF no navegador, permite escolher página e libera worker ao sair', async () => {
    const { unmount } = render(<SignatureEditor onClose={vi.fn()} onSave={vi.fn()} />)
    uploadPdf()
    await screen.findByAltText('Prévia para recortar a assinatura')
    escolherOpcao(screen.getByRole('combobox', { name: 'Página do PDF' }), '2')
    await waitFor(() => expect(mocks.getPage).toHaveBeenCalledWith(2))
    unmount()
    expect(mocks.destroy).toHaveBeenCalled()
    await waitFor(() => expect(mocks.terminate).toHaveBeenCalled())
  })
  it('rejeita PDFs com páginas em excesso e libera recursos', async () => {
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 51 }), destroy: mocks.destroy })
    render(<SignatureEditor onClose={vi.fn()} onSave={vi.fn()} />)
    uploadPdf()
    expect(await screen.findByRole('alert')).toHaveTextContent('50 páginas')
    expect(mocks.getPage).not.toHaveBeenCalled()
    expect(mocks.destroy).toHaveBeenCalled()
    await waitFor(() => expect(mocks.terminate).toHaveBeenCalled())
  })
  it('ignora resultado antigo quando o usuário troca o arquivo durante o carregamento', async () => {
    let resolve!: (doc: unknown) => void
    mocks.getDocument.mockReturnValue({ promise: new Promise(done => { resolve = done }), destroy: mocks.destroy })
    render(<SignatureEditor onClose={vi.fn()} onSave={vi.fn()} />)
    uploadPdf()
    await waitFor(() => expect(mocks.getDocument).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText(/PNG, JPG ou PDF/), { target: { files: [new File(['x'], 'invalido.svg', { type: 'image/svg+xml' })] } })
    await screen.findByRole('alert')
    resolve({ numPages: 2, getPage: mocks.getPage })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Selecione PNG, JPG ou PDF'))
    expect(mocks.getPage).not.toHaveBeenCalled()
    expect(screen.queryByAltText('Prévia para recortar a assinatura')).not.toBeInTheDocument()
  })

  it('envia o recorte do PDF como PNG, nunca o PDF original', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    render(<SignatureEditor onClose={vi.fn()} onSave={save} />)
    uploadPdf()
    const image = await screen.findByAltText('Prévia para recortar a assinatura')
    Object.defineProperties(image, { naturalWidth: { value: 600 }, naturalHeight: { value: 800 }, complete: { value: true } })
    fireEvent.click(screen.getByText('Salvar assinatura'))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0].type).toBe('image/png')
    expect(save.mock.calls[0][0].name).toBe('assinatura.png')
  })

})
