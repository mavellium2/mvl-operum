import { lerEnvolvidos } from '@/lib/charterEnvolvidos'
import type { CapaConteudo } from '@/lib/validation/documentRevisionSchemas'

export type CampoCapa = keyof Required<CapaConteudo>
export const CAMPOS_CAPA: CampoCapa[] = ['instituicao', 'curso', 'disciplina', 'professor', 'endereco', 'email', 'periodo']

export interface DadosCapaProjeto {
  instituicao?: string | null
  departamentos?: string[]
  semestre?: string | null
  ano?: number | null
  /** "Principais envolvidos" do Termo vigente, para trazer professor e disciplina. */
  principaisEnvolvidos?: string | null
  emailContato?: string | null
}

/** "2026 / 2" no semestral; só o ano no período anual. */
export function periodoCapa(semestre?: string | null, ano?: number | null): string {
  if (!ano) return ''
  return semestre === '1' || semestre === '2' ? `${ano} / ${semestre}` : String(ano)
}

const primeiroDoBloco = (envolvidos: string, padrao: RegExp) => {
  const bloco = lerEnvolvidos(envolvidos).find(b => !b.equipe && padrao.test(b.titulo.trim()))
  return bloco?.texto.split('\n').map(l => l.replace(/^\s*-\s?/, '').trim()).filter(Boolean).join(' / ') ?? ''
}

/** Valores que o sistema traz para os campos editáveis da Capa (o usuário pode trocar). */
export function capaPadrao(d: DadosCapaProjeto): Required<CapaConteudo> {
  const envolvidos = d.principaisEnvolvidos ?? ''
  return {
    instituicao: d.instituicao?.trim() ?? '',
    curso: (d.departamentos ?? []).map(x => x.trim()).filter(Boolean).join(' / '),
    disciplina: primeiroDoBloco(envolvidos, /^disciplina/i),
    professor: primeiroDoBloco(envolvidos, /^(professor|orientador)/i),
    endereco: '',
    email: d.emailContato?.trim() ?? '',
    periodo: periodoCapa(d.semestre, d.ano),
  }
}

/** Conteúdo exibido: o que foi salvo vale sobre o que o sistema traz. */
export function conteudoCapa(padrao: Required<CapaConteudo>, salvo?: CapaConteudo | null): Required<CapaConteudo> {
  const atual = { ...padrao }
  for (const campo of CAMPOS_CAPA) if (typeof salvo?.[campo] === 'string') atual[campo] = salvo[campo]!
  return atual
}
