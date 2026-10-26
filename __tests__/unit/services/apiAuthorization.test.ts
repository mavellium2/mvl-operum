// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizeApi, ApiAccessDenied } from '@/services/apiAuthorization'
import { exigirPermissao, can, projetosAutorizados } from '@/services/authz'
import prisma from '@/lib/prisma'

vi.mock('@/services/authz', () => ({
  exigirPermissao: vi.fn(), can: vi.fn().mockResolvedValue(true), projetosAutorizados: vi.fn(),
  SemPermissaoError: class extends Error {},
}))
vi.mock('@/lib/prisma', () => ({ default: {
  sprint: { findFirst: vi.fn() }, card: { findFirst: vi.fn() },
  sprintColumn: { findUnique: vi.fn() }, timeEntry: { findFirst: vi.fn() },
  documentVersion: { findFirst: vi.fn().mockResolvedValue(null) },
  projectStakeholder: { findMany: vi.fn() }, $queryRaw: vi.fn(),
} }))
const session = { userId: 'user-A', tenantId: 'tenant-A', role: 'member' }
const require = vi.mocked(exigirPermissao)
let granted: Set<string>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.documentVersion.findFirst).mockResolvedValue(null)
  vi.mocked(can).mockResolvedValue(true)
  granted = new Set(['projeto:ver','quadro:ver','quadro:cards','quadro:mover'])
  require.mockImplementation(async (_s, project, permission) => {
    if (project === 'outside' || !granted.has(permission)) throw new ApiAccessDenied()
  })
  vi.mocked(projetosAutorizados).mockResolvedValue(['project-A'])
  vi.mocked(prisma.card.findFirst).mockResolvedValue({ projectId: 'project-A', sprint: null } as never)
  vi.mocked(prisma.sprint.findFirst).mockResolvedValue({ projectId: 'project-A' } as never)
  vi.mocked(prisma.sprintColumn.findUnique).mockResolvedValue({ sprintId: 'sprint-A' } as never)
  vi.mocked(prisma.projectStakeholder.findMany).mockResolvedValue([{ projectId: 'project-A' }] as never)
  vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue({ cardId: 'card-A', userId: 'user-A' } as never)
  vi.mocked(prisma.$queryRaw).mockResolvedValue([{ cardId: 'card-A' }])
})

describe('escopo de leitura', () => {
  it('autoriza página apenas com projeto/sprint e leitura do quadro', async () => {
    await expect(authorizeApi(session, 'GET', '/cards/page?projectId=project-A&sprintId=sprint-A')).resolves.toEqual({ allowed: true })
    await expect(authorizeApi(session, 'GET', '/cards/page')).rejects.toThrow()
    await expect(authorizeApi(session, 'GET', '/cards/page?projectId=outside')).rejects.toThrow()
    await expect(authorizeApi(session, 'GET', '/cards/page?projectId=project-B&sprintId=sprint-A')).rejects.toThrow()
    granted.delete('quadro:ver')
    await expect(authorizeApi(session, 'GET', '/cards/page?sprintId=sprint-A')).rejects.toThrow()
  })
  it.each(['/projects','/projects/user/user-B','/sprints','/cards/search?q=abc'])('retorna IDs autorizados para %s', async path => {
    expect(await authorizeApi(session, 'GET', path)).toEqual({ allowed: true, projectIds: ['project-A'] })
  })
  it('oculta documentos no GET genérico quando documentos:ver foi negado', async () => {
    vi.mocked(can).mockResolvedValue(false)
    expect(await authorizeApi(session, 'GET', '/projects/project-A')).toEqual({ allowed: true, redactDocuments: true })
  })
  it('preserva IDs com letras maiúsculas', async () => {
    await authorizeApi(session, 'GET', '/projects/Project-A')
    expect(require).toHaveBeenCalledWith(session, 'Project-A', 'projeto:ver')
  })
  it('busca card no tenant e na sprint/projeto ativos', async () => {
    await authorizeApi(session, 'GET', '/cards/card-A')
    expect(prisma.card.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, OR: expect.arrayContaining([expect.objectContaining({ sprintId: null, project: { tenantId: 'tenant-A', deletedAt: null } })]) }) }))
  })
  it('recusa card inexistente antes de autorizar', async () => {
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null)
    await expect(authorizeApi(session, 'GET', '/cards/card-A')).rejects.toThrow()
  })
  it('recusa projeto de fora inclusive para admin', async () => {
    await expect(authorizeApi({ ...session, role: 'admin' }, 'GET', '/projects/outside')).rejects.toThrow()
  })
  it('nega leitura do quadro quando projeto:ver foi revogado', async () => {
    granted.delete('projeto:ver')
    await expect(authorizeApi(session, 'GET', '/cards/card-A')).rejects.toThrow()
  })
  it.each(['/projects/Project%2fother', '/projects/%zz','/unknown'])('nega caminho não suportado %s', async path => {
    await expect(authorizeApi(session, 'GET', path)).rejects.toThrow()
  })
})

