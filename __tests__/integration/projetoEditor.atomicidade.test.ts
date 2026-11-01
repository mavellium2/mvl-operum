// @vitest-environment node
import 'dotenv/config'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { ConteudoVersaoSchema, type RegistroVersao } from '@/lib/projetoVersaoSchema'
import { salvarProjetoEditor } from '@/services/projetoEditorService'
import { executarOperacaoProjeto } from '@/services/projetoOperacaoService'
import { deleteNode } from '@/services/wbsService'
import * as versoes from '@/services/projetoVersoes'

// Opt-in: banco local real; todos os dados pertencem a um tenant temporário.
describe.skipIf(process.env.OPERUM_TEST_ATOMIC_DB !== '1')('editor — transação PostgreSQL e recibos reais', () => {
  let tenantId: string, projectId: string, userId: string
  const seedName = `QA atomicidade ${randomUUID()}`
  let realRegistrar: typeof versoes.registrarVersaoProjetoEmTransacao
  const session = () => ({ tenantId, userId, role: 'admin' })
  const conteudo = (name: string) => ConteudoVersaoSchema.parse({ form: {
    ...Object.fromEntries(Object.keys(ConteudoVersaoSchema.shape.form.shape).map(key => [key, key === 'departamentos' ? [] : ''])), name,
  }, fases: [{ fase: 'Fase QA', dataLimite: '', custo: '100,00' }] })
  const registro = (name: string, id = randomUUID()): RegistroVersao => ({ operacaoId: id, conteudo: conteudo(name), anterior: conteudo(seedName), alteracoes: ['Nome do projeto'] })
  const dados = (name: string) => ({ name, macroFases: [{ fase: 'Fase QA', dataLimite: '', custo: '100,00' }], departamentos: ['Departamento QA'], initialMemberId: userId })
  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: seedName, subdomain: `qa-${randomUUID()}` } })
    tenantId = tenant.id
    const user = await prisma.user.create({ data: { tenantId, name: 'Autor de teste', email: `${randomUUID()}@qa.invalid`, passwordHash: '!conta-de-teste-sem-login', isActive: false } })
    userId = user.id
    projectId = (await prisma.project.create({ data: { tenantId, name: seedName, departamentos: [] } })).id
    realRegistrar = versoes.registrarVersaoProjetoEmTransacao
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    if (!tenantId) return
    await prisma.auditLog.deleteMany({ where: { tenantId } })
    await prisma.project.deleteMany({ where: { tenantId } })
    await prisma.role.deleteMany({ where: { tenantId } })
    await prisma.department.deleteMany({ where: { tenantId } })
    await prisma.user.deleteMany({ where: { tenantId } })
    await prisma.tenant.delete({ where: { id: tenantId } })
  })

  it('falha no histórico reverte projeto, fases, EAP, gerente, departamentos, Termo e auditoria', async () => {
    vi.spyOn(versoes, 'registrarVersaoProjetoEmTransacao').mockImplementationOnce(async (...args) => { await realRegistrar(...args); throw new Error('falha após gravar o histórico') })
    await expect(salvarProjetoEditor(session(), projectId, dados('Não deve persistir'), { justificativa: 'Termo também deve voltar' }, registro('Não deve persistir'))).rejects.toThrow('falha após gravar')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).name).toBe(seedName)
    for (const count of await Promise.all([
      prisma.wbsNode.count({ where: { projectId } }), prisma.projectMacroFase.count({ where: { projectId } }),
      prisma.projetoVersao.count({ where: { projectId } }), prisma.documentVersion.count({ where: { projectId } }),
      prisma.projetoOperacao.count({ where: { projectId } }), prisma.userProject.count({ where: { projectId } }),
      prisma.projetoDepartamento.count({ where: { projetoId: projectId } }), prisma.auditLog.count({ where: { tenantId } }),
    ])) expect(count).toBe(0)
    expect(await prisma.role.count({ where: { tenantId } })).toBe(0)
    expect(await prisma.department.count({ where: { tenantId } })).toBe(0)
  })

  it('resposta perdida depois do commit: repetir o mesmo pedido devolve o resultado sem repetir efeitos', async () => {
    const reg = registro('Salvo uma vez')
    const input = dados('Salvo uma vez'), termo = { justificativa: 'Versão persistida' }
    const result = await salvarProjetoEditor(session(), projectId, input, termo, reg)
    // Simula a perda da resposta: o cliente não usa result e repete exatamente o pedido.
    const docs = await prisma.documentVersion.count({ where: { projectId } })
    const versions = await prisma.projetoVersao.count({ where: { projectId } })
    const replay = await salvarProjetoEditor(session(), projectId, input, termo, reg)
    expect(replay).toEqual(result)
    expect(await prisma.documentVersion.count({ where: { projectId } })).toBe(docs)
    expect(await prisma.projetoVersao.count({ where: { projectId } })).toBe(versions)
    expect(await prisma.projectMacroFase.count({ where: { projectId } })).toBe(1)
    expect(await prisma.projetoOperacao.count({ where: { projectId } })).toBe(1)
  })

  it('pedidos simultâneos com a mesma chave criam só uma versão e um Termo', async () => {
    const reg = registro('Concorrência'), input = dados('Concorrência'), termo = { justificativa: 'Concorrência segura' }
    const before = await prisma.projetoVersao.count({ where: { projectId } })
    const docs = await prisma.documentVersion.count({ where: { projectId } })
    const [a, b] = await Promise.all([salvarProjetoEditor(session(), projectId, input, termo, reg), salvarProjetoEditor(session(), projectId, input, termo, reg)])
    expect(a).toEqual(b)
    expect(await prisma.projetoVersao.count({ where: { projectId } })).toBe(before + 1)
    expect(await prisma.documentVersion.count({ where: { projectId } })).toBe(docs + 1)
    await expect(salvarProjetoEditor(session(), projectId, dados('Outro conteúdo'), termo, reg)).rejects.toThrow('outros dados')
  })

  it('restauração reverte os dados junto com o marcador se falhar; retry ativa a versão sem criar outra', async () => {
    const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    const ativa = await prisma.projetoVersao.findFirstOrThrow({ where: { projectId, ativa: true } })
    const total = await prisma.projetoVersao.count({ where: { projectId } })
    const reg = { ...registro(seedName), ativarVersao: 1 }
    vi.spyOn(versoes, 'registrarVersaoProjetoEmTransacao').mockImplementationOnce(async (...args) => { await realRegistrar(...args); throw new Error('falha na restauração') })
    await expect(salvarProjetoEditor(session(), projectId, dados(seedName), {}, reg)).rejects.toThrow('falha na restauração')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).name).toBe(before.name)
    expect((await prisma.projetoVersao.findFirstOrThrow({ where: { projectId, ativa: true } })).numero).toBe(ativa.numero)
    await salvarProjetoEditor(session(), projectId, dados(seedName), {}, reg)
    expect((await prisma.projetoVersao.findFirstOrThrow({ where: { projectId, ativa: true } })).numero).toBe(1)
    expect(await prisma.projetoVersao.count({ where: { projectId } })).toBe(total)
  })

  it('exclusão e histórico também voltam juntos se houver falha', async () => {
    const root = await prisma.wbsNode.findFirstOrThrow({ where: { projectId, parentId: null } })
    const node = await prisma.wbsNode.findFirstOrThrow({ where: { projectId, parentId: root.id } })
    const reg = registro(seedName)
    reg.conteudo.fases = []
    const requestId = randomUUID()
    const executar = () => executarOperacaoProjeto(session(), projectId, requestId, { tipo: 'excluir', nodeId: node.id }, async tx => {
      await deleteNode({ nodeId: node.id, projectId, tenantId }, userId, tx)
      await tx.projectMacroFase.deleteMany({ where: { projectId } })
      await versoes.registrarVersaoProjetoEmTransacao(tx, { tenantId, projectId, userId }, reg)
      return { ok: true }
    })
    vi.spyOn(versoes, 'registrarVersaoProjetoEmTransacao').mockImplementationOnce(async (...args) => { await realRegistrar(...args); throw new Error('falha na exclusão') })
    await expect(executar()).rejects.toThrow('falha na exclusão')
    expect(await prisma.wbsNode.findUnique({ where: { id: node.id } })).not.toBeNull()
    expect(await prisma.projectMacroFase.count({ where: { projectId } })).toBe(1)
    await executar()
    const versionCount = await prisma.projetoVersao.count({ where: { projectId } })
    await executar()
    expect(await prisma.wbsNode.findUnique({ where: { id: node.id } })).toBeNull()
    expect(await prisma.projetoVersao.count({ where: { projectId } })).toBe(versionCount)
  })

  it('não aceita acessar o recibo ou alterar o projeto por outro tenant', async () => {
    await expect(salvarProjetoEditor({ ...session(), tenantId: 'outro-tenant' }, projectId, { name: 'Ataque' }, {}, registro('Ataque'))).rejects.toThrow('Projeto não encontrado')
    expect((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).name).toBe(seedName)
  })
})
