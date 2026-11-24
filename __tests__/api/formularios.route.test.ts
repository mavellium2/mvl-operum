// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ tenantId: 't1', role: 'user', userId: 'u1' }) }))
vi.mock('@/services/projectAccess', () => ({ canProjectPermission: vi.fn() }))
vi.mock('@/services/documentRevisionService', () => ({ documentoVigente: vi.fn(), listarRiscos: vi.fn(), rascunhoDocumento: vi.fn() }))
vi.mock('@/services/ataService', () => ({ cabecalhoDaAta: vi.fn() }))
vi.mock('@/services/gerenteProjeto', () => ({ gerenteDoProjeto: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { project: { findFirst: vi.fn() }, wbsNode: { findFirst: vi.fn(), findMany: vi.fn() } } }))

import prisma from '@/lib/prisma'
import { canProjectPermission } from '@/services/projectAccess'
import { documentoVigente, listarRiscos, rascunhoDocumento } from '@/services/documentRevisionService'
import { cabecalhoDaAta } from '@/services/ataService'
import { gerenteDoProjeto } from '@/services/gerenteProjeto'
import { GET } from '@/app/api/projects/[projetoId]/formularios/route'

const ctx = { params: Promise.resolve({ projetoId: 'p1' }) }
const db = prisma as unknown as { project: { findFirst: ReturnType<typeof vi.fn> }; wbsNode: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> } }

