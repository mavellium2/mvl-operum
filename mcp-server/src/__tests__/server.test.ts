import { describe, it, expect, beforeEach } from 'vitest'
import { setupHarness, seedSourceProject, PAT_MAV, type Harness } from './harness'

let h: Harness
let seed: Awaited<ReturnType<typeof seedSourceProject>>

beforeEach(async () => {
  h = await setupHarness()
  seed = await seedSourceProject(h)
})

describe('contrato das tools', () => {
  it('toda tool aceita tenant_id e declara readOnlyHint/destructiveHint coerentes', async () => {
    const { tools } = await h.client.listTools()
    expect(tools.length).toBeGreaterThanOrEqual(35)
    for (const tool of tools) {
      expect(tool.inputSchema.properties, tool.name).toHaveProperty('tenant_id')
      expect(tool.name).toMatch(/^operum_[a-z_]+$/)
      if (/_delete_|_remove_/.test(tool.name)) {
        expect(tool.annotations?.destructiveHint, tool.name).toBe(true)
        expect(tool.inputSchema.properties, tool.name).toHaveProperty('confirm')
      }
      if (/_(list|get)_|whoami|export/.test(tool.name)) expect(tool.annotations?.readOnlyHint, tool.name).toBe(true)
    }
  })

  it('todo parâmetro *_id/*_ids é validado (id injetado com "../" não desvia a chamada)', async () => {
    const { tools } = await h.client.listTools()
    for (const tool of tools) {
      const props = (tool.inputSchema.properties ?? {}) as Record<string, { type?: string; pattern?: string; items?: { pattern?: string } }>
      for (const [nome, prop] of Object.entries(props)) {
        if (nome === 'tenant_id') continue
        if (nome.endsWith('_id') && prop.type === 'string') expect(prop.pattern, `${tool.name}.${nome}`).toBeTruthy()
        if (nome.endsWith('_ids') && prop.type === 'array') expect(prop.items?.pattern, `${tool.name}.${nome}`).toBeTruthy()
      }
    }
    const res = await h.raw('operum_delete_task', { task_id: 'x/../../projects/p1', confirm: true })
    expect(res.isError).toBe(true)
  })

  it('servidor declara instruções de uso', async () => {
    expect(h.client.getInstructions()).toMatch(/tenant → projeto → sprint → coluna → tarefa/)
  })
})

