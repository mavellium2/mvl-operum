import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WbsGantt from '@/components/wbs/WbsGantt'
import { plannedSchedule, DAY_MS } from '@/lib/wbsGantt'
import type { WbsNodeClient } from '@/types/wbs'

const base: WbsNodeClient = { id: 'r', parentId: null, order: 0, code: '1', title: 'Projeto', layout: 'ABAIXO', collapsed: false, childrenIds: ['a', 'b'], properties: {}, style: { backgroundColor: '#fff', textColor: '#000', borderColor: '#000', borderWidth: 1, borderRadius: 4, fontSize: 14 } }
const a = { ...base, id: 'a', parentId: 'r', title: 'Com prazo', childrenIds: [], properties: { dataPrevista: '2026-10-05', durationDays: 3 } }
const b = { ...base, id: 'b', parentId: 'r', title: 'Sem prazo', childrenIds: [] }
describe('Gantt', () => {
  it('uses the planned deadline and calendar duration, rejecting impossible dates', () => {
    const s = plannedSchedule(a)!
    expect(s.end - s.start).toBe(2 * DAY_MS)
    expect(new Date(s.start).toISOString().slice(0, 10)).toBe('2026-10-03')
    expect(plannedSchedule({ ...a, properties: { dataPrevista: '2026-02-30' } })).toBeNull()
    expect(plannedSchedule(b)).toBeNull()
  })
  it('recolhe a hierarquia e muda a escala visualmente pelo seletor', async () => {
    render(<WbsGantt nodes={{ r: base, a, b }} rootId="r" today="2026-10-04" />)
    const barra = screen.getByRole('img', { name: /Com prazo: 03\/10\/2026 a 05\/10\/2026/ })
    const larguraSemana = Number.parseFloat(barra.style.width)
    expect(screen.getByText(/Sem prazo/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Escala do Gantt' }))
    await userEvent.click(within(screen.getByRole('listbox', { name: 'Escala do Gantt' })).getByRole('option', { name: 'Mês' }))
    expect(Number.parseFloat(barra.style.width)).toBeLessThan(larguraSemana)
    expect(screen.getByRole('combobox', { name: 'Escala do Gantt' })).toHaveTextContent('Mês')
    fireEvent.click(screen.getByRole('button', { name: 'Recolher Projeto' }))
    expect(screen.queryByText(/Sem prazo/)).not.toBeInTheDocument()
    expect(base.collapsed).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Projeto' }))
    expect(screen.getByText(/Sem prazo/)).toBeInTheDocument()
  })
})
