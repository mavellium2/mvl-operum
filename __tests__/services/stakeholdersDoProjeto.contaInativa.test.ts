// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/projectRoleService', () => ({ getProjectRoleForMember: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/projectAccess', () => ({ findById: vi.fn().mockResolvedValue({ id: 'p1' }) }))
const { membro } = vi.hoisted(() => ({
  membro: (userId: string, active: boolean, contaAtiva: boolean, inactiveReason: string | null) => ({
    userId, active, role: null, remuneracao: null, horasDiarias: null, hourlyRate: null, startDate: new Date(), inactiveReason, inactivatedAt: active ? null : new Date(), department: null,
    user: { id: userId, name: userId, email: `${userId}@x.com`, avatarUrl: null, role: 'member', phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null, deletedAt: null, isActive: contaAtiva, signatureUrl: null, contato: null },
  }),
}))
vi.mock('@/lib/prisma', () => ({ default: {
  projectStakeholder: { findMany: vi.fn().mockResolvedValue([]) },
  stakeholder: { findMany: vi.fn().mockResolvedValue([]) },
  userProject: { findMany: vi.fn().mockResolvedValue([
    // Inativado no projeto e depois com a conta desativada: não pode sumir.
    membro('inativo-no-projeto', false, false, 'Saiu da equipe'),
    // Conta desativada antes da regra nova (vínculo ainda ativo): aparece como inativo.
    membro('conta-antiga', true, false, null),
    membro('ativo', true, true, null),
  ]) },
  user: { findMany: vi.fn().mockResolvedValue([]) },
  role: { findMany: vi.fn().mockResolvedValue([]) },
  department: { findMany: vi.fn().mockResolvedValue([]) },
} }))

import { carregarStakeholdersDoProjeto } from '@/services/stakeholdersDoProjeto'

describe('conta desativada no sistema continua no projeto', () => {
  it('aparece como inativa, com o motivo, em vez de sumir', async () => {
    const d = (await carregarStakeholdersDoProjeto('t1', 'p1'))!
    const por = (id: string) => d.stakeholders.find(s => s.userId === id)
    expect(por('inativo-no-projeto')).toMatchObject({ isActive: false, inactiveReason: 'Saiu da equipe' })
    expect(por('conta-antiga')).toMatchObject({ isActive: false, inactiveReason: 'Conta inativada no sistema' })
    expect(por('ativo')).toMatchObject({ isActive: true, inactiveReason: null })
  })
})