describe('identidade e tenants', () => {
  it('whoami inclui nome do tenant e tenants configurados', async () => {
    const res = await h.call('operum_whoami')
    expect(res).toMatchObject({
      tenant_id: 't-mav',
      user: { id: 'u-vini-mav', email: 'vini@mavellium.com', role: 'admin' },
      tenant: { id: 't-mav', name: 'Mavellium' },
    })
    expect(res.configured_tenants).toHaveLength(2)
  })

  it('whoami com tenant_id responde pelo outro tenant', async () => {
    const res = await h.call('operum_whoami', { tenant_id: 't-fab' })
    expect(res).toMatchObject({ tenant_id: 't-fab', user: { id: 'u-vini-fab' }, tenant: { name: 'Fábio' } })
  })

  it('list_tenants marca quais tenants têm token', async () => {
    const h1 = await setupHarness({ tokens: [PAT_MAV] })
    const res = await h1.call('operum_list_tenants')
    expect(res.tenants).toEqual([
      expect.objectContaining({ tenant_id: 't-mav', name: 'Mavellium', has_token: true, is_default: true }),
      expect.objectContaining({ tenant_id: 't-fab', name: 'Fábio', has_token: false }),
    ])
  })

  it('tenant_id sem token → erro acionável (isError)', async () => {
    const h1 = await setupHarness({ tokens: [PAT_MAV] })
    const res = await h1.raw('operum_list_projects', { tenant_id: 't-fab' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/X-Operum-Tokens/)
  })

  it('list_users filtra, pagina e nunca expõe campos fora da whitelist', async () => {
    const res = await h.call('operum_list_users', { q: 'mavellium.com', limit: 2 })
    expect(res.total).toBe(3)
    expect(res.items).toHaveLength(2)
    expect(res.next_cursor).toBeTruthy()
    const next = await h.call('operum_list_users', { q: 'mavellium.com', limit: 2, cursor: res.next_cursor })
    expect(next.items).toHaveLength(1)
    expect(next.next_cursor).toBeNull()
    for (const u of [...(res.items as object[]), ...(next.items as object[])]) {
      expect(Object.keys(u).sort()).toEqual(['email', 'id', 'is_active', 'name', 'role'])
    }
  })
})

describe('leitura', () => {
  it('get_project traz charter, membros com e-mail, macro-fases, stakeholders e sprints com colunas', async () => {
    const res = await h.call('operum_get_project', { project_id: seed.project.id })
    expect(res.project).toMatchObject({ name: 'Operum', charter: { justificativa: 'Porque sim' } })
    expect(res.members).toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: 'u-ana-mav', email: 'ana@mavellium.com', role: 'dev', hourly_rate: 80 })]),
    )
    expect(res.macro_fases).toEqual([expect.objectContaining({ fase: 'Descoberta', custo: '1000' })])
    expect(res.stakeholders).toEqual([expect.objectContaining({ name: 'Cliente X', company: 'X S.A.' })])
    const sprints = res.sprints as { name: string; columns: { title: string }[] }[]
    expect(sprints.find(s => s.name === 'Sprint 1')!.columns.map(c => c.title)).toEqual(['Backlog da sprint', 'Fazendo', 'Feito'])
  })

  it('list_tasks delega página na origem, incluindo cards sem projectId', async () => {
    h.op.calls.length = 0
    const res = await h.call('operum_list_tasks', { project_id: seed.project.id })
    const titles = (res.items as { title: string }[]).map(t => t.title).sort()
    expect(titles).toEqual(['Dashboard', 'Ideia: modo escuro', 'Login', 'Relatório de horas'])
    const login = (res.items as Record<string, unknown>[]).find(t => t.title === 'Login')!
    expect(login).toMatchObject({ sprint_name: 'Sprint 1', column_title: 'Feito', tags: ['bug'], priority: 'alta' })
    expect(login).not.toHaveProperty('description')
    expect(h.op.calls.filter(call => call.path === '/cards/page')).toHaveLength(1)
    expect(h.op.calls.some(call => call.path === '/sprints' || call.path === '/cards/backlog' || /\/sprints\/[^/]+\/cards/.test(call.path))).toBe(false)
  })

  it('list_tasks encaminha filtros e cursor sem fazer varredura local', async () => {
    const first = await h.call('operum_list_tasks', { project_id: seed.project.id, limit: 2 })
    const second = await h.call('operum_list_tasks', { project_id: seed.project.id, limit: 2, cursor: first.next_cursor })
    expect(first.items).toHaveLength(2)
    expect(second.items).toHaveLength(2)
    expect(second.next_cursor).toBeNull()
    const requests = h.op.calls.filter(call => call.path === '/cards/page')
    expect(requests.at(-1)?.query).toMatchObject({ limit: '2', cursor: first.next_cursor })
    const ids = [...first.items as { id: string }[], ...second.items as { id: string }[]].map(card => card.id)
    expect(new Set(ids).size).toBe(4)
  })

  it('list_tasks filtra por responsável, prioridade, prazo, backlog e texto', async () => {
    const ids = async (args: Record<string, unknown>) =>
      ((await h.call('operum_list_tasks', { project_id: seed.project.id, ...args })).items as { title: string }[]).map(t => t.title)
    expect(await ids({ responsible_id: 'u-ana-mav' })).toEqual(['Login'])
    expect(await ids({ priority: 'baixa' })).toEqual(['Ideia: modo escuro'])
    expect(await ids({ due_before: '2026-01-31' })).toEqual(['Login'])
    expect(await ids({ backlog: true })).toEqual(['Ideia: modo escuro'])
    expect(await ids({ q: 'RELATÓRIO' })).toEqual(['Relatório de horas'])
  })

  it('get_task traz comentários com autor e responsáveis sem campos extras', async () => {
    const res = await h.call('operum_get_task', { task_id: seed.cards.cardA.id, include_history: true })
    const task = res.task as Record<string, unknown>
    expect(task.comments).toEqual([
      expect.objectContaining({ content: 'Primeiro comentário', author: { id: 'u-vini-mav', name: 'Vinícius' } }),
      expect.objectContaining({ content: 'Resposta da Ana', author: { id: 'u-ana-mav', name: 'Ana' } }),
    ])
    expect(task.responsibles).toEqual([{ id: 'u-ana-mav', name: 'Ana', email: 'ana@mavellium.com' }])
    expect(res.history).toEqual([])
  })

  it('isolamento: tarefa do tenant Mavellium não é visível com o token do Fábio', async () => {
    const res = await h.raw('operum_get_task', { task_id: seed.cards.cardA.id, tenant_id: 't-fab' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toBe('Não encontrado neste tenant: Tarefa.')
  })
})

