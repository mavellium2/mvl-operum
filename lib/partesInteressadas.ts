import type { Stakeholder } from '@/components/projetos/StakeholderDocument'

const chaveLegada = (p: Stakeholder) => `${p.nome.trim().toLowerCase()}|${(p.email ?? '').trim().toLowerCase()}`

/** Acrescenta pessoas do cadastro sem substituir as células editadas nem duplicar linhas. */
export function identificarPartesDoCadastro(atuais: Stakeholder[], cadastro: Stakeholder[]): Stakeholder[] {
  const ids = new Map(cadastro.filter(p => p.cadastroId).map(p => [chaveLegada(p), p.cadastroId]))
  return atuais.map(p => p.cadastroId || !ids.has(chaveLegada(p)) ? p : { ...p, cadastroId: ids.get(chaveLegada(p)) })
}

export function acrescentarPartesDoCadastro(atuais: Stakeholder[], cadastro: Stakeholder[], excluidos: string[] = []): Stakeholder[] {
  const excluidosSet = new Set(excluidos)
  const ids = new Set(atuais.flatMap(p => p.cadastroId ? [p.cadastroId] : []))
  const legados = new Set(atuais.filter(p => !p.cadastroId).map(chaveLegada))
  const chaves = new Set(atuais.map(chaveLegada))
  let referencia = Math.max(0, ...atuais.map(p => /^\d+$/.test(p.ref) ? Number(p.ref) : 0))
  const novos: Stakeholder[] = []
  for (const pessoa of cadastro) {
    if (pessoa.cadastroId && excluidosSet.has(pessoa.cadastroId)) continue
    const chave = chaveLegada(pessoa)
    if ((pessoa.cadastroId && (ids.has(pessoa.cadastroId) || legados.has(chave))) || (!pessoa.cadastroId && chaves.has(chave))) continue
    novos.push({ ...pessoa, ref: String(++referencia).padStart(2, '0') })
    if (pessoa.cadastroId) ids.add(pessoa.cadastroId)
    chaves.add(chave)
  }
  return novos.length ? [...atuais, ...novos] : atuais
}
