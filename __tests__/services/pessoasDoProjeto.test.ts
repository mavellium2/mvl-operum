// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const db = vi.hoisted(() => {
  const fn = () => vi.fn()
  const m = {
    stakeholder: { findFirst: fn(), create: fn(), update: fn() },
    user: { findFirst: fn() },
    userProject: { findFirst: fn(), update: fn(), upsert: fn() },
    userProjectFuncao: { upsert: fn() },
    projectStakeholderFuncao: { upsert: fn(), deleteMany: fn() },
    role: { findMany: fn(), update: fn(), upsert: fn() },
    userProjectRole: { findFirst: fn() },
    projectStakeholder: { findFirst: fn(), findUnique: fn(), upsert: fn(), update: fn(), delete: fn() },
    $transaction: vi.fn(),
  }
  m.$transaction.mockImplementation((f: (tx: unknown) => unknown) => f(m))
  return m
})
vi.mock('@/lib/prisma', () => ({ default: db }))

import { adicionarUsuarioComoExterno, PessoaError, salvarDadosDoExterno, tornarExterno, tornarInterno } from '@/services/pessoasDoProjeto'

beforeEach(() => {
  vi.clearAllMocks()
  db.$transaction.mockImplementation((f: (tx: unknown) => unknown) => f(db))
  db.projectStakeholder.findFirst.mockResolvedValue(null)
})

describe('uma pessoa, interna ou externa em cada projeto', () => {
  it('interno → externo: leva remuneração, horas, funções e departamento e sai da equipe', async () => {
    db.userProject.findFirst.mockResolvedValue({ id: 'up1', remuneracao: 3000, horasDiarias: 6, department: { name: 'TI' }, funcoes: [{ roleId: 'r-back' }, { roleId: 'r-qa' }] })
    db.projectStakeholder.upsert.mockResolvedValue({ id: 'ps9' })
    db.userProjectRole.findFirst.mockResolvedValue(null)
    db.stakeholder.findFirst.mockResolvedValue({ id: 'sk1', userId: 'u1' })
    await tornarExterno('t1', 'p1', 'u1')
    expect(db.projectStakeholder.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId_stakeholderId: { projectId: 'p1', stakeholderId: 'sk1' } },
      update: { remuneracao: 3000, horasDiarias: 6, departamentos: ['TI'] },
    }))
    // As mesmas funções do cadastro, por id (nunca texto).
    expect(db.projectStakeholderFuncao.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { projectStakeholderId: 'ps9', roleId: 'r-back', ordem: 0 } }))
    expect(db.projectStakeholderFuncao.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { projectStakeholderId: 'ps9', roleId: 'r-qa', ordem: 1 } }))
    expect(db.userProject.update).toHaveBeenCalledWith({ where: { id: 'up1' }, data: { active: false, inactiveReason: null, inactivatedAt: null } })
  })

  it('o gerente não vira externo', async () => {
    db.userProject.findFirst.mockResolvedValue({ id: 'up1', role: null, department: null })
    db.userProjectRole.findFirst.mockResolvedValue({ id: 'r1' })
    await expect(tornarExterno('t1', 'p1', 'u1')).rejects.toThrow(/gerente/)
    expect(db.userProject.update).not.toHaveBeenCalled()
  })

  it('cria o contato da conta na primeira vez que ela vira externa', async () => {
    db.userProject.findFirst.mockResolvedValue(null)
    db.stakeholder.findFirst.mockResolvedValue(null)
    db.user.findFirst.mockResolvedValue({ name: 'Paulo', email: 'paulo@x.com', phone: null, avatarUrl: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null })
    db.stakeholder.create.mockResolvedValue({ id: 'sk9', userId: 'u1' })
    await adicionarUsuarioComoExterno('t1', 'p1', 'u1')
    expect(db.stakeholder.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 't1', userId: 'u1', name: 'Paulo', email: 'paulo@x.com' }) })
    expect(db.projectStakeholder.upsert).toHaveBeenCalled()
  })

  it('não adiciona como externo quem já é membro ativo do projeto', async () => {
    db.userProject.findFirst.mockResolvedValue({ id: 'up1' })
    await expect(adicionarUsuarioComoExterno('t1', 'p1', 'u1')).rejects.toBeInstanceOf(PessoaError)
  })

  it('externo → interno: vira membro com remuneração e horas e sai das partes interessadas', async () => {
    db.stakeholder.findFirst.mockResolvedValue({ id: 'sk1', userId: 'u1' })
    db.projectStakeholder.findUnique.mockResolvedValue({ id: 'ps1', remuneracao: 3000, horasDiarias: 6, funcoes: [{ roleId: 'r-cli' }] })
    db.userProject.upsert.mockResolvedValue({ id: 'up7' })
    await tornarInterno('t1', 'p1', 'sk1')
    expect(db.userProject.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_projectId: { userId: 'u1', projectId: 'p1' } },
      update: expect.objectContaining({ active: true, remuneracao: 3000, horasDiarias: 6, hourlyRate: 3000 / 30 / 6 }),
    }))
    expect(db.userProjectFuncao.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { userProjectId: 'up7', roleId: 'r-cli', ordem: 0 } }))
    expect(db.projectStakeholder.delete).toHaveBeenCalledWith({ where: { id: 'ps1' } })
  })

  it('contato sem login: pede a conta e, com ela, liga ao contato', async () => {
    db.stakeholder.findFirst.mockResolvedValueOnce({ id: 'sk1', userId: null })
    await expect(tornarInterno('t1', 'p1', 'sk1')).rejects.toThrow('SEM_CONTA')
    db.stakeholder.findFirst.mockResolvedValueOnce({ id: 'sk1', userId: null }).mockResolvedValueOnce(null)
    db.user.findFirst.mockResolvedValue({ id: 'u-novo' })
    db.projectStakeholder.findUnique.mockResolvedValue(null)
    db.userProject.upsert.mockResolvedValue({ id: 'up8' })
    await tornarInterno('t1', 'p1', 'sk1', 'u-novo')
    expect(db.stakeholder.update).toHaveBeenCalledWith({ where: { id: 'sk1' }, data: { userId: 'u-novo' } })
    expect(db.userProject.upsert).toHaveBeenCalled()
  })

  it('salva os dados do externo no vínculo com o projeto', async () => {
    db.projectStakeholder.findFirst.mockResolvedValue({ id: 'ps1' })
    db.role.findMany.mockResolvedValue([{ id: 'r-qa', name: 'QA', deletedAt: null }])
    await salvarDadosDoExterno('t1', 'p1', 'sk1', { remuneracao: 2500, horasDiarias: 8, funcoes: [' QA ', 'QA', ''], departamentos: ['TI'] })
    expect(db.projectStakeholder.update).toHaveBeenCalledWith({ where: { id: 'ps1' }, data: { remuneracao: 2500, horasDiarias: 8, departamentos: ['TI'] } })
    // Funções: um vínculo por função do cadastro, sem repetida.
    expect(db.projectStakeholderFuncao.upsert).toHaveBeenCalledTimes(1)
    expect(db.projectStakeholderFuncao.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { projectStakeholderId: 'ps1', roleId: 'r-qa', ordem: 0 } }))
  })
})
