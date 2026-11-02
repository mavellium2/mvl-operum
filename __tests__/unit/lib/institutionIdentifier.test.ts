import { expect, it } from 'vitest'
import { institutionIdentifier, availableInstitutionIdentifier } from '@/lib/institutionIdentifier'
import { CreateTenantSchema } from '@/lib/validation/tenantSchemas'
it('normaliza acentos, espaços e pontuação e gera bases válidas para nomes curtos', () => {
  expect(institutionIdentifier('Teste Brasileiro')).toBe('teste-brasileiro')
  expect(institutionIdentifier(' São   João! ')).toBe('sao-joao')
  for (const name of ['A', '🎓', 'x'.repeat(100), '---']) expect(CreateTenantSchema.shape.subdomain.safeParse(institutionIdentifier(name)).success).toBe(true)
})
it('incrementa colisões e respeita o limite com sufixos', () => {
  expect(availableInstitutionIdentifier('teste', ['teste', 'teste-2'])).toBe('teste-3')
  const base = 'x'.repeat(63)
  const result = availableInstitutionIdentifier(base, [base])
  expect(result).toHaveLength(63)
  expect(result.endsWith('-2')).toBe(true)
})
it('rejeita tamanho e formato inválidos no servidor', () => {
  for (const value of ['ab', 'x'.repeat(64), 'tem espaço', 'acentuação']) expect(CreateTenantSchema.shape.subdomain.safeParse(value).success).toBe(false)
})
