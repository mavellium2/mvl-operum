import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import IntegrationsWorkspace from '@/components/integracoes/IntegrationsWorkspace'
import { Input } from '@/components/ui/Field'

it('separa áreas sem perder os dados digitados ao alternar', async () => {
  const user = userEvent.setup()
  render(<IntegrationsWorkspace available={<p>Aplicativos disponíveis</p>} connections={<p>Suas conexões</p>} tokens={<Input aria-label="Nome do token" />} connectionCount={0} tokenCount={3} />)
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Aplicativos disponíveis')
  await user.click(screen.getByRole('tab', { name: /Acesso por token/ }))
  await user.type(screen.getByRole('textbox', { name: 'Nome do token' }), 'Meu computador')
  await user.click(screen.getByRole('tab', { name: /Conectar aplicativos/ }))
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: /Acesso por token/ }))
  expect(screen.getByRole('textbox')).toHaveValue('Meu computador')
})

it('abre conexões existentes e oferece navegação por teclado', async () => {
  const user = userEvent.setup()
  render(<IntegrationsWorkspace available={<p>Aplicativos disponíveis</p>} connections={<p>Suas conexões</p>} tokens={<p>Seus tokens</p>} connectionCount={2} tokenCount={1} />)
  const tab = screen.getByRole('tab', { name: /Apps conectados/ })
  expect(tab).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Suas conexões')
  tab.focus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab', { name: /Acesso por token/ })).toHaveFocus()
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Seus tokens')
})

it('pesquisa aplicativos sem depender de maiúsculas e permite limpar sem resultados', async () => {
  const user = userEvent.setup()
  const { default: IntegrationCatalog } = await import('@/components/integracoes/IntegrationCatalog')
  render(<IntegrationsWorkspace available={<IntegrationCatalog searchTexts={['ChatGPT assistente', 'Conexão Codex terminal']}><p>ChatGPT disponível</p><p>Codex disponível</p></IntegrationCatalog>} connections={<p>Conexões</p>} tokens={<p>Tokens</p>} connectionCount={0} tokenCount={0} />)
  const search = screen.getByRole('searchbox', { name: 'Pesquisar integrações' })
  await user.type(search, 'CONEXAO codex')
  expect(screen.getByText('Codex disponível')).toBeVisible()
  expect(screen.queryByText('ChatGPT disponível')).not.toBeInTheDocument()
  await user.clear(search)
  await user.type(search, 'inexistente')
  expect(screen.getByText('Nenhum aplicativo encontrado')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Limpar pesquisa' }))
  expect(search).toHaveValue('')
  expect(screen.getByText('ChatGPT disponível')).toBeVisible()
})
