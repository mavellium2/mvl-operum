import { describe, expect, it } from 'vitest'
import { acrescentarPartesDoCadastro } from '@/lib/partesInteressadas'
import type { Stakeholder } from '@/components/projetos/StakeholderDocument'
const pessoa = (patch: Partial<Stakeholder> = {}): Stakeholder => ({ ref: '01', nome: 'Ana', empresaEquipe: '', cargoCompetencia: '', email: 'ana@x.com', telefoneFax: '', endereco: '', ...patch })
describe('atualizar partes interessadas após cadastro', () => {
  it('inclui membro novo e preserva as células editadas e a numeração da versão atual', () => {
    const atual = pessoa({ cadastroId: 'interno:u1', ref: '05', cargoCompetencia: 'Texto alterado na folha' })
    const novo = pessoa({ cadastroId: 'interno:u2', nome: 'Bia', email: 'bia@x.com' })
    const result = acrescentarPartesDoCadastro([atual], [pessoa({ cadastroId: 'interno:u1' }), novo])
    expect(result).toEqual([atual, { ...novo, ref: '06' }])
  })
  it('não duplica após editar nome/e-mail se o cadastroId é o mesmo', () => {
    const atual = pessoa({ cadastroId: 'interno:u1', nome: 'Nome editado', email: 'novo@x.com' })
    expect(acrescentarPartesDoCadastro([atual], [pessoa({ cadastroId: 'interno:u1' })])).toEqual([atual])
  })
  it('reconhece versões antigas sem cadastroId pelo nome e e-mail', () => {
    expect(acrescentarPartesDoCadastro([pessoa()], [pessoa({ cadastroId: 'interno:u1' })])).toEqual([pessoa()])
  })
})


it('não recoloca na folha pessoas removidas explicitamente desta versão', () => {
  const removido = pessoa({ cadastroId: 'interno:u1' })
  expect(acrescentarPartesDoCadastro([], [removido], ['interno:u1'])).toEqual([])
})
