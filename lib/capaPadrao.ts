import { lerEnvolvidos } from '@/lib/charterEnvolvidos'
import type { CapaConteudo } from '@/lib/validation/documentRevisionSchemas'

export type CampoCapa = keyof Required<CapaConteudo>
export const CAMPOS_CAPA: CampoCapa[] = ['instituicao', 'curso', 'disciplina', 'professor', 'endereco', 'email', 'periodo']

export interface DadosCapaProjeto {
  /** Só para sobrescrever o padrão do modelo; a localização curta do projeto não entra aqui. */
  instituicao?: string | null
  curso?: string | null
  semestre?: string | null
  ano?: number | null
  hoje?: Date
  /** "Principais envolvidos" do Termo vigente, para trazer professor e disciplina. */
  principaisEnvolvidos?: string | null
  emailContato?: string | null
}

/** Textos do modelo "01 - CAPA" que vêm preenchidos (o usuário pode trocar). */
export const INSTITUICAO_PADRAO = 'Faculdade de Tecnologia de Garça Deputado Júlio Julinho Marcondes de Moura”'
export const CURSO_PADRAO = 'CURSO SUPERIOR DE TECNOLOGIA EM ANÁLISE E DESENVOLVIMENTO DE SISTEMAS - ADS'
export const ENDERECO_PADRAO = 'Av. Presidente Vargas, 2331 – 17404-500 – Garça/SP – Tel.: (14) 3588-1800'

/** "2026 / 2" no semestral; só o ano no período anual. Sem ano no projeto, usa o ano atual. */
export function periodoCapa(semestre?: string | null, ano?: number | null, hoje = new Date()): string {
  const valor = ano || hoje.getFullYear()
  return semestre === '1' || semestre === '2' ? `${valor} / ${semestre}` : String(valor)
}

const primeiroDoBloco = (envolvidos: string, padrao: RegExp) => {
  const bloco = lerEnvolvidos(envolvidos).find(b => !b.equipe && padrao.test(b.titulo.trim()))
  return bloco?.texto.split('\n').map(l => l.replace(/^\s*-\s?/, '').trim()).filter(Boolean).join(' / ') ?? ''
}

/** Valores que o sistema traz para os campos editáveis da Capa (o usuário pode trocar). */
export function capaPadrao(d: DadosCapaProjeto): Required<CapaConteudo> {
  const envolvidos = d.principaisEnvolvidos ?? ''
  return {
    instituicao: d.instituicao?.trim() || INSTITUICAO_PADRAO,
    curso: d.curso?.trim() || CURSO_PADRAO,
    disciplina: primeiroDoBloco(envolvidos, /^disciplina/i),
    professor: primeiroDoBloco(envolvidos, /^(professor|orientador)/i),
    endereco: ENDERECO_PADRAO,
    email: d.emailContato?.trim() ?? '',
    periodo: periodoCapa(d.semestre, d.ano, d.hoje),
  }
}

/** Rascunho guarda só o que o usuário trocou; o resto acompanha o que o sistema traz. */
export function alteracoesCapa(atual: Required<CapaConteudo>, base: Required<CapaConteudo>): CapaConteudo {
  const diff: CapaConteudo = {}
  for (const campo of CAMPOS_CAPA) if (atual[campo] !== base[campo]) diff[campo] = atual[campo]
  return diff
}

/** Conteúdo exibido: o que foi salvo vale sobre o que o sistema traz. */
export function conteudoCapa(padrao: Required<CapaConteudo>, salvo?: CapaConteudo | null): Required<CapaConteudo> {
  const atual = { ...padrao }
  for (const campo of CAMPOS_CAPA) if (typeof salvo?.[campo] === 'string') atual[campo] = salvo[campo]!
  return atual
}
