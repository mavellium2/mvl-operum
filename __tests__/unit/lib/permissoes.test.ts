import { describe, it, expect } from 'vitest'
import {
  PADRAO_MEMBRO,
  TODAS,
  cargosDoTexto,
  isPermissao,
  resolverPermissoes,
  type EntradaResolucao,
  type Permissao,
} from '@/lib/permissoes'

const base: EntradaResolucao = {
  admin: false,
  membro: true,
  base: null,
  funcoes: [],
  ajustesGlobais: [],
  ajustesProjeto: [],
}
const lista = (s: Set<string>) => [...s].sort()

describe('resolverPermissoes (SDD 5.1)', () => {
  it('admin tem todas, mesmo sem ser membro', () => {
    expect(lista(resolverPermissoes({ ...base, admin: true, membro: false }))).toEqual([...TODAS].sort())
  })

  it('quem não é membro do projeto não recebe nada, nem por ajuste', () => {
    const r = resolverPermissoes({ ...base, membro: false, ajustesProjeto: [{ permissao: 'projeto:ver', efeito: 'GRANT' }] })
    expect(r.size).toBe(0)
  })

  it('membro sem função: o padrão do membro (comportamento de hoje)', () => {
    expect(lista(resolverPermissoes(base))).toEqual([...PADRAO_MEMBRO].sort())
  })

  it('gerente de projeto sem configuração: tudo', () => {
    const r = resolverPermissoes({ ...base, funcoes: [{ chave: 'gerente de projeto', definidas: null }] })
    expect(lista(r)).toEqual([...TODAS].sort())
  })

  it('Tech Lead e PO sem configuração: iguais ao usuário comum (decisão de 30/09)', () => {
    const r = resolverPermissoes({ ...base, funcoes: [{ chave: 'tech lead', definidas: null }, { chave: 'po', definidas: null }] })
    expect(lista(r)).toEqual([...PADRAO_MEMBRO].sort())
  })

  it('o admin define qualquer permissão para qualquer função, inclusive o gerente', () => {
    const r = resolverPermissoes({
      ...base,
      funcoes: [
        { chave: 'tech lead', definidas: ['quadro:sprints', 'planilha:realizado-todos'] },
        { chave: 'gerente de projeto', definidas: ['documentos:aprovar'] },
      ],
    })
    expect(r.has('quadro:sprints')).toBe(true)
    expect(r.has('planilha:realizado-todos')).toBe(true)
    expect(r.has('documentos:aprovar')).toBe(true)
    // gerente configurado deixa de ter "tudo"
    expect(r.has('projeto:equipe')).toBe(false)
  })

  it('a base do membro também é configurável', () => {
    const r = resolverPermissoes({ ...base, base: ['projeto:ver', 'quadro:ver'] })
    expect(lista(r)).toEqual(['projeto:ver', 'quadro:ver'])
  })

  it('várias funções somam', () => {
    const r = resolverPermissoes({
      ...base,
      base: [],
      funcoes: [{ chave: 'a', definidas: ['quadro:ver'] }, { chave: 'b', definidas: ['planilha:ver'] }],
    })
    expect(lista(r)).toEqual(['planilha:ver', 'quadro:ver'])
  })

  it('ajuste global concede a mais e nega a menos', () => {
    const r = resolverPermissoes({
      ...base,
      ajustesGlobais: [
        { permissao: 'planilha:orcado', efeito: 'GRANT' },
        { permissao: 'quadro:mover', efeito: 'DENY' },
      ],
    })
    expect(r.has('planilha:orcado')).toBe(true)
    expect(r.has('quadro:mover')).toBe(false)
  })

  it('o ajuste do projeto vence o global, nos dois sentidos', () => {
    const r = resolverPermissoes({
      ...base,
      ajustesGlobais: [
        { permissao: 'planilha:orcado', efeito: 'GRANT' },
        { permissao: 'quadro:mover', efeito: 'DENY' },
      ],
      ajustesProjeto: [
        { permissao: 'planilha:orcado', efeito: 'DENY' },
        { permissao: 'quadro:mover', efeito: 'GRANT' },
      ],
    })
    expect(r.has('planilha:orcado')).toBe(false)
    expect(r.has('quadro:mover')).toBe(true)
  })

  it('negar no usuário vence o que a função dá', () => {
    const r = resolverPermissoes({
      ...base,
      funcoes: [{ chave: 'gerente de projeto', definidas: null }],
      ajustesProjeto: [{ permissao: 'projeto:equipe', efeito: 'DENY' }],
    })
    expect(r.has('projeto:equipe')).toBe(false)
    expect(r.has('documentos:aprovar')).toBe(true)
  })
})

describe('auxiliares', () => {
  it('cargosDoTexto', () => {
    expect(cargosDoTexto(' Dev, Gerente de Projeto ,, ')).toEqual(['Dev', 'Gerente de Projeto'])
    expect(cargosDoTexto(null)).toEqual([])
  })

  it('isPermissao', () => {
    expect(isPermissao('documentos:aprovar')).toBe(true)
    expect(isPermissao('documentos:tudo')).toBe(false)
  })
})

describe('pessoa com mais de uma função', () => {
  const entrada = (funcoes: { chave: string; definidas: Permissao[] | null }[], ajustesProjeto: { permissao: Permissao; efeito: 'GRANT' | 'DENY' }[] = []) =>
    resolverPermissoes({ admin: false, membro: true, base: ['projeto:ver'], funcoes, ajustesGlobais: [], ajustesProjeto })

  it('fica com tudo que estiver ativo em qualquer uma das funções (soma)', () => {
    const p = entrada([
      { chave: 'desenvolvedora front-end', definidas: ['quadro:cards', 'quadro:mover'] },
      { chave: 'redatora', definidas: ['documentos:editar', 'documentos:aprovar'] },
    ])
    expect([...p].sort()).toEqual(['documentos:aprovar', 'documentos:editar', 'projeto:ver', 'quadro:cards', 'quadro:mover'])
  })

  it('uma função sem nada marcado não tira o que a outra dá', () => {
    const p = entrada([
      { chave: 'redatora', definidas: [] },
      { chave: 'tech lead', definidas: ['quadro:sprints'] },
    ])
    expect(p.has('quadro:sprints')).toBe(true)
    expect(p.has('projeto:ver')).toBe(true)
  })

  it('só o ajuste individual "negar" retira', () => {
    const p = entrada([{ chave: 'redatora', definidas: ['documentos:aprovar'] }], [{ permissao: 'documentos:aprovar', efeito: 'DENY' }])
    expect(p.has('documentos:aprovar')).toBe(false)
  })

  it('cargo antigo gravado como "A | B" conta as duas funções', () => {
    expect(cargosDoTexto('Desenvolvedora Front-End | Redatora')).toEqual(['Desenvolvedora Front-End', 'Redatora'])
    expect(cargosDoTexto('Tech Lead, Full-stack')).toEqual(['Tech Lead', 'Full-stack'])
  })
})
