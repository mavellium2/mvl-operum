import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '../server'
import { TenantRegistry, clearIdentityCache } from '../tenants'
import { clearIdempotencyStore } from '../idempotency'
import { FakeOperum } from './fakeOperum'
import type { Downloader } from '../download'

export const PAT_MAV = 'opr_pat_MavelliumMavelliumMav1'
export const PAT_FAB = 'opr_pat_FabioFabioFabioFabio12'

export interface Harness {
  op: FakeOperum
  client: Client
  /** Chama a tool e devolve o structuredContent (ou lança com o texto do erro). */
  call: (name: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>
  /** Chama a tool e devolve o resultado bruto (para testar isError). */
  raw: (name: string, args?: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[]; structuredContent?: Record<string, unknown> }>
}

/**
 * Dois tenants: Mavellium (tenant padrão, Vinícius admin, Ana, Bruno) e Fábio
 * (Vinícius e Ana existem por e-mail; Bruno não). Tokens do Vinícius nos dois.
 */
export async function setupHarness(opts: { tokens?: string[]; download?: Downloader } = {}): Promise<Harness> {
  // Sem espera real entre chamadas nos testes (o throttle é testado à parte).
  process.env.OPERUM_MCP_RPS = '1000000'
  clearIdentityCache()
  clearIdempotencyStore()
  const op = new FakeOperum()
  op.addTenant('t-mav', 'Mavellium')
  op.addTenant('t-fab', 'Fábio')
  op.addUser({ id: 'u-vini-mav', tenantId: 't-mav', name: 'Vinícius', email: 'vini@mavellium.com', role: 'admin' })
  op.addUser({ id: 'u-ana-mav', tenantId: 't-mav', name: 'Ana', email: 'ana@mavellium.com' })
  op.addUser({ id: 'u-bruno-mav', tenantId: 't-mav', name: 'Bruno', email: 'bruno@mavellium.com' })
  op.addUser({ id: 'u-vini-fab', tenantId: 't-fab', name: 'Vinícius', email: 'vini@mavellium.com', role: 'member' })
  op.addUser({ id: 'u-ana-fab', tenantId: 't-fab', name: 'Ana F.', email: 'ANA@mavellium.com' })

  const tokenUser: Record<string, string> = { [PAT_MAV]: 'u-vini-mav', [PAT_FAB]: 'u-vini-fab' }
  const registry = new TenantRegistry(opts.tokens ?? [PAT_MAV, PAT_FAB], t => op.gateway(tokenUser[t]))
  const server = buildServer(registry, {
    attachments: { download: opts.download ?? (async () => { throw new Error('download não configurado no teste') }) },
  })
  const client = new Client({ name: 'test', version: '1.0.0' })
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])

  const raw: Harness['raw'] = async (name, args = {}) => (await client.callTool({ name, arguments: args })) as never
  const call: Harness['call'] = async (name, args = {}) => {
    const res = await raw(name, args)
    if (res.isError) throw new Error(res.content[0]?.text)
    return res.structuredContent!
  }
  return { op, client, call, raw }
}

/**
 * Projeto "Operum" completo na Mavellium: 2 sprints (uma com 3 colunas, outra
 * com 5 — testa a reconciliação com as 4 colunas padrão), backlog, etiquetas,
 * responsáveis (Bruno não existe no tenant do Fábio) e comentários.
 */
export async function seedSourceProject(h: Harness) {
  const { op } = h
  const gw = op.gateway('u-vini-mav')
  const project = await gw.post<Record<string, string>>('/projects', {
    name: 'Operum',
    description: 'Gestão de projetos',
    startDate: '2026-01-05T00:00:00.000Z',
    justificativa: 'Porque sim',
  })
  await gw.post(`/projects/${project.id}/members`, { userId: 'u-vini-mav', funcoes: ['gerente'] })
  await gw.post(`/projects/${project.id}/members`, { userId: 'u-ana-mav', funcoes: ['dev'], hourlyRate: 80 })
  await gw.post(`/projects/${project.id}/members`, { userId: 'u-bruno-mav', funcoes: ['qa'] })
  await gw.post(`/projects/${project.id}/macro-fases`, { fases: [{ fase: 'Descoberta', dataLimite: '2026-02-01', custo: '1000' }] })
  const sh = await gw.post<Record<string, string>>('/stakeholders', { name: 'Cliente X', company: 'X S.A.' })
  await gw.post(`/stakeholders/${sh.id}/projects/${project.id}`)

  const tagBug = await gw.post<Record<string, string>>('/tags', { name: 'bug', color: '#ef4444' })
  const tagUx = await gw.post<Record<string, string>>('/tags', { name: 'ux', color: '#3b82f6' })

  // Sprint 1: 3 colunas próprias (renomeia 3 padrão, remove 1)
  const s1 = await gw.post<Record<string, string>>('/sprints', { projectId: project.id, name: 'Sprint 1', status: 'COMPLETED' })
  const s1cols = await gw.get<Record<string, string>[]>(`/sprints/${s1.id}/columns`)
  await gw.patch(`/sprints/${s1.id}/columns/${s1cols[0].id}`, { title: 'Backlog da sprint' })
  await gw.patch(`/sprints/${s1.id}/columns/${s1cols[1].id}`, { title: 'Fazendo' })
  await gw.patch(`/sprints/${s1.id}/columns/${s1cols[2].id}`, { title: 'Feito' })
  await gw.delete(`/sprints/${s1.id}/columns/${s1cols[3].id}`)

  // Sprint 2: 4 padrão + 1 extra
  const s2 = await gw.post<Record<string, string>>('/sprints', { projectId: project.id, name: 'Sprint 2', status: 'ACTIVE' })
  const s2cols = await gw.get<Record<string, string>[]>(`/sprints/${s2.id}/columns`)
  const s2extra = await gw.post<Record<string, string>>(`/sprints/${s2.id}/columns`, { title: 'Homologação', position: 4 })

  const cardA = await gw.post<Record<string, string>>('/cards', {
    sprintId: s1.id, sprintColumnId: s1cols[2].id, title: 'Login', priority: 'alta', endDate: '2026-01-20T00:00:00.000Z',
  })
  const cardB = await gw.post<Record<string, string>>('/cards', { sprintId: s2.id, sprintColumnId: s2extra.id, title: 'Dashboard' })
  const cardC = await gw.post<Record<string, string>>('/cards', { sprintId: s2.id, sprintColumnId: s2cols[1].id, title: 'Relatório de horas' })
  const cardD = await gw.post<Record<string, string>>('/cards', { projectId: project.id, title: 'Ideia: modo escuro', priority: 'baixa' })

  await gw.post(`/cards/${cardA.id}/tags/${tagBug.id}`)
  await gw.post(`/cards/${cardB.id}/tags/${tagUx.id}`)
  await gw.post(`/cards/${cardA.id}/responsibles/u-ana-mav`)
  await gw.post(`/cards/${cardB.id}/responsibles/u-bruno-mav`)
  await gw.post(`/cards/${cardC.id}/responsibles/u-vini-mav`)
  await gw.post(`/cards/${cardA.id}/comments`, { content: 'Primeiro comentário' })
  await op.gateway('u-ana-mav').post(`/cards/${cardA.id}/comments`, { content: 'Resposta da Ana' })

  op.calls.length = 0
  return { project, sprints: [s1, s2], cards: { cardA, cardB, cardC, cardD }, tags: { tagBug, tagUx } }
}
