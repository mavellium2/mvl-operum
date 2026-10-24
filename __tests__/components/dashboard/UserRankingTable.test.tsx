import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UserRankingTable from '@/components/dashboard/UserRankingTable'

const users = [
  { id: 'u1', name: 'Ana', cargo: 'Dev', avatarUrl: null, horasTotais: 10, custoTotal: 500 },
  { id: 'u2', name: 'Bruno', cargo: 'QA', avatarUrl: null, horasTotais: 6, custoTotal: 300 },
]

describe('UserRankingTable', () => {
  it('renders all users', () => {
    render(<UserRankingTable users={users} />)
    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Bruno')).toBeInTheDocument()
  })

  it('sorts by hours descending', () => {
    render(<UserRankingTable users={users} />)
    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows[0]).toHaveTextContent('Ana')
    expect(rows[1]).toHaveTextContent('Bruno')
  })

  it('shows empty state when no users', () => {
    render(<UserRankingTable users={[]} />)
    expect(screen.getByText(/sem dados/i)).toBeInTheDocument()
  })

  it('renders hours and cost', () => {
    render(<UserRankingTable users={users} />)
    expect(screen.getByText('10.0h')).toBeInTheDocument()
    expect(screen.getByText('R$ 500,00')).toBeInTheDocument()
  })
})