describe('GET /api/projects/:id/formularios', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(canProjectPermission).mockResolvedValue(true)
    db.project.findFirst.mockResolvedValue({ justificativa: 'J do projeto', objetivos: 'O do projeto', descricaoProduto: null })
    vi.mocked(cabecalhoDaAta).mockResolvedValue({ instituicao: 'Fatec Garça - ADS', logoUrl: null, nomeProjeto: 'Doatec' })
    vi.mocked(gerenteDoProjeto).mockResolvedValue({ nome: 'João', signatureUrl: '/s.png' })
    vi.mocked(documentoVigente).mockImplementation(async (_s, _p, tipo) => (tipo === 'CHARTER' ? { payload: { justificativa: 'J do Termo' } } : null) as never)
    vi.mocked(listarRiscos).mockResolvedValue([])
    vi.mocked(rascunhoDocumento).mockResolvedValue(null)
    db.wbsNode.findFirst.mockResolvedValue({ id: 'n1', code: '1', title: 'Site' })
    db.wbsNode.findMany.mockResolvedValue([{ code: '1.1', title: 'Planejamento', properties: { dataLimite: '2026-08-14', custo: 23.08 } }, { code: '1.2', title: '  ', properties: null }])
  })

  it('cabeçalho do projeto, textos do Termo vigente e só os níveis 1 e 2 da EAP', async () => {
    const r = await GET(new Request('http://x'), ctx)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      nomeProjeto: 'Doatec', instituicao: 'Fatec Garça - ADS', logoUrl: null,
      gerente: { nome: 'João', assinaturaUrl: '/s.png' },
      termo: { justificativa: 'J do Termo', objetivos: 'O do projeto', descricaoProduto: '', restricoes: '', premissas: '' },
      entregas: { raiz: { codigo: '1', titulo: 'Site' }, itens: [{ codigo: '1.1', titulo: 'Planejamento' }] },
      escopo: { descricaoProduto: '', estrategia: '' },
      stakeholders: [],
      riscos: [],
      macroFases: [{ codigo: '1.1', fase: 'Planejamento', dataLimite: '2026-08-14', custo: '23.08' }],
    })
    expect(db.wbsNode.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', tenantId: 't1', parentId: 'n1' } }))
  })

  it('Estratégia de condução: usa o rascunho do usuário quando é mais novo que a versão vigente', async () => {
    vi.mocked(documentoVigente).mockImplementation(async (_s, _p, tipo) => (tipo === 'ESCOPO' ? { payload: { estrategia: 'Da versão' }, approvedAt: new Date('2026-11-01'), createdAt: new Date('2026-11-01') } : null) as never)
    vi.mocked(rascunhoDocumento).mockResolvedValue({ payload: { estrategia: '- Do rascunho' }, updatedAt: new Date('2026-11-20') } as never)
    expect((await (await GET(new Request('http://x'), ctx)).json()).escopo.estrategia).toBe('- Do rascunho')
    vi.mocked(rascunhoDocumento).mockResolvedValue({ payload: { estrategia: '- Antigo' }, updatedAt: new Date('2026-10-01') } as never)
    expect((await (await GET(new Request('http://x'), ctx)).json()).escopo.estrategia).toBe('Da versão')
  })

  it('Estratégia de condução: Escopo ainda não aprovado (só rascunho) alimenta o Canvas; sem permissão de editar, vale a versão', async () => {
    vi.mocked(rascunhoDocumento).mockResolvedValue({ payload: { estrategia: '- Só rascunho' }, updatedAt: new Date('2026-11-20') } as never)
    expect((await (await GET(new Request('http://x'), ctx)).json()).escopo.estrategia).toBe('- Só rascunho')
    vi.mocked(rascunhoDocumento).mockRejectedValue(new Error('Sem permissão'))
    expect((await (await GET(new Request('http://x'), ctx)).json()).escopo.estrategia).toBe('')
  })

  it('sem EAP: sem entregas', async () => {
    db.wbsNode.findFirst.mockResolvedValue(null)
    const body = await (await GET(new Request('http://x'), ctx)).json()
    expect(body.entregas).toEqual({ raiz: null, itens: [] })
    expect(db.wbsNode.findMany).not.toHaveBeenCalled()
  })

  it('sem permissão de ver documentos: 403', async () => {
    vi.mocked(canProjectPermission).mockResolvedValue(false)
    expect((await GET(new Request('http://x'), ctx)).status).toBe(403)
  })

  it('projeto de outro tenant ou excluído: 404', async () => {
    db.project.findFirst.mockResolvedValue(null)
    expect((await GET(new Request('http://x'), ctx)).status).toBe(404)
  })

  it('fontes do Canvas: Declaração do Escopo, nomes das Partes Interessadas, títulos dos riscos e macrofases do Termo sem EAP', async () => {
    db.wbsNode.findFirst.mockResolvedValue(null)
    vi.mocked(documentoVigente).mockImplementation(async (_s, _p, tipo) => ({
      CHARTER: { payload: { restricoes: 'R1', premissas: 'P1', macroFases: [{ fase: 'Planejamento', dataLimite: '2026-08-14', custo: '23,08' }, { fase: ' ' }] } },
      ESCOPO: { payload: { descricaoProduto: 'Mural', estrategia: 'Reuniões semanais' } },
      STAKEHOLDER: { payload: { stakeholders: [{ nome: 'Émerson' }, { nome: ' ' }, { nome: 'Breno' }] } },
    } as Record<string, unknown>)[tipo as string] as never ?? null)
    vi.mocked(listarRiscos).mockResolvedValue([{ id: 'r1', numero: 1, denominacao: 'Falta de verba', responsavel: '', impacto: null, probabilidade: null, status: 'APPROVED' }, { id: 'r2', numero: 2, denominacao: '', responsavel: '', impacto: null, probabilidade: null, status: 'NONE' }])
    const body = await (await GET(new Request('http://x'), ctx)).json()
    expect(body.termo).toMatchObject({ restricoes: 'R1', premissas: 'P1' })
    expect(body.escopo).toEqual({ descricaoProduto: 'Mural', estrategia: 'Reuniões semanais' })
    expect(body.stakeholders).toEqual(['Émerson', 'Breno'])
    expect(body.riscos).toEqual([{ numero: 1, denominacao: 'Falta de verba' }])
    expect(body.macroFases).toEqual([{ codigo: '1.1', fase: 'Planejamento', dataLimite: '2026-08-14', custo: '23,08' }])
  })
})
