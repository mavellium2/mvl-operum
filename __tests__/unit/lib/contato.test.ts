import { describe, it, expect } from 'vitest'
import {
  emailValido,
  erroEmail,
  erroTelefone,
  formatEmail,
  formatTelefone,
  normalizarContato,
  telefoneValido,
} from '@/lib/contato'

describe('formatTelefone', () => {
  it('aplica a máscara enquanto digita', () => {
    expect(formatTelefone('1')).toBe('(1')
    expect(formatTelefone('11')).toBe('(11')
    expect(formatTelefone('119')).toBe('(11) 9')
    expect(formatTelefone('119999')).toBe('(11) 9999')
    expect(formatTelefone('1199998')).toBe('(11) 9999-8')
  })

  it('formata fixo e celular completos', () => {
    expect(formatTelefone('1133334444')).toBe('(11) 3333-4444')
    expect(formatTelefone('11999998888')).toBe('(11) 99999-8888')
    expect(formatTelefone('(11) 9 9999-8888')).toBe('(11) 99999-8888')
  })

  it('descarta letras e dígitos além do limite', () => {
    expect(formatTelefone('11a99999b8888')).toBe('(11) 99999-8888')
    expect(formatTelefone('119999988887777')).toBe('(11) 99999-8888')
  })

  it('trata número internacional', () => {
    expect(formatTelefone('+')).toBe('+')
    expect(formatTelefone('+1 (415) 555-0100')).toBe('+14155550100')
    expect(formatTelefone('+55 11 99999-8888')).toBe('+55 (11) 99999-8888')
  })

  it('vazio continua vazio', () => {
    expect(formatTelefone('')).toBe('')
    expect(formatTelefone(null)).toBe('')
  })
})

describe('telefoneValido', () => {
  it('aceita fixo e celular brasileiros', () => {
    expect(telefoneValido('(11) 3333-4444')).toBe(true)
    expect(telefoneValido('(11) 99999-8888')).toBe(true)
    expect(telefoneValido('+55 (21) 98888-7777')).toBe(true)
  })

  it('recusa número incompleto, DDD inválido ou celular sem 9', () => {
    expect(telefoneValido('(11) 9999-888')).toBe(false)
    expect(telefoneValido('(01) 3333-4444')).toBe(false)
    expect(telefoneValido('(11) 89999-8888')).toBe(false)
    expect(telefoneValido('(11) 1333-4444')).toBe(false)
  })

  it('aceita internacional com 8 a 15 dígitos', () => {
    expect(telefoneValido('+14155550100')).toBe(true)
    expect(telefoneValido('+1234567')).toBe(false)
  })
})

describe('e-mail', () => {
  it('remove espaços sem mudar maiúsculas', () => {
    expect(formatEmail('  Ana.Silva @Empresa.com ')).toBe('Ana.Silva@Empresa.com')
  })

  it('valida o formato', () => {
    expect(emailValido('ana@empresa.com.br')).toBe(true)
    expect(emailValido('a+tag@b.io')).toBe(true)
    expect(emailValido('ana@empresa')).toBe(false)
    expect(emailValido('ana..silva@empresa.com')).toBe(false)
    expect(emailValido('ana@-empresa.com')).toBe(false)
    expect(emailValido('sem-arroba.com')).toBe(false)
  })

  it('mensagens de erro respeitam campo opcional ou obrigatório', () => {
    expect(erroEmail('')).toBeNull()
    expect(erroEmail('', true)).toBe('E-mail é obrigatório.')
    expect(erroEmail('x@')).toMatch(/E-mail inválido/)
    expect(erroTelefone('')).toBeNull()
    expect(erroTelefone('123')).toMatch(/Telefone inválido/)
  })
})

describe('normalizarContato', () => {
  it('formata valores válidos', () => {
    const r = normalizarContato({ name: 'Ana', email: ' ana@x.com ', phone: '11999998888' })
    expect(r.data).toEqual({ name: 'Ana', email: 'ana@x.com', phone: '(11) 99999-8888' })
  })

  it('recusa valores inválidos', () => {
    expect(normalizarContato({ email: 'ana@' }).error).toMatch(/E-mail inválido/)
    expect(normalizarContato({ phone: '1234' }).error).toMatch(/Telefone inválido/)
  })

  it('exige e-mail quando obrigatório', () => {
    expect(normalizarContato({}, { emailObrigatorio: true }).error).toBe('E-mail é obrigatório.')
  })

  it('mantém telefone vazio para permitir limpar o campo', () => {
    expect(normalizarContato({ phone: '' }).data).toEqual({ phone: '' })
  })

  it('não revalida valores antigos que não mudaram', () => {
    const r = normalizarContato({ email: 'legado', phone: 'Tel 1234' }, { atual: { email: 'legado', phone: 'Tel 1234' } })
    expect(r.error).toBeUndefined()
    expect(r.data).toEqual({})
  })
})
