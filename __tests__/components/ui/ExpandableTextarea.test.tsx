import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ExpandableTextarea from '@/components/ui/ExpandableTextarea'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('ExpandableTextarea', () => {
  it('recolhe por clique e libera a altura dos campos lado a lado', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(() => document.body)
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(240)
    render(<ExpandableTextarea name="objetivos" value="Texto longo" onChange={vi.fn()} preencher alturaMinima={70} rotulo="Objetivos" />)
    const field = screen.getByRole('textbox')
    expect(field).not.toHaveClass('grow')
    fireEvent.click(screen.getByRole('button', { name: 'Recolher campo' }))
    expect(field).not.toHaveClass('grow')
    expect(field).toHaveStyle({ height: '70px' })
    expect(screen.getByRole('button', { name: 'Expandir campo' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir campo' }))
    expect(field).not.toHaveClass('grow')
    expect(field).toHaveStyle({ height: '240px' })
  })
})
