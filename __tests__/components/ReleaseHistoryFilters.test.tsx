import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it } from 'vitest'
import ReleaseHistoryBrowser from '@/app/sobre/release-history-browser'
import { escolherOpcao } from '../helpers/select'
const entries = [
  { version: '1.10.0', start: '2026-11-02', end: '2026-11-02', search: '1.10.0 Permissões', current: true, content: <p>Versão nova</p> },
  { version: '1.9.0', start: '2026-10-01', end: '2026-10-15', search: '1.9.0 Instituições', current: false, content: <p>Versão anterior</p> },
]
it('busca sem acentos e ordena versões numericamente', () => {
  const { container } = render(<ReleaseHistoryBrowser entries={entries} />)
  fireEvent.click(screen.getByRole('button', { name: 'Filtros das versões' }))
  escolherOpcao(screen.getByRole('combobox', { name: 'Ordenar versões' }), 'Crescente · mais antigas')
  expect(container.querySelector('[data-release-version]')).toHaveAttribute('data-release-version', '1.10.0')
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(container.querySelector('[data-release-version]')).toHaveAttribute('data-release-version', '1.9.0')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'permissoes' } })
  expect(screen.getByText('Versão nova')).toBeInTheDocument()
  expect(screen.queryByText('Versão anterior')).not.toBeInTheDocument()
})
it('filtra datas inclusive e considera intervalos históricos', () => {
  render(<ReleaseHistoryBrowser entries={entries} />)
  fireEvent.click(screen.getByRole('button', { name: 'Filtros das versões' }))
  const from = screen.getByLabelText('Data inicial das versões')
  const to = screen.getByLabelText('Data final das versões')
  fireEvent.change(from, { target: { value: '10/10/2026' } }); fireEvent.blur(from)
  fireEvent.change(to, { target: { value: '10/10/2026' } }); fireEvent.blur(to)
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(screen.getByText('Versão anterior')).toBeInTheDocument()
  expect(screen.queryByText('Versão nova')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Filtros das versões' }))
  const newFrom = screen.getByLabelText('Data inicial das versões')
  fireEvent.change(newFrom, { target: { value: '12/11/2026' } }); fireEvent.blur(newFrom)
  expect(screen.getByRole('alert')).toHaveTextContent('data final')
})
