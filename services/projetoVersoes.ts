import { z } from 'zod'
import prisma from '@/lib/prisma'

/**
 * Histórico do Editar projeto, linear como commits: cada salvamento grava o
 * conteúdo do formulário numa versão nova. O marcador ativa é independente do
 * maior número: restaurar ativa uma versão existente sem apagar as demais.
 */

const texto = (max: number) => z.string().max(max)
export const ConteudoVersaoSchema = z.object({
  form: z.object({
    name: texto(255), slogan: texto(500), startDate: texto(30), endDate: texto(30), location: texto(500),
    logoUrl: texto(2000), initialMemberId: texto(64),
    justificativa: texto(20000), objetivos: texto(20000), metodologia: texto(20000), descricaoProduto: texto(20000),
    premissas: texto(20000), restricoes: texto(20000), limitesAutoridade: texto(20000),
    semestre: texto(10), termo: texto(20), turno: texto(40), ano: texto(10), anoAms: texto(5),
    departamentos: z.array(texto(200)).max(100),
  }),
  fases: z.array(z.object({ fase: texto(500), dataLimite: texto(30), custo: texto(40) })).max(500),
})
export type ConteudoVersao = z.infer<typeof ConteudoVersaoSchema>

export const RegistroVersaoSchema = z.object({
  ativarVersao: z.number().int().positive().optional(),
  conteudo: ConteudoVersaoSchema,
  /** Como estava antes deste salvamento: vira a v1 quando o projeto ainda não tem histórico. */
  anterior: ConteudoVersaoSchema.optional(),
  alteracoes: z.array(texto(200)).max(200),
  restauradaDe: z.number().int().positive().optional(),
})
export type RegistroVersao = z.infer<typeof RegistroVersaoSchema>

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
  const r = RegistroVersaoSchema.parse(registro)
  const autor = await prisma.user.findFirst({ where: { id: ctx.userId }, select: { name: true } })
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await prisma.$transaction(async tx => {
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
      })
    } catch (e) {
      // Dois salvamentos ao mesmo tempo disputam o mesmo número: tenta de novo com o próximo.
      if (tentativa < 2 && (e as { code?: string })?.code === 'P2002') continue
      throw e
    }
  }
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
