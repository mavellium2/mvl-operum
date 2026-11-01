import { z } from 'zod'
import { LIMITES_TEXTO_PROJETO, LIMITE_NOME_FASE } from '@/lib/projetoLimites'

const texto = (max: number) => z.string().max(max)
export const ConteudoVersaoSchema = z.object({
  form: z.object({
    name: texto(LIMITES_TEXTO_PROJETO.name), slogan: texto(LIMITES_TEXTO_PROJETO.slogan), startDate: texto(LIMITES_TEXTO_PROJETO.startDate), endDate: texto(LIMITES_TEXTO_PROJETO.endDate), location: texto(LIMITES_TEXTO_PROJETO.location),
    logoUrl: texto(LIMITES_TEXTO_PROJETO.logoUrl), initialMemberId: texto(LIMITES_TEXTO_PROJETO.initialMemberId),
    justificativa: texto(LIMITES_TEXTO_PROJETO.justificativa), objetivos: texto(LIMITES_TEXTO_PROJETO.objetivos), metodologia: texto(LIMITES_TEXTO_PROJETO.metodologia), descricaoProduto: texto(LIMITES_TEXTO_PROJETO.descricaoProduto),
    premissas: texto(LIMITES_TEXTO_PROJETO.premissas), restricoes: texto(LIMITES_TEXTO_PROJETO.restricoes), limitesAutoridade: texto(LIMITES_TEXTO_PROJETO.limitesAutoridade),
    semestre: texto(LIMITES_TEXTO_PROJETO.semestre), termo: texto(LIMITES_TEXTO_PROJETO.termo), turno: texto(LIMITES_TEXTO_PROJETO.turno), ano: texto(LIMITES_TEXTO_PROJETO.ano), anoAms: texto(LIMITES_TEXTO_PROJETO.anoAms),
    departamentos: z.array(texto(200)).max(100),
  }),
  fases: z.array(z.object({ fase: texto(LIMITE_NOME_FASE), dataLimite: texto(30), custo: texto(40) })).max(500),
})
export type ConteudoVersao = z.infer<typeof ConteudoVersaoSchema>

export const RegistroVersaoSchema = z.object({
  operacaoId: z.string().uuid().optional(),
  ativarVersao: z.number().int().positive().optional(),
  conteudo: ConteudoVersaoSchema,
  /** Como estava antes deste salvamento: vira a v1 quando o projeto ainda não tem histórico. */
  anterior: ConteudoVersaoSchema.optional(),
  alteracoes: z.array(texto(200)).max(200),
  restauradaDe: z.number().int().positive().optional(),
})
export type RegistroVersao = z.infer<typeof RegistroVersaoSchema>
