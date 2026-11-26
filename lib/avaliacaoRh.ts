/**
 * Avaliação de Desempenho dos Recursos Humanos (ajustes de 20/11/2026), no
 * modelo "15 - Avaliação R.H." do professor. Duas ou mais rodadas no semestre:
 * 1ª Avaliação (AC), 2ª Avaliação (AF), 3ª... (até 10); um documento por integrante ativo em
 * cada rodada. Só o gerente do projeto e o administrador veem e editam.
 *
 * Os textos dos critérios são os do modelo, na mesma ordem e com a mesma
 * redação (inclusive as frases fora da ordem Fraco → Ótimo).
 */

export const CONCEITOS_RH = ['FRACO', 'REGULAR', 'BOM', 'OTIMO'] as const
export type ConceitoRh = (typeof CONCEITOS_RH)[number]
export const ROTULO_CONCEITO_RH: Record<ConceitoRh, string> = { FRACO: 'Fraco', REGULAR: 'Regular', BOM: 'Bom', OTIMO: 'Ótimo' }

/** Rodada da avaliação: inteiro de 1 a `MAX_RODADAS_RH` (1ª = AC, 2ª = AF, depois só "3ª Avaliação" etc.). */
export type RodadaRh = number
export const MIN_RODADAS_RH = 2
export const MAX_RODADAS_RH = 10
const SIGLAS_RODADA: Record<number, string> = { 1: 'AC', 2: 'AF' }

export const rodadaRhValida = (n: unknown): n is RodadaRh => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_RODADAS_RH

export const tituloRodadaRh = (rodada: RodadaRh) => `${rodada}ª Avaliação`
export const siglaRodadaRh = (rodada: RodadaRh) => SIGLAS_RODADA[rodada] ?? ''
/** "1ª Avaliação (AC)", "2ª Avaliação (AF)", "3ª Avaliação". */
export const rotuloRodadaRh = (rodada: RodadaRh) => (siglaRodadaRh(rodada) ? `${tituloRodadaRh(rodada)} (${siglaRodadaRh(rodada)})` : tituloRodadaRh(rodada))

/** Títulos personalizados por rodada (chave = número da rodada). */
export type TitulosRodadaRh = Record<string, string>
export const MAX_TITULO_RODADA_RH = 60
/** Título da rodada: o definido pelo gerente ou, na falta dele, "1ª Avaliação – AC" / "3ª Avaliação". */
export const nomeRodadaRh = (rodada: RodadaRh, titulos?: TitulosRodadaRh | null) =>
  titulos?.[String(rodada)]?.trim() || (siglaRodadaRh(rodada) ? `${tituloRodadaRh(rodada)} – ${siglaRodadaRh(rodada)}` : tituloRodadaRh(rodada))
/** Lê o JSON do banco ignorando o que não for texto de rodada válida. */
export const lerTitulosRodadaRh = (json: unknown): TitulosRodadaRh => {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {}
  const saida: TitulosRodadaRh = {}
  for (const [k, v] of Object.entries(json)) if (rodadaRhValida(Number(k)) && typeof v === 'string' && v.trim()) saida[k] = v.trim().slice(0, MAX_TITULO_RODADA_RH)
  return saida
}

/** Total de rodadas exibidas: as configuradas no projeto, no mínimo 2 e cobrindo qualquer rodada que já tenha documento. */
export const totalRodadasRh = (configuradas: number | null | undefined, rodadasComDocumento: number[] = []) =>
  Math.min(MAX_RODADAS_RH, Math.max(MIN_RODADAS_RH, configuradas ?? 0, ...rodadasComDocumento.filter(rodadaRhValida)))

export const listaRodadasRh = (total: number): RodadaRh[] => Array.from({ length: Math.max(MIN_RODADAS_RH, Math.min(total, MAX_RODADAS_RH)) }, (_, i) => i + 1)

