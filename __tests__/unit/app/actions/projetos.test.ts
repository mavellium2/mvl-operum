// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/projectAccess', () => ({ requireProjectPermission: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/services/planilhaService', () => ({ planilhaDoProjeto: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/documentRevisionService', () => ({ submeterDocumento: vi.fn().mockResolvedValue({ id: 'versao-nova' }) }))

vi.mock('@/services/macroFaseSyncService', () => ({ reconcileMacroFases: vi.fn().mockResolvedValue({ pending: false }) }))

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  projectsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addMember: vi.fn(),
    upsertMacroFases: vi.fn(),
  },
  adminApi: {},
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    projectDraft: { deleteMany: vi.fn() },
    documentVersion: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
    sprint: { count: vi.fn().mockResolvedValue(0) },
    card: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null) },
    timeEntry: { count: vi.fn().mockResolvedValue(0) },
    ata: { count: vi.fn().mockResolvedValue(0) },
    projetoDepartamento: { findMany: vi.fn().mockResolvedValue([]) },
    userProjectRole: { findFirst: vi.fn().mockResolvedValue(null) },
    wbsNode: { findMany: vi.fn().mockResolvedValue([]) },
    user: { update: vi.fn() },
    userProject: { findFirst: vi.fn().mockResolvedValue({ role: '' }), count: vi.fn().mockResolvedValue(0) },
  },
}))

import { verifySession } from '@/lib/dal'
import { projectsApi } from '@/lib/api-client'
import prisma from '@/lib/prisma'
import {
  createProjetoAction,
  getProjetosAction,
  getProjetoAction,
  updateProjetoAction,
  deleteProjetoAction,
  verificarExclusaoProjetoAction,
  updateProjetoMemberAction,
  retryMacroFasesSyncAction,
} from '@/app/actions/projetos'
import { reconcileMacroFases } from '@/services/macroFaseSyncService'
import { requireProjectPermission } from '@/services/projectAccess'
import { ERRO_HORAS } from '@/lib/validation/horas'

const mockSession = { isAuth: true, userId: 'u1', tenantId: 't1', role: 'admin' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Projeto Actions', () => {
  describe('createProjetoAction', () => {
    it('should create project and return success', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.create).mockResolvedValue({ id: 'p1', name: 'Novo Projeto' })

      const result = await createProjetoAction({}, { name: 'Novo Projeto' })
      expect(result).toHaveProperty('projeto')
    })

    it('should return error on failure', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.create).mockRejectedValue(new Error('Validation error'))

      const result = await createProjetoAction({}, { name: '' })
      expect(result).toHaveProperty('error')
    })

    it('should return error if not authenticated', async () => {
      vi.mocked(verifySession).mockRejectedValue(new Error('Not authenticated'))

      const result = await createProjetoAction({}, { name: 'Test' })
      expect(result).toHaveProperty('error')
    })
  })

  describe('getProjetosAction', () => {
    it('should return list of projects for tenant', async () => {
      vi.mocked(projectsApi.list).mockResolvedValue({
        items: [
          { id: 'p1', name: 'Projeto 1' },
          { id: 'p2', name: 'Projeto 2' },
        ],
        total: 2,
      })

      const result = await getProjetosAction()
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('should return empty array on error', async () => {
      vi.mocked(projectsApi.list).mockRejectedValue(new Error('Auth error'))

      const result = await getProjetosAction()
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(0)
    })
  })

  describe('getProjetoAction', () => {
    it('should return single project by id', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.get).mockResolvedValue({ id: 'p1', name: 'Projeto 1', description: 'Description' })

      const result = await getProjetoAction('p1')
      expect(result).toHaveProperty('projeto')
      expect(result.projeto?.id).toBe('p1')
    })

    it('data de início vem da primeira tarefa; sem tarefa com data, a informada', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.get).mockResolvedValue({ id: 'p1', name: 'P', startDate: '2026-02-10T00:00:00.000Z' })
      vi.mocked(prisma.card.findFirst).mockResolvedValueOnce({ startDate: new Date('2026-03-02T00:00:00Z') } as never)
      let result = await getProjetoAction('p1')
      expect(result.projeto).toMatchObject({ startDate: '2026-03-02T00:00:00.000Z', inicioPelaPrimeiraTarefa: true })

      result = await getProjetoAction('p1')
      expect(result.projeto).toMatchObject({ startDate: '2026-02-10T00:00:00.000Z', inicioPelaPrimeiraTarefa: false })
    })

    it('should return error if project not found', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.get).mockResolvedValue(null as never)

      const result = await getProjetoAction('nonexistent')
      expect(result).toHaveProperty('error')
    })
  })

  describe('updateProjetoAction', () => {
    it('should update project and return success', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.update).mockResolvedValue({ id: 'p1', name: 'Updated Name' })

      const result = await updateProjetoAction({}, 'p1', { name: 'Updated Name' })
      expect(result).toHaveProperty('projeto')
    })

    it('salva os dados complementares como versão do Termo, fora do update genérico', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.update).mockResolvedValue({ id: 'p1', name: 'Nome' })
      const { submeterDocumento } = await import('@/services/documentRevisionService')
      const result = await updateProjetoAction({}, 'p1', { name: 'Nome', objetivos: 'Novo objetivo' })
      expect(result).toHaveProperty('projeto')
      expect(projectsApi.update).toHaveBeenCalledWith('p1', { name: 'Nome' })
      expect(submeterDocumento).toHaveBeenCalledWith(mockSession, 'p1', 'CHARTER', { objetivos: 'Novo objetivo' }, expect.objectContaining({ commitTitle: 'Dados complementares atualizados na edição do projeto' }))
      expect(requireProjectPermission).toHaveBeenCalledWith(mockSession, 'p1', 'documentos:aprovar')
    })

    it('should return error on update failure', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.update).mockRejectedValue(new Error('Not found'))

      const result = await updateProjetoAction({}, 'nonexistent', { name: 'Test' })
      expect(result).toHaveProperty('error')
    })
  })

  describe('deleteProjetoAction', () => {
    it('should delete project and return success', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.delete).mockResolvedValue(undefined)
      vi.mocked(prisma.projectDraft.deleteMany).mockResolvedValue({ count: 0 } as never)

      const result = await deleteProjetoAction('p1')
      expect(result).toHaveProperty('success')
      expect(result.success).toBe(true)
      // Limpa rascunhos do projeto excluído para não reaparecerem no formulário de "novo projeto".
      expect(prisma.projectDraft.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'p1', tenantId: mockSession.tenantId } }),
      )
    })

    it('bloqueia e explica quando o projeto tem dependências', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(prisma.sprint.count).mockResolvedValueOnce(2)
      vi.mocked(prisma.card.count).mockResolvedValueOnce(1)

      const result = await deleteProjetoAction('p1')

      expect(result).toMatchObject({ error: 'O projeto ainda tem 2 sprints e 1 card. Exclua, mova ou desvincule esses itens antes de excluir o projeto.' })
      expect(projectsApi.delete).not.toHaveBeenCalled()
      expect(prisma.projectDraft.deleteMany).not.toHaveBeenCalled()
    })

    it('outros membros ativos contam como dependência; o próprio usuário não', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(prisma.userProject.count).mockResolvedValueOnce(1)

      const result = await verificarExclusaoProjetoAction('p1')

      expect(result).toMatchObject({ podeExcluir: false, dependencias: [{ tipo: 'membros', quantidade: 1 }] })
      expect(prisma.userProject.count).toHaveBeenCalledWith({ where: expect.objectContaining({ projectId: 'p1', active: true, userId: { not: 'u1' } }) })
    })

    it('a verificação escopa as contagens ao tenant', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      expect(await verificarExclusaoProjetoAction('p1')).toEqual({ podeExcluir: true })
      expect(prisma.card.count).toHaveBeenCalledWith({ where: expect.objectContaining({ projectId: 'p1', deletedAt: null, project: { id: 'p1', tenantId: 't1' } }) })
    })

    it('should return error on delete failure', async () => {
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(projectsApi.delete).mockRejectedValue(new Error('Not found'))

      const result = await deleteProjetoAction('nonexistent')
      expect(result).toHaveProperty('error')
      expect(prisma.projectDraft.deleteMany).not.toHaveBeenCalled()
    })
  })
})

