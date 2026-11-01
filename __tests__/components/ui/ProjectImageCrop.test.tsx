import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ProjectImageCrop from '@/components/projetos/ProjectImageCrop'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('rejeita SVG sem criar URL nem decodificar conteúdo ativo', async () => {
  const decode = vi.fn()
  vi.stubGlobal('createImageBitmap', decode)
  render(<ProjectImageCrop file={new File(['<svg onload="alert(1)"/>'], 'logo.svg', { type: 'image/svg+xml' })} onCancel={vi.fn()} onConfirm={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPEG ou WebP')
  expect(decode).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Usar imagem' })).toBeDisabled()
  expect(document.querySelector('img')).toBeNull()
})

it('desenha os pixels em canvas, aplica zoom e envia somente PNG recortado', async () => {
  const bitmap = { width: 1200, height: 600, close: vi.fn() }
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
  const drawImage = vi.fn()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob(['pixels'], { type: 'image/png' })))
  const onConfirm = vi.fn()
  const file = new File(['image'], 'logo.png', { type: 'image/png' })
  const { unmount } = render(<ProjectImageCrop file={file} onCancel={vi.fn()} onConfirm={onConfirm} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Usar imagem' })).toBeEnabled())
  expect(screen.getByRole('img', { name: 'Prévia do recorte' }).tagName).toBe('CANVAS')
  fireEvent.change(screen.getByRole('slider', { name: 'Zoom da imagem' }), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Usar imagem' }))
  expect(drawImage).toHaveBeenLastCalledWith(bitmap, 450, 150, 300, 300, 0, 0, 512, 512)
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ name: 'projeto.png', type: 'image/png' }))
  unmount()
  expect(bitmap.close).toHaveBeenCalledOnce()
})
