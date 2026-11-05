import type { ReactNode } from 'react'

/** Mesmo recuo e ritmo de linhas na edição, leitura e impressão do Termo. */
export function EnvolvidosLayout({ children }: { children: ReactNode }) {
  return <div style={{ padding: '5mm', lineHeight: 1.25 }}>{children}</div>
}
export default function GrupoEnvolvidos({ titulo, controles, children }: { titulo: ReactNode; controles?: ReactNode; children: ReactNode }) {
  return <div style={{ position: 'relative', breakInside: 'avoid', marginBottom: '4mm' }}>
    <div style={{ fontWeight: 'bold', paddingRight: controles ? 50 : undefined, margin: 0 }}>{titulo}</div>
    <div style={{ marginLeft: '22.5mm', marginTop: 0 }}>{children}</div>
    {controles && <div className="print:hidden" style={{ position: 'absolute', top: 0, right: 0 }}>{controles}</div>}
  </div>
}
