import type { ReactNode } from 'react'

/** Rótulo e assinatura cadastrada na mesma linha, na tela e na impressão. */
export default function AssinaturaEmLinha({ url, rotulo = 'Assinatura:', alt = 'Assinatura do gerente do projeto', vazio }: {
  url?: string | null
  rotulo?: ReactNode
  alt?: string
  vazio?: ReactNode
}) {
  return (
    <span data-assinatura-em-linha="" style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'nowrap', gap: '2mm', whiteSpace: 'nowrap', maxWidth: '100%', verticalAlign: 'middle' }}>
      <span style={{ flexShrink: 0 }}>{rotulo}</span>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={alt} style={{ display: 'inline-block', width: '42mm', height: '8mm', maxWidth: '100%', objectFit: 'contain', objectPosition: 'left center', flexShrink: 1, minWidth: 0 }} />
        : vazio ? <span style={{ color: '#64748b', fontSize: '8pt' }}>{vazio}</span> : null}
    </span>
  )
}
