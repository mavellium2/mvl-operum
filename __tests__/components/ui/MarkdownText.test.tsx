import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MarkdownText from '@/components/ui/MarkdownText'

describe('MarkdownText', () => {
  it('mostra títulos, listas, negrito e quebras de parágrafo', () => {
    render(<MarkdownText>{'### Resultado\n\nTudo **certo**.\n\n- primeiro\n- segundo'}</MarkdownText>)
    expect(screen.getByRole('heading', { name: 'Resultado' })).toBeInTheDocument()
    expect(screen.getByText('certo').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['primeiro', 'segundo'])
  })

  it('mostra tabelas dentro de um bloco com rolagem própria', () => {
    const { container } = render(<MarkdownText>{'| Perfil | Pode |\n|---|:-:|\n| Membro | ✅ |'}</MarkdownText>)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Perfil' })).toBeInTheDocument()
    expect(container.querySelector('.markdown-text-table > table')).not.toBeNull()
  })

  it('não interpreta HTML digitado no texto', () => {
    const { container } = render(<MarkdownText>{'<img src=x onerror="alert(1)"> <script>alert(1)</script>'}</MarkdownText>)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('remove links perigosos e abre links externos em outra aba', () => {
    render(<MarkdownText>{'[ruim](javascript:alert(1)) [site](https://operum.adm.br)'}</MarkdownText>)
    expect(screen.getByText('ruim').closest('a')?.getAttribute('href') ?? '').not.toMatch(/javascript:/i)
    const site = screen.getByRole('link', { name: 'site' })
    expect(site).toHaveAttribute('target', '_blank')
    expect(site).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('clicar num link não dispara o clique da área que contém o texto', () => {
    const abrirEditor = vi.fn()
    render(<div onClick={abrirEditor}><MarkdownText>{'[interno](/projetos)'}</MarkdownText></div>)
    fireEvent.click(screen.getByRole('link', { name: 'interno' }))
    expect(abrirEditor).not.toHaveBeenCalled()
  })
})
