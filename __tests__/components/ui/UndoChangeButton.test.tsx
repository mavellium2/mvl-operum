import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import UndoChangeButton from '@/components/ui/UndoChangeButton'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('aplica o desfazer somente depois da saída do card', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const motion = { cancel: vi.fn(), onfinish: null as null | (() => void), oncancel: null }
  vi.stubGlobal('Animation', class {})
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: vi.fn(() => motion) })
  const undo = vi.fn()
  render(<div data-testid="alteracao"><UndoChangeButton label="Nome" onUndo={undo} /></div>)
  fireEvent.click(screen.getByRole('button', { name: 'Desfazer Nome' }))
  expect(undo).not.toHaveBeenCalled()
  expect(screen.getByRole('button')).toBeDisabled()
  motion.onfinish?.()
  expect(undo).toHaveBeenCalledOnce()
})
