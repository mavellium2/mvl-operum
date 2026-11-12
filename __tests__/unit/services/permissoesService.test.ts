// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('react', async importOriginal => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}))
vi.mock('@/lib/prisma', () => ({
  default: {
    role: { findMany: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
    permission: { findMany: vi.fn() },
    user: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    userProject: { findUnique: vi.fn() },
    userProjectRole: { findFirst: vi.fn() },
    userPermission: { findMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))

import prisma from '@/lib/prisma'
import {
  listarAjustesDoUsuario,
  listarFuncoesComPermissoes,
  restaurarPadraoDaFuncao,
  salvarAjusteDoUsuario,
  salvarPermissoesDaFuncao,
} from '@/services/permissoesService'
import { PADRAO_MEMBRO, TODAS, PERMISSOES } from '@/lib/permissoes'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const perm = (k: string) => {
  const [resource, action] = k.split(':')
  return { permission: { resource, action } }
}
const catalogo = PERMISSOES.map(p => {
  const [resource, action] = p.chave.split(':')
  return { id: `perm_${resource}_${action}`, resource, action }
})

beforeEach(() => {
  vi.clearAllMocks()
  db.permission.findMany.mockResolvedValue(catalogo)
})

describe('listarFuncoesComPermissoes', () => {
  it('base virtual com o padrão, gerente com tudo e as demais sem padrão, gerente primeiro', async () => {
    db.role.findMany.mockResolvedValue([
      { id: 'r-po', name: 'PO', nameKey: 'po', scope: 'TENANT', permissoesDefinidasEm: null, permissions: [] },
      { id: 'r-ger', name: 'Gerente de Projeto', nameKey: 'gerente', scope: 'PROJETO', permissoesDefinidasEm: null, permissions: [] },
      { id: 'r-tl', name: 'Tech Lead', nameKey: 'tech-lead', scope: 'TENANT', permissoesDefinidasEm: new Date('2026-09-30T10:00:00Z'), permissions: [perm('quadro:sprints')] },
    ])
    const r = await listarFuncoesComPermissoes('t1')
    expect(r.map(f => f.nome)).toEqual(['Membro do projeto', 'Gerente de Projeto', 'PO', 'Tech Lead'])
    expect(r[0]).toMatchObject({ id: null, tipo: 'base', definidasEm: null, permissoes: [...PADRAO_MEMBRO] })
    expect(r[1]).toMatchObject({ tipo: 'gerente', permissoes: [...TODAS] })
    expect(r[2]).toMatchObject({ tipo: 'funcao', permissoes: [] })
    expect(r[3]).toMatchObject({ definidasEm: '2026-09-30T10:00:00.000Z', permissoes: ['quadro:sprints'] })
  })
})

describe('salvarPermissoesDaFuncao / restaurarPadraoDaFuncao', () => {
  it('função-base: cria (upsert) e grava as permissões numa transação', async () => {
    db.role.upsert.mockResolvedValue({ id: 'r-base', name: 'Membro do projeto' })
    await salvarPermissoesDaFuncao('t1', null, ['projeto:ver', 'quadro:ver'])
    expect(db.role.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { nameKey_tenantId_scope: { nameKey: 'membro-base', tenantId: 't1', scope: 'PROJETO' } },
    }))
    expect(db.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'r-base' } })
    expect(db.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'r-base', permissionId: 'perm_projeto_ver' }, { roleId: 'r-base', permissionId: 'perm_quadro_ver' }],
    })
    expect(db.role.update).toHaveBeenCalledWith({ where: { id: 'r-base' }, data: { permissoesDefinidasEm: expect.any(Date) } })
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('função de outro tenant: erro, nada gravado', async () => {
    db.role.findFirst.mockResolvedValue(null)
    await expect(salvarPermissoesDaFuncao('t1', 'r-x', ['projeto:ver'])).rejects.toThrow('Função não encontrada.')
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('catálogo ausente no banco: erro claro', async () => {
    db.permission.findMany.mockResolvedValue([])
    await expect(salvarPermissoesDaFuncao('t1', 'r-x', ['projeto:ver'])).rejects.toThrow(/migration de permissões/)
  })

  it('restaurar o padrão apaga as permissões e a marca', async () => {
    db.role.findFirst.mockResolvedValue({ id: 'r-tl', name: 'Tech Lead' })
    await restaurarPadraoDaFuncao('t1', 'r-tl')
    expect(db.rolePermission.deleteMany).toHaveBeenCalledWith({ where: { roleId: 'r-tl' } })
    expect(db.role.update).toHaveBeenCalledWith({ where: { id: 'r-tl' }, data: { permissoesDefinidasEm: null } })
  })
})

describe('ajustes por usuário', () => {
  beforeEach(() => {
    db.user.findFirst.mockResolvedValue({ id: 'u1' })
    db.project.findFirst.mockResolvedValue({ id: 'p1' })
  })

  it('no projeto: mostra o herdado sem os ajustes do projeto (com os globais)', async () => {
    db.userPermission.findMany
      .mockResolvedValueOnce([{ effect: 'DENY', ...perm('quadro:mover') }]) // ajustes do escopo
      .mockResolvedValueOnce([ // entrada: globais + projeto
        { projectId: null, effect: 'GRANT', ...perm('planilha:orcado') },
        { projectId: 'p1', effect: 'DENY', ...perm('quadro:mover') },
      ])
    db.userProject.findUnique.mockResolvedValue({ active: true, funcoes: [] })
    db.userProjectRole.findFirst.mockResolvedValue(null)
    db.role.findMany.mockResolvedValue([])
    const r = await listarAjustesDoUsuario('t1', 'u1', 'p1')
    expect(r.ajustes).toEqual({ 'quadro:mover': 'DENY' })
    expect(r.herdadas).toContain('quadro:mover') // sem o DENY do projeto
    expect(r.herdadas).toContain('planilha:orcado') // com o GRANT global
  })

  it('no global: sem "herdado" (varia por projeto)', async () => {
    db.userPermission.findMany.mockResolvedValue([])
    expect((await listarAjustesDoUsuario('t1', 'u1', null)).herdadas).toBeNull()
  })

  it('usuário de outro tenant: erro', async () => {
    db.user.findFirst.mockResolvedValue(null)
    await expect(listarAjustesDoUsuario('t1', 'u-x', null)).rejects.toThrow('Usuário não encontrado.')
    await expect(salvarAjusteDoUsuario('t1', 'u-x', null, 'projeto:ver', 'GRANT')).rejects.toThrow('Usuário não encontrado.')
  })

  it('herdar apaga; conceder cria; negar sobre um existente atualiza', async () => {
    await salvarAjusteDoUsuario('t1', 'u1', 'p1', 'quadro:mover', null)
    expect(db.userPermission.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', projectId: 'p1', permissionId: 'perm_quadro_mover' } })

    db.userPermission.findFirst.mockResolvedValueOnce(null)
    await salvarAjusteDoUsuario('t1', 'u1', null, 'planilha:orcado', 'GRANT')
    expect(db.userPermission.create).toHaveBeenCalledWith({ data: { userId: 'u1', projectId: null, permissionId: 'perm_planilha_orcado', effect: 'GRANT' } })

    db.userPermission.findFirst.mockResolvedValueOnce({ id: 'up1' })
    await salvarAjusteDoUsuario('t1', 'u1', null, 'planilha:orcado', 'DENY')
    expect(db.userPermission.update).toHaveBeenCalledWith({ where: { id: 'up1' }, data: { effect: 'DENY' } })
  })

  it('projeto de outro tenant: erro', async () => {
    db.project.findFirst.mockResolvedValue(null)
    await expect(salvarAjusteDoUsuario('t1', 'u1', 'p-x', 'projeto:ver', 'GRANT')).rejects.toThrow('Projeto não encontrado.')
    await expect(listarAjustesDoUsuario('t1', 'u1', 'p-x')).rejects.toThrow('Projeto não encontrado.')
    expect(db.userPermission.findMany).not.toHaveBeenCalled()
  })
})
