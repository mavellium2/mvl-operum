import type { Stakeholder } from '@/components/projetos/StakeholderDocument'

/** Pessoa do cadastro com os outros identificadores dela (interno/externo da mesma pessoa). */
type PessoaDoCadastro = Stakeholder & { cadastroAlternativos?: string[] }
const idsDaPessoa = (p: PessoaDoCadastro) => [p.cadastroId, ...(p.cadastroAlternativos ?? [])].filter((x): x is string => !!x)

/** Tira os identificadores alternativos antes de ir para o documento (não fazem parte da linha). */
export function semAlternativos(linhas: PessoaDoCadastro[]): Stakeholder[] {
  return linhas.map(({ cadastroAlternativos: _, ...linha }) => linha)
}

const chaveLegada = (p: Stakeholder) => `${p.nome.trim().toLowerCase()}|${(p.email ?? '').trim().toLowerCase()}`

/** Acrescenta pessoas do cadastro sem substituir as células editadas nem duplicar linhas. */
export function identificarPartesDoCadastro(atuais: Stakeholder[], cadastro: Stakeholder[]): Stakeholder[] {
  const ids = new Map(cadastro.filter(p => p.cadastroId).map(p => [chaveLegada(p), p.cadastroId]))
  return atuais.map(p => p.cadastroId || !ids.has(chaveLegada(p)) ? p : { ...p, cadastroId: ids.get(chaveLegada(p)) })
}

/**
 * Uma pessoa que mudou de interno para externo (ou o contrário) continua a mesma linha:
 * os identificadores alternativos dela contam como já presentes ou já excluídos.
 */
export function acrescentarPartesDoCadastro(atuais: Stakeholder[], cadastro: PessoaDoCadastro[], excluidos: string[] = []): Stakeholder[] {
  const excluidosSet = new Set(excluidos)
  const ids = new Set(atuais.flatMap(p => p.cadastroId ? [p.cadastroId] : []))
  const legados = new Set(atuais.filter(p => !p.cadastroId).map(chaveLegada))
  const chaves = new Set(atuais.map(chaveLegada))
  let referencia = Math.max(0, ...atuais.map(p => /^\d+$/.test(p.ref) ? Number(p.ref) : 0))
  const novos: Stakeholder[] = []
  for (const pessoa of cadastro) {
    const todos = idsDaPessoa(pessoa)
    if (todos.some(id => excluidosSet.has(id))) continue
    const chave = chaveLegada(pessoa)
    if ((pessoa.cadastroId && (todos.some(id => ids.has(id)) || legados.has(chave))) || (!pessoa.cadastroId && chaves.has(chave))) continue
    const { cadastroAlternativos: _, ...linha } = pessoa
    novos.push({ ...linha, ref: String(++referencia).padStart(2, '0') })
    if (pessoa.cadastroId) ids.add(pessoa.cadastroId)
    chaves.add(chave)
  }
  return novos.length ? [...atuais, ...novos] : atuais
}
