import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import IntegrationGuideCard from '@/components/integracoes/IntegrationGuideCard'

it('abre instruções em um diálogo separado sem expandir o card da grade', async () => {
  const user = userEvent.setup()
  render(<IntegrationGuideCard guide={{ id: 'app', name: 'App', logo: 'openai', surface: 'Seu assistente', description: 'Conecte seus projetos.', method: 'OAuth' }}><h3>Passo a passo</h3><p>Instruções de conexão</p></IntegrationGuideCard>)
  expect(screen.queryByText('Instruções de conexão')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Como conectar App' }))
  expect(screen.getByRole('dialog', { name: 'Conectar App' })).toBeInTheDocument()
  expect(screen.getByText('Instruções de conexão')).toBeVisible()
  await user.click(screen.getAllByRole('button', { name: 'Fechar guia', exact: true })[0])
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