describe('escrita', () => {
  it('create_task numa sprint usa a primeira coluna, herda o projeto e aplica responsáveis/tags', async () => {
    const [s1] = seed.sprints
    const res = await h.call('operum_create_task', {
      sprint_id: s1.id,
      title: 'Nova',
      end_date: '2026-03-01',
      responsible_ids: ['u-ana-mav', 'u-inexistente'],
      tag_ids: [seed.tags.tagUx.id],
    })
    const task = res.task as Record<string, unknown>
    expect(task).toMatchObject({ title: 'Nova', project_id: seed.project.id, sprint_id: s1.id, priority: 'media', end_date: '2026-03-01T00:00:00.000Z' })
    expect((task.responsibles as { id: string }[]).map(r => r.id)).toEqual(['u-ana-mav'])
    expect(res.warnings).toEqual({ responsibles_failed: [{ id: 'u-inexistente', message: 'não encontrado neste tenant' }], tags_failed: [] })
    expect(h.op.audit.at(-1)).toMatchObject({ action: 'CREATE', entity: 'card', details: { via: 'mcp', tool: 'operum_create_task' } })
  })

  it('create_task com idempotency_key não duplica', async () => {
    const args = { project_id: seed.project.id, title: 'Só uma vez', idempotency_key: 'k-1' }
    const first = await h.call('operum_create_task', args)
    const second = await h.call('operum_create_task', args)
    expect((second.task as { id: string }).id).toBe((first.task as { id: string }).id)
    expect(second.idempotent_replay).toBe(true)
    expect(h.op.cards.filter(c => c.title === 'Só uma vez')).toHaveLength(1)
  })

  it('move_task entre sprint e backlog', async () => {
    const [, s2] = seed.sprints
    const toSprint = await h.call('operum_move_task', { task_id: seed.cards.cardD.id, sprint_id: s2.id, reason: 'priorizado' })
    expect(toSprint.task).toMatchObject({ sprint_id: s2.id, in_backlog: false })
    const back = await h.call('operum_move_task', { task_id: seed.cards.cardD.id, to_backlog: true })
    expect(back.task).toMatchObject({ sprint_id: null, column_id: null, in_backlog: true })
  })

  it('delete exige confirm: true', async () => {
    const res = await h.raw('operum_delete_task', { task_id: seed.cards.cardD.id })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/confirm: true/)
    expect(h.op.cards.find(c => c.id === seed.cards.cardD.id)!.deletedAt).toBeUndefined()
    await h.call('operum_delete_task', { task_id: seed.cards.cardD.id, confirm: true })
    expect(h.op.cards.find(c => c.id === seed.cards.cardD.id)!.deletedAt).toBeTruthy()
  })

  it('bulk_update_tasks em dry_run (padrão) mostra antes/depois sem gravar', async () => {
    const res = await h.call('operum_bulk_update_tasks', {
      updates: [
        { task_id: seed.cards.cardA.id, priority: 'baixa' },
        { task_id: 'card-inexistente', priority: 'alta' },
      ],
    })
    expect(res.dry_run).toBe(true)
    expect(res.results).toEqual([
      expect.objectContaining({ task_id: seed.cards.cardA.id, ok: true, before: { priority: 'alta' }, after: { priority: 'baixa' } }),
      expect.objectContaining({ task_id: 'card-inexistente', ok: false, error: 'tarefa não encontrada neste tenant' }),
    ])
    expect(h.op.cards.find(c => c.id === seed.cards.cardA.id)!.priority).toBe('alta')

    const applied = await h.call('operum_bulk_update_tasks', { updates: [{ task_id: seed.cards.cardA.id, priority: 'baixa' }], dry_run: false })
    expect(applied.summary).toEqual({ total: 1, ok: 1, failed: 0 })
    expect(h.op.cards.find(c => c.id === seed.cards.cardA.id)!.priority).toBe('baixa')
  })

  it('set_task_tags aplica só a diferença', async () => {
    const res = await h.call('operum_set_task_tags', { task_id: seed.cards.cardA.id, tag_ids: [seed.tags.tagUx.id] })
    expect(res).toMatchObject({ added: [seed.tags.tagUx.id], removed: [seed.tags.tagBug.id], failed: [] })
  })

  it('create_sprint devolve as colunas padrão e create_comment registra auditoria', async () => {
    const res = await h.call('operum_create_sprint', { project_id: seed.project.id, name: 'Sprint 3', start_date: '2026-04-01' })
    expect((res.sprint as { columns: unknown[] }).columns).toHaveLength(4)
    await h.call('operum_create_comment', { task_id: seed.cards.cardA.id, content: 'via MCP' })
    expect(h.op.audit.map(a => a.details)).toEqual(
      expect.arrayContaining([expect.objectContaining({ tool: 'operum_create_comment' })]),
    )
  })

  it('data inválida vira erro acionável', async () => {
    const res = await h.raw('operum_update_task', { task_id: seed.cards.cardA.id, end_date: 'amanhã' })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/end_date: data inválida/)
  })
})
