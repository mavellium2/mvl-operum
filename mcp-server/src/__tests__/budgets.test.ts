import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerBudgetTools } from '../tools/budgets'
import { z } from 'zod'

const registered = vi.hoisted(() => new Map<string, { schema: z.ZodRawShape; run: (a: unknown, c: unknown) => Promise<unknown> }>())
vi.mock('../tool.js', async importOriginal => ({
  ...await importOriginal<typeof import('../tool.js')>(),
  defineTool: (_s: unknown, _r: unknown, name: string, def: { inputSchema: z.ZodRawShape }, run: never) => registered.set(name, { schema: def.inputSchema, run }),
}))
beforeEach(() => { registered.clear(); registerBudgetTools({} as never, {} as never) })
describe('ferramentas de orçamento', () => {
  it('consulta e grava via gateway autenticado em minutos', async () => {
    const ctx = { gw: { get: vi.fn().mockResolvedValue({ estimated_minutes: 0 }), patch: vi.fn().mockResolvedValue({ estimated_minutes: 120 }) } }
    await registered.get('operum_get_task_budget')!.run({ task_id: 'c1' }, ctx)
    expect(ctx.gw.get).toHaveBeenCalledWith('/cards/c1/budget')
    await registered.get('operum_set_task_budget')!.run({ task_id: 'c1', estimated_minutes: 120 }, ctx)
    expect(ctx.gw.patch).toHaveBeenCalledWith('/cards/c1/budget', { estimated_minutes: 120 })
  })
  it('valida ids e minutos antes da chamada', () => {
    const schema = z.object(registered.get('operum_set_task_budget')!.schema)
    expect(schema.safeParse({ task_id: 'c1', estimated_minutes: 0 }).success).toBe(true)
    for (const estimated_minutes of [-1, 0.5, Infinity, '60']) expect(schema.safeParse({ task_id: 'c1', estimated_minutes }).success).toBe(false)
    expect(schema.safeParse({ task_id: '../auth', estimated_minutes: 60 }).success).toBe(false)
  })
})

describe('ferramentas de materiais e data realizada', () => {
  it('usa o gateway autenticado e preserva zero e retirada explícita de data', async () => {
    const ctx = { gw: { get: vi.fn().mockResolvedValue({}), patch: vi.fn().mockResolvedValue({}) } }
    await registered.get('operum_get_task_costs')!.run({ task_id: 'c1' }, ctx)
    expect(ctx.gw.get).toHaveBeenCalledWith('/cards/c1/costs')
    await registered.get('operum_set_task_costs')!.run({ task_id: 'c1', actual_materials: 0, completed_on: null }, ctx)
    expect(ctx.gw.patch).toHaveBeenCalledWith('/cards/c1/costs', { actual_materials: 0, completed_on: null })
  })
  it('rejeita datas impossíveis, custos negativos e ids inválidos', () => {
    const schema = z.object(registered.get('operum_set_task_costs')!.schema)
    expect(schema.safeParse({ task_id: 'c1', actual_materials: 45, completed_on: '2026-10-26' }).success).toBe(true)
    for (const input of [{ task_id: '../auth' }, { task_id: 'c1', actual_materials: -1 }, { task_id: 'c1', completed_on: '2026-02-30' }]) expect(schema.safeParse(input).success).toBe(false)
  })
})
