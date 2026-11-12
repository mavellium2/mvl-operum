// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/projectRoleService', () => ({ getProjectRoleForMember: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/projectAccess', () => ({ findById: vi.fn().mockResolvedValue({ id: 'p1' }) }))
const { usuario, contato } = vi.hoisted(() => ({
  usuario: (id: string, name: string) => ({ id, name, email: `${id}@x.com`, avatarUrl: null, role: 'member' }),
  contato: (id: string, name: string, userId: string | null) => ({ id, tenantId: 't1', name, userId, logoUrl: null, company: null, competence: null, email: null, phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null, isActive: true, inactiveReason: null, inactivatedAt: null }),
}))
vi.mock('@/lib/prisma', () => ({ default: {
  projectStakeholder: { findMany: vi.fn().mockResolvedValue([
    { stakeholderId: 'sk-cli', remuneracao: 1500, horasDiarias: 4, funcoes: ['Cliente'], departamentos: [], stakeholder: contato('sk-cli', 'Cliente Externo', null) },
  ]) },
  stakeholder: { findMany: vi.fn().mockResolvedValue([contato('sk-cli', 'Cliente Externo', null), contato('sk-ana', 'Ana (contato)', 'u-ana'), contato('sk-bia', 'Bia', null)]) },
  userProject: { findMany: vi.fn().mockResolvedValue([{
    userId: 'u-ana', active: true, role: null, remuneracao: null, horasDiarias: null, hourlyRate: null, startDate: new Date(), inactiveReason: null, inactivatedAt: null, department: null,
    user: { ...usuario('u-ana', 'Ana'), phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null, deletedAt: null, isActive: true, signatureUrl: null, contato: { company: 'Fatec', competence: 'Back-end' } },
  }]) },
  user: { findMany: vi.fn().mockResolvedValue([usuario('u-ana', 'Ana'), usuario('u-paulo', 'Paulo')]) },
  role: { findMany: vi.fn().mockResolvedValue([]) },
  department: { findMany: vi.fn().mockResolvedValue([]) },
} }))

import { carregarStakeholdersDoProjeto } from '@/services/stakeholdersDoProjeto'

describe('listas de interno e externo com o mesmo cadastro', () => {
  it('cada pessoa fora do projeto aparece nas duas listas; quem está no projeto, em nenhuma', async () => {
    const d = (await carregarStakeholdersDoProjeto('t1', 'p1'))!
    // Externo: contato Bia e a conta do Paulo (sem contato). Ana é interna aqui; Cliente já é externo.
    expect(d.stakeholdersDisponiveis.map(s => s.id)).toEqual(['sk-bia', 'usuario:u-paulo'])
    expect(d.stakeholdersDisponiveis.find(s => s.id === 'usuario:u-paulo')?.userId).toBe('u-paulo')
    // Interno: a conta do Paulo e o contato Bia (sem login).
    expect(d.usuariosDisponiveis.map(u => u.id)).toEqual(['contato:sk-bia', 'u-paulo'])
    expect(d.usuariosDisponiveis.find(u => u.id === 'contato:sk-bia')).toMatchObject({ semConta: true, stakeholderId: 'sk-bia' })
  })
  it('externo traz os mesmos dados do projeto que o interno; interno traz empresa e competência', async () => {
    const d = (await carregarStakeholdersDoProjeto('t1', 'p1'))!
    expect(d.stakeholders.find(s => s.tipo === 'externo')).toMatchObject({ remuneracao: 1500, horasDiarias: 4, cargos: ['Cliente'], departamento: [] })
    expect(d.stakeholders.find(s => s.tipo === 'interno')).toMatchObject({ company: 'Fatec', competence: 'Back-end' })
  })
})
