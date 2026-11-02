import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAppearance } from '@/hooks/useAppearance'
import { APPEARANCE_KEY } from '@/lib/appearance'
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
})
it('mantém a aparência pronta ao desmontar e entrar em outra tela', () => {
  localStorage.setItem(APPEARANCE_KEY, 'day')
  const first = renderHook(() => useAppearance())
  act(() => window.dispatchEvent(new Event('operum-appearance')))
  expect(first.result.current.period).toBe('day')
  first.unmount()
  const next = renderHook(() => useAppearance())
  expect(next.result.current.period).toBe('day')
  next.unmount()
})
it('sincroniza consumidores e conserva a escolha ao navegar', () => {
  const first = renderHook(() => useAppearance())
  const second = renderHook(() => useAppearance())
  act(() => { first.result.current.save('dark') })
  expect(first.result.current.period).toBe('night')
  expect(second.result.current.period).toBe('night')
  act(() => { second.result.current.save('light') })
  expect(first.result.current.period).toBe('morning')
  first.unmount(); second.unmount()
})
