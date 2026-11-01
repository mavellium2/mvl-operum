import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); vi.setSystemTime(new Date(2026, 10, 1, 16, 55)) })
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear() })
it('acompanha dez minutos de mistura com céu anterior opaco e libera o tema final', () => {
  const { container } = render(<ProjectAppearance enabled><div className="fundo-vidro">Editor</div></ProjectAppearance>)
  const root = container.querySelector('.project-appearance')!
  expect(root).toHaveAttribute('data-blending', 'true')
  expect(container.querySelector('[data-sky="day"]')).toHaveStyle({ opacity: '1' })
  expect(container.querySelector('[data-sky="afternoon"]')).toHaveStyle({ opacity: '0' })
  act(() => vi.advanceTimersByTime(5 * 60_000))
  expect(container.querySelector('[data-sky="day"]')).toHaveStyle({ opacity: '1' })
  expect(container.querySelector('[data-sky="afternoon"]')).toHaveStyle({ opacity: '0.5' })
  expect(document.body).toHaveAttribute('data-operum-blending', 'true')
  expect(document.body.style.getPropertyValue('--ap-text')).toContain('50%')
  act(() => vi.advanceTimersByTime(5 * 60_000))
  expect(root).toHaveAttribute('data-period', 'afternoon')
  expect(root).not.toHaveAttribute('data-blending')
  expect(document.body).not.toHaveAttribute('data-operum-blending')
  expect(document.body.style.getPropertyValue('--ap-text')).toBe('')
})