export interface CriterioRh {
  id: string
  /** Título como no modelo (os quatro primeiros com "- "). */
  titulo: string
  /** Descrição do critério. */
  descricao: string
  /** Frases do modelo, na ordem do modelo. Linha vazia = espaço em branco do modelo. */
  frases: string[]
  /** Recuo das frases: os quatro primeiros critérios recuam mais que a descrição. */
  recuoFrases: 'descricao' | 'maior'
  /** No modelo, o X de alguns critérios fica na linha do título; nos demais, no meio da linha. */
  marcaNoTopo?: boolean
}

export const CRITERIOS_RH: CriterioRh[] = [
  {
    id: 'pontualidade', titulo: '- PONTUALIDADE / ASSIDUIDADE:', recuoFrases: 'maior',
    descricao: 'Disposição do participante em cumprir integralmente seu trabalho.',
    frases: ['Muitas faltas e atrasos constantes.', 'Poucas faltas e atrasos frequentes.', 'Alguns atrasos.', 'Nenhuma falta.'],
  },
  {
    id: 'qualidade', titulo: '- QUALIDADE:', recuoFrases: 'maior',
    descricao: 'Grau de perfeição com que o colaborador executa suas funções.',
    frases: ['Trabalho mal feito e cheio de imperfeições.', 'Qualidade de trabalho irregular: ora é boa, ora deixa a desejar.', 'Trabalho bem feito, com mínima margem de erros.', 'Trabalho de excelente qualidade, sem erros e omissões.'],
  },
  {
    id: 'interesse', titulo: '- INTERESSE PELO TRABALHO', recuoFrases: 'maior',
    descricao: 'Dedicação e esforço pessoal em aperfeiçoar-se cada vez mais para assumir novos encargos e responsabilidades.',
    frases: ['Interessa-se pelo trabalho. Tem vontade de progredir e se esforça.', 'Indiferente. Parece não ter ambição.', 'Mostra algum interesse, porém não se esforça.', 'Possui notável interesse pelo trabalho. Tem muita vontade de progredir e faz o possível para isso, inclusive incentivando os colegas.'],
  },
  {
    id: 'aprendizagem', titulo: '- CAPACIDADE DE APRENDIZAGEM', recuoFrases: 'maior',
    descricao: 'Facilidade de compreender e reter instruções e informações.',
    frases: ['Muita dificuldade para aprender. Necessita instruções constantes e pormenorizadas.', 'Apresenta alguma dificuldade para assimilar novas orientações, aprendizagem lenta.', 'Facilidade para aprender. Poucas instruções são suficientes.', 'Aprende com rapidez surpreendentemente. Ótima capacidade de assimilação.'],
  },
  {
    id: 'responsabilidade', titulo: 'SENSO DE RESPONSABILIDADE', recuoFrases: 'descricao', marcaNoTopo: true,
    descricao: 'Condição de trabalhar sem necessidade de supervisão, adquirida pelo desenvolvimento profissional do empregado.',
    frases: ['É pessoa de inteira confiança. Tem plenas condições para assumir maiores responsabilidades.', 'Tem consciência de suas funções, porém ainda requer um mínimo de supervisão. Pode assumir maiores responsabilidades, desde que devidamente treinado.', 'Não é responsável. Requer supervisão constante.', 'É responsável, porém necessita supervisão regularmente.', 'Ainda não tem condições para assumir maiores responsabilidades.'],
  },
  {
    id: 'comportamento', titulo: 'COMPORTAMENTO NO TRABALHO', recuoFrases: 'descricao', marcaNoTopo: true,
    descricao: 'Conduta pessoal do empregado. Maneira de ser que o caracteriza em suas atitudes.',
    frases: ['É muito simpático e solícito. Dá-se bem com todos.', 'Pouco educado e as vezes grosseiro.', 'Educado, mantém bom relacionamento.', 'Geralmente é educado, porém suas atitudes as vezes são desagradáveis.'],
  },
  {
    id: 'produtividade', titulo: 'PRODUTIVIDADE', recuoFrases: 'descricao',
    descricao: 'Volume de trabalho executado em relação ao tempo gasto.',
    frases: ['Produz sempre mais que a maioria. Aproveita muito bom o tempo.', 'Produtividade insuficiente. Perde tempo.', 'É esforçado, porém produz menos que a maioria do pessoal.', 'Produtividade igual a da maioria. Procura aproveitar bem o tempo.', ''],
  },
  {
    id: 'colaboracao', titulo: 'COLABORAÇÃO COM GRUPO', recuoFrases: 'descricao', marcaNoTopo: true,
    descricao: 'Capacidade de trabalhar em conjunto com outros colegas de forma harmoniosa e eficiente.',
    frases: ['Colabora sempre espontaneamente, transmitindo entusiasmo aos colegas.', 'Evita prestar auxílio.', 'Só coopera quando solicitado, mas com pouco ânimo.', 'Trabalha normalmente em equipe. As vezes colabora espontaneamente.'],
  },
  {
    id: 'conhecimento', titulo: 'CONHECIMENTO DO TRABALHO', recuoFrases: 'descricao', marcaNoTopo: true,
    descricao: 'Considerar a facilidade com a qual trabalha, utilizando-se dos conhecimentos teóricos e práticos que possui.',
    frases: ['Conhecimento apenas superficiais das funções de seu cargo.', 'Conhece perfeitamente todas as funções de seu cargo. Tem condições, inclusive, para assumir outras.', 'Tem boas noções de grande parte das funções.', 'Conhece perfeitamente todas as funções de seu cargo, porém não tem condições para assumir outras funções.'],
  },
  {
    id: 'iniciativa', titulo: 'INICIATIVA', recuoFrases: 'descricao', marcaNoTopo: true,
    descricao: 'Condições em resolver os problemas por si em situações imprevistas, ou o encaminhamento correto para a solução dos problemas. Considerar também a apresentação de sugestões.',
    frases: ['Em situações rotineiras encontra soluções razoáveis. As vezes apresenta sugestões.', 'Aguarda sem ação até que o orientem.', 'Resolve problemas por si, som segurança, e acerto. Apresenta sugestões excelentes visando a melhoria no ambiente e condições de trabalho.', 'Pouco resolve sem perguntar. Não apresenta sugestões.'],
  },
  {
    id: 'disciplina', titulo: 'DISCIPLINA', recuoFrases: 'descricao',
    descricao: 'Facilidade em aceitar instruções de ordem superior, normas e procedimentos da empresa.',
    frases: ['Sempre cumpre ordens e recomendações. Sua conduta é impecável e serve como modelo.', 'As vezes mostra-se reticente em cumprir as ordens recebidas, porém sem perturbar o ambiente de trabalho.', 'Geralmente observa ordens e regulamentos. É disciplinado.', 'Nem sempre acata as instruções recebidas, ocasionando problemas disciplinares.'],
  },
  {
    id: 'apresentacao', titulo: 'APRESENTAÇÃO PESSOAL', recuoFrases: 'descricao',
    descricao: 'Cuidado com asseio pessoal e vestuário. Apresentação de modo geral.',
    frases: ['Veste-se adequadamente para o cargo que ocupa. É asseado.', 'Sua apresentação pessoal não é das melhores. Não se distingue pelo asseio.', 'É asseado, porém descuidado no vestir-se.', 'Apresenta-se de forma irrepreensível.'],
  },
]

export const IDS_CRITERIOS_RH = CRITERIOS_RH.map(c => c.id)

/** Identificação de cada avaliação no histórico de documentos: `rh:<rodada>:<integranteId>`. */
export const recursoAvaliacaoRh = (rodada: RodadaRh, integranteId: string) => `rh:${rodada}:${integranteId}`

export function lerRecursoAvaliacaoRh(resourceId: string): { rodada: RodadaRh; integranteId: string } | null {
  const m = /^rh:([1-9][0-9]?):([A-Za-z0-9_-]{1,58})$/.exec(resourceId)
  if (!m) return null
  const rodada = Number(m[1])
  return rodadaRhValida(rodada) ? { rodada, integranteId: m[2] } : null
}
