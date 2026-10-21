// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({ projetoSincronizacao: { upsert: vi.fn(), findFirst: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ default: db }))
const eap = vi.hoisted(() => ({ sincronizarEapComSprint: vi.fn(), propagarPlanilhaDeCustos: vi.fn(), can: vi.fn() }))
vi.mock('@/services/wbsService', () => ({ sincronizarEapComSprint: eap.sincronizarEapComSprint }))
vi.mock('@/services/planilhaService', () => ({ propagarPlanilhaDeCustos: eap.propagarPlanilhaDeCustos }))
vi.mock('@/services/authz', () => ({ can: eap.can }))

import { pendenciasDe, registrarSucesso, registrarFalha } from '@/services/sincronizacaoStatus'
import { sincronizarEapSprint, sincronizarEapSprintSePermitido } from '@/services/eapSprintSyncService'

const linha = (dados: Record<string, unknown>) => ({ ultimaTentativaEm: new Date('2026-10-21T12:00:00Z'), ultimaConclusaoEm: null, erro: null, pendencias: [], ...dados })
const sessao = { userId: 'u', tenantId: 't', role: 'member' }

beforeEach(() => {
  vi.clearAllMocks()
  db.projetoSincronizacao.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => linha(create))
  eap.can.mockResolvedValue(true)
  eap.sincronizarEapComSprint.mockResolvedValue({ cardsCriados: 0 })
})

describe('estado da sincronização', () => {
  it('pendências em linguagem clara; sem contadores, nenhuma', () => {
    expect(pendenciasDe({ semResponsavel: 2, semColunaDeConclusao: 0, mantidosManual: 1 }).map(p => p.tipo)).toEqual(['sem-responsavel', 'reaberto-manual'])
    expect(pendenciasDe({ semResponsavel: 1 })[0].mensagem).toContain('1 atividade concluída')
    expect(pendenciasDe(null)).toEqual([])
  })

  it('só marca OK sem pendências; com pendência fica PENDENCIAS', async () => {
    expect((await registrarSucesso('p', 't', {}, null)).situacao).toBe('OK')
    expect((await registrarSucesso('p', 't', { semResponsavel: 1 }, null)).situacao).toBe('PENDENCIAS')
  })

  it('falha guarda mensagem legível, sem detalhe de banco, e preserva a última conclusão', async () => {
    await registrarFalha('p', 't', new Error('PrismaClientKnownRequestError P2034 deadlock'))
    const { update } = db.projetoSincronizacao.upsert.mock.calls[0][0]
    expect(update).toEqual({ situacao: 'FALHA', ultimaTentativaEm: expect.any(Date), erro: expect.stringContaining('Tente novamente') })
    expect(update).not.toHaveProperty('ultimaConclusaoEm')
    expect(update).not.toHaveProperty('pendencias')
  })
})

describe('sincronização com registro do estado', () => {
  it('sucesso grava as pendências da planilha', async () => {
    eap.propagarPlanilhaDeCustos.mockResolvedValue({ cards: { semResponsavel: 1 } })
    const { status } = await sincronizarEapSprint(sessao, 'p')
    expect(status.situacao).toBe('PENDENCIAS')
  })

  it('falha fica registrada e é repassada a quem chamou', async () => {
    eap.sincronizarEapComSprint.mockRejectedValue(new Error('lock timeout'))
    await expect(sincronizarEapSprint(sessao, 'p')).rejects.toThrow('lock timeout')
    expect(db.projetoSincronizacao.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ situacao: 'FALHA' }) }))
  })

  it('ao abrir a tela: sem permissão não sincroniza; falha não derruba a página', async () => {
    eap.can.mockResolvedValue(false)
    expect(await sincronizarEapSprintSePermitido(sessao, 'p')).toBeNull()
    expect(eap.sincronizarEapComSprint).not.toHaveBeenCalled()
    eap.can.mockResolvedValue(true)
    eap.sincronizarEapComSprint.mockRejectedValue(new Error('x'))
    expect(await sincronizarEapSprintSePermitido(sessao, 'p')).toBeNull()
  })
})
