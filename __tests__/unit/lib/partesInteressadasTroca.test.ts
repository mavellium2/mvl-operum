import { describe, expect, it } from 'vitest'
import { acrescentarPartesDoCadastro, semAlternativos } from '@/lib/partesInteressadas'
import type { Stakeholder } from '@/components/projetos/StakeholderDocument'

const linha = (cadastroId: string, nome: string): Stakeholder => ({ ref: '01', cadastroId, nome, empresaEquipe: '', cargoCompetencia: '', email: '', telefoneFax: '', endereco: '' })

describe('pessoa que mudou de interno para externo no documento', () => {
  it('não entra duplicada: o identificador antigo dela vale como já presente', () => {
    const salvas = [linha('interno:u1', 'Paulo')]
    const cadastro = [{ ...linha('externo:sk1', 'Paulo'), cadastroAlternativos: ['interno:u1'] }]
    expect(acrescentarPartesDoCadastro(salvas, cadastro)).toEqual(salvas)
  })
  it('quem foi removido do documento continua fora depois da troca', () => {
    const cadastro = [{ ...linha('externo:sk1', 'Paulo'), cadastroAlternativos: ['interno:u1'] }]
    expect(acrescentarPartesDoCadastro([], cadastro, ['interno:u1'])).toEqual([])
  })
  it('linhas novas não levam os identificadores alternativos', () => {
    const cadastro = [{ ...linha('externo:sk2', 'Bia'), cadastroAlternativos: ['interno:u2'] }]
    const [nova] = acrescentarPartesDoCadastro([], cadastro)
    expect(nova).not.toHaveProperty('cadastroAlternativos')
    expect(semAlternativos(cadastro)[0]).not.toHaveProperty('cadastroAlternativos')
  })
})
