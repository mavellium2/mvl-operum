'use client'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './MarkdownText.css'

/**
 * Mostra texto escrito em Markdown (descrições e comentários de cards).
 * HTML digitado no texto não é interpretado: aparece como texto, sem executar.
 * Links perigosos (javascript:, data:) são removidos pelo react-markdown.
 */
const components: Components = {
  a: ({ href, children }) => {
    const externo = !!href && /^https?:\/\//i.test(href)
    return (
      // Clicar no link não deve abrir o editor da área que contém o texto.
      <a href={href} onClick={e => e.stopPropagation()} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    )
  },
  // Tabela larga rola dentro do próprio bloco, sem alargar o card.
  table: ({ children }) => (
    <div className="markdown-text-table">
      <table>{children}</table>
    </div>
  ),
}

export default function MarkdownText({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`markdown-text ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