describe('updateProjetoMemberAction — horas por dia (SDD 4.5)', () => {
  it.each(['30', '8,555', 'oito', '0'])('recusa "%s" antes de gravar qualquer coisa', async horas => {
    vi.mocked(verifySession).mockResolvedValue(mockSession as never)
    const res = await updateProjetoMemberAction('u2', 'p1', { horasDiarias: horas })
    expect(res).toEqual({ error: ERRO_HORAS })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})

describe('macrofases — persistência e recuperação', () => {
  beforeEach(() => {
    vi.mocked(verifySession).mockResolvedValue(mockSession as never)
    vi.mocked(requireProjectPermission).mockResolvedValue(undefined)
    vi.mocked(reconcileMacroFases).mockResolvedValue({ pending: false })
    vi.mocked(projectsApi.update).mockResolvedValue({ id: 'p1', name: 'Projeto' })
  })
  it('envia projeto e lote juntos; falha da EAP retorna aviso de pendência', async () => {
    vi.mocked(reconcileMacroFases).mockResolvedValue({ pending: true, warning: 'Pendente' })
    const result = await updateProjetoAction(undefined, 'p1', { name: 'Projeto', macroFases: [{ fase: 'Fase', dataLimite: '', custo: '' }] })
    expect(projectsApi.update).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Projeto', macroFases: [{ fase: 'Fase', dataLimite: '', custo: '' }] }))
    expect(projectsApi.upsertMacroFases).not.toHaveBeenCalled()
    expect(result).toMatchObject({ projeto: { id: 'p1' }, macroFasesSync: { pending: true } })
  })
  it('recarregamento mostra lote pendente, sem ocultá-lo com EAP antiga', async () => {
    vi.mocked(projectsApi.get).mockResolvedValue({ id: 'p1', name: 'Projeto', macroFasesRevision: 2, macroFasesSyncedRevision: 1, macroFases: [{ fase: 'Nova' }] })
    expect(await getProjetoAction('p1')).toMatchObject({ projeto: { macroFasesSyncPending: true, macroFases: [{ fase: 'Nova' }] } })
  })
  it('retry valida permissões e usa só o contexto da sessão', async () => {
    expect(await retryMacroFasesSyncAction('p1')).toEqual({ pending: false })
    expect(requireProjectPermission).toHaveBeenCalledWith(mockSession, 'p1', 'projeto:editar')
    expect(requireProjectPermission).toHaveBeenCalledWith(mockSession, 'p1', 'planilha:orcado')
    expect(requireProjectPermission).toHaveBeenCalledWith(mockSession, 'p1', 'planilha:realizado-todos')
    expect(reconcileMacroFases).toHaveBeenCalledWith('p1', 't1', 'u1')
  })
  it('nega retry sem permissão, sem tocar EAP', async () => {
    vi.mocked(requireProjectPermission).mockRejectedValueOnce(new Error('Sem permissão'))
    expect(await retryMacroFasesSyncAction('p1')).toEqual({ error: 'Sem permissão' })
    expect(reconcileMacroFases).not.toHaveBeenCalled()
  })
})