describe('escritas e destinos persistidos', () => {
  it('orçamento exige permissões financeiras em vez de edição do quadro', async () => {
    granted.delete('quadro:cards')
    await expect(authorizeApi(session, 'GET', '/cards/card-A/budget')).rejects.toThrow()
    granted.add('planilha:ver')
    await expect(authorizeApi(session, 'GET', '/cards/card-A/budget')).resolves.toEqual({ allowed: true })
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A/budget', { estimated_minutes: 60 })).rejects.toThrow()
    granted.add('planilha:orcado')
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A/budget', { estimated_minutes: 60 })).resolves.toEqual({ allowed: true })
    await expect(authorizeApi(session, 'DELETE', '/cards/card-A/budget')).rejects.toThrow()
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A/budget/extra')).rejects.toThrow()
  })
  it('mover não exige editar card; reason/sprintPosition são campos de movimento', async () => {
    granted.delete('quadro:cards')
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A', { sprintColumnId: 'column-A', sprintPosition: 3, reason: 'entrega', userId: 'user-A' })).resolves.toEqual({ allowed: true })
  })
  it('mover e editar exige ambas as permissões', async () => {
    granted.delete('quadro:cards')
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A', { sprintColumnId: 'column-A', title: 'alterado' })).rejects.toThrow()
  })
  it('trocar sprint exige permissão também no destino', async () => {
    vi.mocked(prisma.sprint.findFirst).mockResolvedValue({ projectId: 'outside' } as never)
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A', { sprintId: 'sprint-B' })).rejects.toThrow()
  })
  it('coluna de outro projeto não passa como destino', async () => {
    vi.mocked(prisma.sprint.findFirst).mockResolvedValue({ projectId: 'outside' } as never)
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A', { sprintColumnId: 'column-B' })).rejects.toThrow()
  })
  it.each([
    ['DELETE','/cards/card-A',{},'quadro:excluir'],
    ['POST','/sprints',{ projectId: 'project-A' },'quadro:sprints'],
    ['POST','/cards/card-A/comments',{ content: 'texto' },'quadro:cards'],
    ['POST','/cards/card-A/time-entries/start',{},'quadro:cards'],
    ['PATCH','/files/file-A/cover',{},'quadro:cards'],
    ['POST','/projects/project-A/members',{ userId: 'user-B' },'projeto:equipe'],
  ] as const)('%s %s usa %s', async (method, path, body, permission) => {
    granted.delete(permission)
    await expect(authorizeApi(session, method, path, body)).rejects.toThrow()
    granted.add(permission)
    await expect(authorizeApi(session, method, path, body)).resolves.toEqual({ allowed: true })
  })
  it('metadados de charter não contornam aprovação pelo update genérico', async () => {
    granted.add('projeto:editar'); granted.add('documentos:editar')
    await expect(authorizeApi(session, 'PATCH', '/projects/project-A', { objetivos: 'texto' })).rejects.toThrow()
    granted.add('documentos:aprovar')
    await expect(authorizeApi(session, 'PATCH', '/projects/project-A', { objetivos: 'texto' })).resolves.toEqual({ allowed: true })
  })
  it('update genérico não sobrescreve um Termo já publicado por snapshot', async () => {
    granted.add('projeto:editar'); granted.add('documentos:editar'); granted.add('documentos:aprovar')
    vi.mocked(prisma.documentVersion.findFirst).mockResolvedValue({ id: 'approved' } as never)
    await expect(authorizeApi(session, 'PATCH', '/projects/project-A', { objetivos: 'Sobrescrever' })).rejects.toThrow(/fluxo documental/)
  })
  it('alterar papéis/cargos permanece exclusivo do administrador', async () => {
    granted.add('projeto:equipe')
    await expect(authorizeApi(session, 'POST', '/projects/project-A/members', { userId: 'user-A', role: 'Gerente' })).rejects.toThrow()
    await expect(authorizeApi(session, 'POST', '/projects/project-A/roles', { roleId: 'role-A' })).rejects.toThrow()
  })
  it('maiúsculas no caminho não contornam a regra de papéis (Express roteia sem diferenciar)', async () => {
    granted.add('projeto:equipe')
    granted.add('projeto:editar')
    await expect(authorizeApi(session, 'POST', '/projects/project-A/Roles', { roleId: 'role-A' })).rejects.toThrow()
    await expect(authorizeApi(session, 'POST', '/Projects/project-A/MEMBERS', { userId: 'user-A', role: 'Gerente' })).rejects.toThrow()
    await expect(authorizeApi(session, 'POST', '/projects/project-A/Members', { userId: 'user-A', isGerente: true })).rejects.toThrow()
  })
  it('palavras-chave do segundo segmento também ignoram maiúsculas', async () => {
    expect(await authorizeApi(session, 'GET', '/Cards/Search?q=abc')).toEqual({ allowed: true, projectIds: ['project-A'] })
  })
  it.each(['/roles','/permissions','/departments'])('cadastro global %s não aceita membros', async path => {
    await expect(authorizeApi(session, 'POST', path, {})).rejects.toThrow()
  })
  it('editar stakeholder compartilhado verifica todos os projetos afetados', async () => {
    granted.add('projeto:equipe')
    vi.mocked(prisma.projectStakeholder.findMany).mockResolvedValue([{ projectId: 'project-A' }, { projectId: 'outside' }] as never)
    await expect(authorizeApi(session, 'PATCH', '/stakeholders/stakeholder-A?projectId=project-A', { name: 'novo' })).rejects.toThrow()
  })
  it('recusa contexto não vinculado ao stakeholder', async () => {
    granted.add('projeto:equipe')
    await expect(authorizeApi(session, 'PATCH', '/stakeholders/stakeholder-A?projectId=project-B')).rejects.toThrow()
  })
  it('permite parar o próprio timer após revogar edição', async () => {
    granted.delete('quadro:cards')
    await expect(authorizeApi(session, 'POST', '/time-entries/entry-A/stop')).resolves.toEqual({ allowed: true })
  })
  it('não permite parar timer de outra pessoa sem autorização', async () => {
    vi.mocked(prisma.timeEntry.findFirst).mockResolvedValue({ cardId: 'card-A', userId: 'other' } as never)
    await expect(authorizeApi(session, 'POST', '/time-entries/entry-A/stop')).rejects.toThrow()
  })
  it('não permite lote com card invisível', async () => {
    vi.mocked(prisma.card.findFirst).mockResolvedValueOnce({ projectId: 'outside', sprint: null } as never)
    await expect(authorizeApi(session, 'POST', '/cards/in-tenant', { ids: ['card-B'] })).rejects.toThrow()
  })
})

