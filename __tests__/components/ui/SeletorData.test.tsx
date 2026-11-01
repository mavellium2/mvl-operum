import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import SeletorData from '@/components/ui/SeletorData'

afterEach(() => vi.useRealTimers())

function Campo({ inicial = '', onChange = vi.fn() }: { inicial?: string; onChange?: (v: string) => void }) {
  const [v, setV] = useState(inicial)
  return <SeletorData ariaLabel="Data" value={v} onChange={x => { setV(x); onChange(x) }} />
}

describe('SeletorData', () => {
  it('digitar dd/mm/aaaa envia a data em ISO; data inválida não envia', () => {
    const onChange = vi.fn()
    render(<Campo onChange={onChange} />)
    const campo = screen.getByRole('combobox', { name: 'Data' })
    fireEvent.change(campo, { target: { value: '30112026' } })
    expect(campo).toHaveValue('30/11/2026')
    expect(onChange).toHaveBeenLastCalledWith('2026-11-30')
    onChange.mockClear()
    fireEvent.change(campo, { target: { value: '31/02/2026' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('abre o calendário no mês da data, escolhe um dia e fecha', () => {
    render(<Campo inicial="2026-11-16" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Data' }))
    const cal = screen.getByRole('dialog', { name: /Calendário/ })
    expect(cal).toHaveTextContent(/Novembro\s*2026/)
    expect(screen.getByRole('button', { name: /16 de novembro de 2026/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(cal).toHaveTextContent(/Dezembro\s*2026/)
    fireEvent.click(screen.getByRole('button', { name: /^25 de dezembro de 2026/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Data' })).toHaveValue('25/12/2026')
  })

  it('Hoje e Limpar', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 31, 10))
    const onChange = vi.fn()
    render(<Campo inicial="2026-01-05" onChange={onChange} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(onChange).toHaveBeenLastCalledWith('2026-10-31')
    fireEvent.click(screen.getByRole('combobox', { name: 'Data' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(onChange).toHaveBeenLastCalledWith('')
    expect(screen.getByRole('combobox', { name: 'Data' })).toHaveValue('')
  })

  it('teclado: seta para baixo entra no calendário, setas movem o dia, Enter escolhe, Esc fecha', () => {
    render(<Campo inicial="2026-11-16" />)
    const campo = screen.getByRole('combobox', { name: 'Data' })
    fireEvent.click(campo)
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    const cal = screen.getByRole('dialog', { name: /Calendário/ })
    fireEvent.keyDown(cal, { key: 'ArrowRight' })
    fireEvent.keyDown(cal, { key: 'ArrowDown' })
    expect(document.activeElement).toHaveAccessibleName(/24 de novembro de 2026/)
    fireEvent.click(document.activeElement as Element)
    expect(campo).toHaveValue('24/11/2026')
    fireEvent.click(campo)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
