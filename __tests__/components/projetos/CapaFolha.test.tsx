import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useParams: () => ({ projetoId: 'p1' }) }))

import { CapaFolha } from '@/components/projetos/documentacao/CapaDocumento'
import { capaPadrao } from '@/lib/capaPadrao'

describe('CapaFolha', () => {
  it('mostra "E-mails:" antes do e-mail, na mesma linha', () => {
    const capa = { ...capaPadrao({ semestre: '2', ano: 2026 }), email: 'buddyy@gmail.com' }
    const { container } = render(<CapaFolha capa={capa} nomeProjeto="Buddy" integrantes={['Ana']} />)
    const linha = container.querySelector('[data-capa-campo="email"]')!
    expect(linha.textContent).toBe('E-mails:buddyy@gmail.com')
    expect(screen.getByText('E-mails:')).toBeTruthy()
    expect(screen.getByText('CURSO SUPERIOR DE...')).toBeTruthy()
  })
  it('sem e-mail, a linha não aparece fora da edição', () => {
    const capa = capaPadrao({ semestre: '2', ano: 2026 })
    const { container } = render(<CapaFolha capa={capa} nomeProjeto="Buddy" integrantes={[]} />)
    expect(container.querySelector('[data-capa-campo="email"]')).toBeNull()
  })
})
