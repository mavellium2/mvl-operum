import { afterEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import ExpandableFieldGroup from '@/components/ui/ExpandableFieldGroup'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
it('sincroniza os dois campos com um único controlador', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  render(<ExpandableFieldGroup>{controls => <>
    <button onClick={() => controls.onRecolhidoChange(!controls.recolhido)}>Premissas</button>
    <button onClick={() => controls.onRecolhidoChange(!controls.recolhido)}>Restrições</button>
    <output>{controls.recolhido ? 'recolhidos' : 'expandidos'}</output>
  </>}</ExpandableFieldGroup>)
  fireEvent.click(screen.getByText('Premissas'))
  expect(screen.getByText('recolhidos')).toBeInTheDocument()
  act(() => vi.runAllTimers())
  fireEvent.click(screen.getByText('Restrições'))
  expect(screen.getByText('expandidos')).toBeInTheDocument()
  act(() => vi.runAllTimers())
})
