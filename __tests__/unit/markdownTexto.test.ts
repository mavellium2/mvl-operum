import { describe, expect, it } from 'vitest'
import { markdownParaTexto } from '@/lib/utils/markdownTexto'

describe('markdownParaTexto', () => {
  it('tira os símbolos de Markdown e junta as linhas', () => {
    const md = '### Situação\n\n**Hoje** não existe *exclusão*.\n\n- membro de projetos\n- [ ] timer `ativo`\n\nVer [card](https://x.y).'
    expect(markdownParaTexto(md)).toBe('Situação Hoje não existe exclusão. membro de projetos timer ativo Ver card.')
  })

  it('transforma tabelas em texto corrido, sem a linha separadora', () => {
    expect(markdownParaTexto('| Perfil | Pode |\n|---|:-:|\n| Membro | sim |')).toBe('Perfil Pode Membro sim')
  })

  it('mantém texto simples como está', () => {
    expect(markdownParaTexto('Corrigir o filtro da lista')).toBe('Corrigir o filtro da lista')
  })
})