describe('projeto e macrofases no mesmo PATCH', () => {
  it('requer as permissões de custo, inclusive para lote vazio', async () => {
    granted.add('projeto:editar')
    await expect(authorizeApi(session, 'PATCH', '/projects/project-A', { macroFases: [] })).rejects.toThrow()
    granted.add('planilha:orcado')
    granted.add('planilha:realizado-todos')
    expect(await authorizeApi(session, 'PATCH', '/projects/project-A', { macroFases: [] })).toEqual({ allowed: true })
  })
})

describe('dashboards — escopo de quadros e custos', () => {
  it('global cruza conjuntos de leitura sem ampliar escopo', async () => {
    vi.mocked(projetosAutorizados).mockImplementation(async (_session, permission) => permission === 'quadro:ver' ? ['visible', 'board-only'] : ['visible', 'cost-only'])
    expect(await authorizeApi(session, 'GET', '/dashboard/global')).toEqual({ allowed: true, projectIds: ['visible'] })
    await expect(authorizeApi(session, 'POST', '/dashboard/global')).rejects.toThrow()
  })
  it('sprint exige leitura de custos além do quadro', async () => {
    await expect(authorizeApi(session, 'GET', '/sprints/s1/dashboard')).rejects.toThrow()
    granted.add('planilha:ver')
    expect(await authorizeApi(session, 'GET', '/sprints/s1/dashboard')).toEqual({ allowed: true })
  })
})

describe('custos pelo gateway', () => {
  it('exige leitura financeira e reserva autorização de cada campo ao serviço canônico', async () => {
    granted.delete('planilha:ver')
    await expect(authorizeApi(session, 'GET', '/cards/card-A/costs')).rejects.toThrow()
    granted.add('planilha:ver')
    await expect(authorizeApi(session, 'GET', '/cards/card-A/costs')).resolves.toEqual({ allowed: true })
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A/costs', { actual_materials: 45 })).resolves.toEqual({ allowed: true })
    await expect(authorizeApi(session, 'DELETE', '/cards/card-A/costs')).rejects.toThrow()
    await expect(authorizeApi(session, 'PATCH', '/cards/card-A/costs/extra')).rejects.toThrow()
  })
})
