/**
 * Permissões do projeto (SDD 5.1). Modelo definido pelo usuário em 30/09/2026:
 * - o admin dá a qualquer função as permissões que quiser (matriz de funções);
 * - por usuário, pode conceder ou negar a mais ou a menos, no global ou num
 *   projeto (o ajuste do projeto vence o global);
 * - as funções de uma pessoa no projeto são os vínculos dela com o cadastro de
 *   funções (UserProjectFuncao), uma por item.
 *
 * Enquanto o admin não definir as permissões de uma função, valem os padrões
 * abaixo, que reproduzem o comportamento anterior (gerente pode tudo; membro vê
 * tudo, mexe nos cards, edita documentos com versão pendente e lança o realizado
 * das próprias linhas). Tech Lead e PO não têm padrão: por decisão do usuário,
 * começam iguais ao usuário comum.
 *
 * Com várias funções, a pessoa fica com tudo que estiver ativo em qualquer uma
 * delas (soma): uma função nunca tira permissão de outra. Só o ajuste individual
 * "negar" retira.
 *
 * Sem dependências de servidor: é usado também pela interface.
 */

export const PERMISSOES = [
  { chave: 'projeto:ver', grupo: 'Projeto', rotulo: 'Ver o projeto' },
  { chave: 'projeto:editar', grupo: 'Projeto', rotulo: 'Editar dados do projeto e macrofases' },
  { chave: 'projeto:equipe', grupo: 'Projeto', rotulo: 'Gerenciar membros e stakeholders' },
  { chave: 'quadro:ver', grupo: 'Quadro', rotulo: 'Ver sprints e cards' },
  { chave: 'quadro:cards', grupo: 'Quadro', rotulo: 'Criar e editar cards' },
  { chave: 'quadro:mover', grupo: 'Quadro', rotulo: 'Mover cards' },
  { chave: 'quadro:excluir', grupo: 'Quadro', rotulo: 'Excluir cards' },
  { chave: 'quadro:sprints', grupo: 'Quadro', rotulo: 'Gerenciar sprints e colunas' },
  { chave: 'documentos:ver', grupo: 'Documentos', rotulo: 'Ver documentos' },
  { chave: 'documentos:editar', grupo: 'Documentos', rotulo: 'Editar documentos (gera versão pendente)' },
  { chave: 'documentos:aprovar', grupo: 'Documentos', rotulo: 'Aprovar ou rejeitar versões' },
  { chave: 'documentos:excluir', grupo: 'Documentos', rotulo: 'Excluir documentos' },
  { chave: 'planilha:ver', grupo: 'Planilha de custos', rotulo: 'Ver a planilha' },
  { chave: 'planilha:orcado', grupo: 'Planilha de custos', rotulo: 'Editar o orçado' },
  { chave: 'planilha:realizado-proprio', grupo: 'Planilha de custos', rotulo: 'Editar o realizado das próprias linhas' },
  { chave: 'planilha:realizado-todos', grupo: 'Planilha de custos', rotulo: 'Editar o realizado de todas as linhas' },
  { chave: 'cadastros:gerenciar', grupo: 'Cadastros', rotulo: 'Gerenciar funções e departamentos do projeto' },
] as const

export type Permissao = (typeof PERMISSOES)[number]['chave']

export const TODAS: readonly Permissao[] = PERMISSOES.map(p => p.chave)

const VALIDAS = new Set<string>(TODAS)

export function isPermissao(valor: string): valor is Permissao {
  return VALIDAS.has(valor)
}

/** Base de todo membro do projeto, enquanto a função "Membro do projeto" não for configurada. */
export const PADRAO_MEMBRO: readonly Permissao[] = [
  'projeto:ver',
  'quadro:ver',
  'quadro:cards',
  'quadro:mover',
  'documentos:ver',
  'documentos:editar',
  'planilha:ver',
  'planilha:realizado-proprio',
]

/** A função-base aplicada a todo membro do projeto (Role com este nameKey, escopo PROJETO). */
export const BASE_MEMBRO_KEY = 'membro-base'
export const BASE_MEMBRO_NOME = 'Membro do projeto'

/**
 * Padrões por função (funcaoKey do nome), usados só enquanto o admin não
 * definir as permissões dela. "gerente" é o nameKey do papel de gerente.
 */
const PADRAO_POR_FUNCAO: Record<string, readonly Permissao[]> = {
  gerente: TODAS,
  'gerente de projeto': TODAS,
}

export function padraoDaFuncao(chaveFuncao: string): readonly Permissao[] {
  return PADRAO_POR_FUNCAO[chaveFuncao] ?? []
}

export interface FuncaoDoUsuario {
  /** funcaoKey do nome da função (ou o nameKey do papel de gerente). */
  chave: string
  /** Permissões definidas pelo admin; null = ainda não definidas (usa o padrão). */
  definidas: readonly Permissao[] | null
}

export interface Ajuste {
  permissao: Permissao
  efeito: 'GRANT' | 'DENY'
}

export interface EntradaResolucao {
  admin: boolean
  /** Membro ativo do projeto. Quem não é membro não recebe nada (nem por ajuste). */
  membro: boolean
  /** Permissões da função-base definidas pelo admin; null = padrão do membro. */
  base: readonly Permissao[] | null
  funcoes: readonly FuncaoDoUsuario[]
  ajustesGlobais: readonly Ajuste[]
  ajustesProjeto: readonly Ajuste[]
}

function aplicar(permissoes: Set<Permissao>, ajustes: readonly Ajuste[]) {
  for (const a of ajustes) {
    if (a.efeito === 'GRANT') permissoes.add(a.permissao)
    else permissoes.delete(a.permissao)
  }
}

/**
 * 1. Admin tem tudo. 2. Não membro não tem nada. 3. Base do membro ∪ funções.
 * 4. Ajustes globais do usuário. 5. Ajustes do projeto, por último: um DENY no
 * projeto vence um GRANT global, e vice-versa.
 */
export function resolverPermissoes(e: EntradaResolucao): Set<Permissao> {
  if (e.admin) return new Set(TODAS)
  if (!e.membro) return new Set()
  const permissoes = new Set<Permissao>(e.base ?? PADRAO_MEMBRO)
  for (const f of e.funcoes) {
    for (const p of f.definidas ?? padraoDaFuncao(f.chave)) permissoes.add(p)
  }
  aplicar(permissoes, e.ajustesGlobais)
  aplicar(permissoes, e.ajustesProjeto)
  return permissoes
}

