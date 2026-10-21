// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  default: {
    userProject: { findMany: vi.fn().mockResolvedValue([
      { user: { name: 'Ana', email: 'ana@x.com' } },
      { user: { name: 'Bia', email: ' BIA@x.com ' } },
    ]) },
    projectStakeholder: { findMany: vi.fn().mockResolvedValue([
      { stakeholder: { name: 'Bia (externa)', email: 'bia@x.com' } },
      { stakeholder: { name: 'Sem e-mail', email: null } },
      { stakeholder: { name: 'Cliente', email: 'cliente@y.com' } },
    ]) },
  },
}))

import prisma from '@/lib/prisma'
import { emailsParaCopia } from '@/services/ataService'

describe('emailsParaCopia', () => {
  it('junta membros e stakeholders ativos do projeto, sem vazios nem repetidos', async () => {
    expect(await emailsParaCopia('t1', 'p1')).toEqual([
      { email: 'ana@x.com', nome: 'Ana' },
      { email: 'BIA@x.com', nome: 'Bia' },
      { email: 'cliente@y.com', nome: 'Cliente' },
    ])
    expect(prisma.projectStakeholder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', stakeholder: { tenantId: 't1', isActive: true } } }))
    expect(prisma.userProject.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ projectId: 'p1', active: true, user: { tenantId: 't1', deletedAt: null, isActive: true } }) }))
  })
})
