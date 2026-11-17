// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ tenantId: 't1', role: 'user', userId: 'u1' }) }))
vi.mock('@/services/projectAccess', () => ({ canProjectPermission: vi.fn() }))
vi.mock('@/services/documentRevisionService', () => ({ documentoVigente: vi.fn() }))
vi.mock('@/services/ataService', () => ({ cabecalhoDaAta: vi.fn() }))
vi.mock('@/services/gerenteProjeto', () => ({ gerenteDoProjeto: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { project: { findFirst: vi.fn() }, wbsNode: { findFirst: vi.fn(), findMany: vi.fn() } } }))

import prisma from '@/lib/prisma'
import { canProjectPermission } from '@/services/projectAccess'
import { documentoVigente } from '@/services/documentRevisionService'
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
    vi.mocked(documentoVigente).mockResolvedValue({ payload: { justificativa: 'J do Termo' } } as never)
    db.wbsNode.findFirst.mockResolvedValue({ id: 'n1', code: '1', title: 'Site' })
    db.wbsNode.findMany.mockResolvedValue([{ code: '1.1', title: 'Planejamento' }, { code: '1.2', title: '  ' }])
  })

  it('cabeçalho do projeto, textos do Termo vigente e só os níveis 1 e 2 da EAP', async () => {
    const r = await GET(new Request('http://x'), ctx)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      nomeProjeto: 'Doatec', instituicao: 'Fatec Garça - ADS', logoUrl: null,
      gerente: { nome: 'João', assinaturaUrl: '/s.png' },
      termo: { justificativa: 'J do Termo', objetivos: 'O do projeto', descricaoProduto: '' },
      entregas: { raiz: { codigo: '1', titulo: 'Site' }, itens: [{ codigo: '1.1', titulo: 'Planejamento' }] },
    })
    expect(db.wbsNode.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', tenantId: 't1', parentId: 'n1' } }))
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
})
