import { ConteudoVersaoSchema, RegistroVersaoSchema, type ConteudoVersao, type RegistroVersao } from '@/lib/projetoVersaoSchema'
export { ConteudoVersaoSchema, RegistroVersaoSchema, type ConteudoVersao, type RegistroVersao } from '@/lib/projetoVersaoSchema'
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma'

/**
 * Histórico do Editar projeto, linear como commits: cada salvamento grava o
 * conteúdo do formulário numa versão nova. O marcador ativa é independente do
 * maior número: restaurar ativa uma versão existente sem apagar as demais.
 */

export interface VersaoProjeto {
  ativa?: boolean
  numero: number
  conteudo: ConteudoVersao
  alteracoes: string[]
  restauradaDe: number | null
  autorNome: string
  createdAt: string
}

/** Grava uma versão nova (e a v1 com o estado anterior, se for o primeiro salvamento). */
export async function registrarVersaoProjeto(ctx: { tenantId: string; projectId: string; userId: string }, registro: RegistroVersao): Promise<number> {
  for (let tentativa = 0; ; tentativa++) {
    try { return await prisma.$transaction(tx => registrarVersaoProjetoEmTransacao(tx, ctx, registro)) }
    catch (e) { if (tentativa < 2 && (e as { code?: string })?.code === 'P2002') continue; throw e }
  }
}

export async function registrarVersaoProjetoEmTransacao(tx: Prisma.TransactionClient, ctx: { tenantId: string; projectId: string; userId: string }, registro: RegistroVersao): Promise<number> {
  const r = RegistroVersaoSchema.parse(registro)
  const autor = await tx.user.findFirst({ where: { id: ctx.userId }, select: { name: true } })
  if (r.ativarVersao) {
    const alvo = await tx.projetoVersao.findFirst({ where: { tenantId: ctx.tenantId, projectId: ctx.projectId, numero: r.ativarVersao } })
    if (!alvo) throw new Error('Versão não encontrada.')
    await tx.projetoVersao.updateMany({ where: { tenantId: ctx.tenantId, projectId: ctx.projectId }, data: { ativa: false } })
    await tx.projetoVersao.update({ where: { id: alvo.id }, data: { ativa: true } })
    return alvo.numero
  }
  await tx.projetoVersao.updateMany({ where: { tenantId: ctx.tenantId, projectId: ctx.projectId, ativa: true }, data: { ativa: false } })
  const ultima = await tx.projetoVersao.findFirst({ where: { projectId: ctx.projectId, tenantId: ctx.tenantId }, orderBy: { numero: 'desc' }, select: { numero: true } })
  let numero = ultima?.numero ?? 0
  if (!ultima && r.anterior) {
    numero = 1
    await tx.projetoVersao.create({ data: { tenantId: ctx.tenantId, projectId: ctx.projectId, numero, conteudo: r.anterior, alteracoes: [], autorNome: '' } })
  }
  numero += 1
  await tx.projetoVersao.create({
    data: {
      tenantId: ctx.tenantId, projectId: ctx.projectId, numero, ativa: true, conteudo: r.conteudo, alteracoes: r.alteracoes,
      restauradaDe: r.restauradaDe ?? null, autorId: ctx.userId, autorNome: autor?.name ?? '',
    },
  })
  return numero
}

export async function listarVersoesProjeto(tenantId: string, projectId: string, limite = 100): Promise<VersaoProjeto[]> {
  const versoes = await prisma.projetoVersao.findMany({
    where: { tenantId, projectId },
    orderBy: { numero: 'desc' },
    take: limite,
  })
  return versoes.flatMap(v => {
    const conteudo = ConteudoVersaoSchema.safeParse(v.conteudo)
    if (!conteudo.success) return []
    return [{
      numero: v.numero,
      ativa: v.ativa,
      conteudo: conteudo.data,
      alteracoes: Array.isArray(v.alteracoes) ? (v.alteracoes as unknown[]).filter((a): a is string => typeof a === 'string') : [],
      restauradaDe: v.restauradaDe,
      autorNome: v.autorNome,
      createdAt: v.createdAt.toISOString(),
    }]
  })
}
