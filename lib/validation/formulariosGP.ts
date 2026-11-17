import { z } from 'zod'

/**
 * Conteúdo dos formulários das aulas de Gestão de Projetos guardados como
 * documentos versionados: Declaração do Escopo (ESCOPO), Formulários de Riscos
 * (RISCOS) e Lições Aprendidas (LICOES). Nome do projeto, gerente, instituição,
 * logo e assinatura vêm do projeto; aqui fica só o que se escreve na folha.
 */

const texto = (max = 20000) => z.string().max(max)
const data = z.string().max(50)

/** Parte editável do quadro de identificação (mesmo cabeçalho nos três modelos). */
export const cabecalhoFormularioSchema = z
  .object({
    /** Nome de quem elaborou ("<nome e função>" no modelo). */
    elaboradoPor: texto(300),
    elaboradoPorUserId: z.string().max(64).nullable(),
    /** Função de quem elaborou, exibida após o nome. */
    funcao: texto(300),
    versao: texto(50),
    dataAprovacao: data,
  })
  .partial()
  .strict()
export type CabecalhoFormulario = z.infer<typeof cabecalhoFormularioSchema>

export const escopoSchema = z
  .object({
    cabecalho: cabecalhoFormularioSchema,
    justificativa: texto(),
    objetivos: texto(),
    descricaoProduto: texto(),
    ligacoes: texto(),
    estrategia: texto(),
    responsabilidades: texto(),
  })
  .partial()
  .strict()
export type EscopoConteudo = z.infer<typeof escopoSchema>

/** Escala 1 (baixo) a 5 (alto) do modelo; nulo = não marcado. */
const escala = z.number().int().min(1).max(5).nullable()

export const riscoSchema = z
  .object({
    cabecalho: cabecalhoFormularioSchema.optional(),
    denominacao: texto(500).optional(),
    descricao: texto().optional(),
    impacto: escala.optional(),
    probabilidade: escala.optional(),
    estrategias: texto().optional(),
    responsavel: texto(300).optional(),
    responsavelUserId: z.string().max(64).nullable().optional(),
    responsavelFuncao: texto(300).optional(),
    dataConclusao: data.optional(),
    impactoReavaliado: escala.optional(),
    justificativaImpacto: texto(5000).optional(),
    probabilidadeReavaliada: escala.optional(),
    justificativaProbabilidade: texto(5000).optional(),
    ocorrencias: texto().optional(),
    respostasNaWbs: z.boolean().optional(),
    registrosAdicionais: texto(500).optional(),
  })
  .strict()
/** Conteúdo de um formulário de risco (cada risco é um documento, como as Atas; o Nº vem do cadastro `Risco`). */
export type Risco = z.infer<typeof riscoSchema>

/** Aspectos 1 a 13 (Sim/Não + comentário) e perguntas abertas 14 a 17 do modelo. */
export const ASPECTOS_LICOES = [
  { id: 'a1', texto: 'Os produtos/serviços entregues correspondem aos descritos na proposta executiva (termo de abertura)?' },
  { id: 'a2', texto: 'Foi elaborado um relatório de auditoria final dos resultados?' },
  { id: 'a3', texto: 'Houve desvios entre os prazos realizados e programados (Baseline)?', guia: 'Quais foram as causas dos desvios?' },
  { id: 'a4', texto: 'Houve desvios entre os custos efetivos e os orçados (Baseline)?' },
  { id: 'a5', texto: 'Os desvios poderiam ter sido evitados?' },
  { id: 'a6', texto: 'Ocorreram riscos não previstos?' },
  { id: 'a7', texto: 'Os clientes/usuários estão satisfeitos?', guia: 'Por quê?' },
  { id: 'a8', texto: 'A equipe ficou satisfeita com o apoio dos patrocinadores?', guia: 'Por quê?' },
  { id: 'a9', texto: 'Houve cooperação e comprometimento das pessoas?' },
  { id: 'a10', texto: 'O projeto foi bem administrado?', guia: 'Por quê?' },
  { id: 'a11', texto: 'Houve problemas de comunicação?' },
  { id: 'a12', texto: 'O projeto foi bem documentado?' },
  { id: 'a13', texto: 'Os fornecedores entregaram seus produtos/serviços em conformidade com as especificações combinadas?' },
] as const
export const PERGUNTAS_LICOES = [
  { id: 'p14', texto: 'O que faríamos da mesma forma?' },
  { id: 'p15', texto: 'O que faríamos de maneira diferente?' },
  { id: 'p16', texto: 'O que sabemos hoje, e que não sabíamos antes do projeto?' },
  { id: 'p17', texto: 'Que recomendações devemos incluir para melhorar os próximos projetos?' },
] as const
export type IdAspecto = (typeof ASPECTOS_LICOES)[number]['id']
export type IdPergunta = (typeof PERGUNTAS_LICOES)[number]['id']

const resposta = z
  .object({ sim: z.boolean().nullable().optional(), comentario: texto(5000).optional() })
  .strict()
export type RespostaAspecto = z.infer<typeof resposta>

export const licoesSchema = z
  .object({
    cabecalho: cabecalhoFormularioSchema,
    aspectos: z.object(Object.fromEntries(ASPECTOS_LICOES.map(a => [a.id, resposta.optional()])) as Record<IdAspecto, z.ZodOptional<typeof resposta>>).strict(),
    perguntas: z.object(Object.fromEntries(PERGUNTAS_LICOES.map(p => [p.id, texto().optional()])) as Record<IdPergunta, z.ZodOptional<z.ZodString>>).strict(),
  })
  .partial()
  .strict()
export type LicoesConteudo = z.infer<typeof licoesSchema>
