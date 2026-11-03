'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import '@/components/projetos/documentacao/documentacao.css'
import './ata-workspace.css'

export default function AtaWorkspace({ projetoId, titulo, children }: { projetoId: string; titulo: string; children: ReactNode }) {
  return <ProjectAppearance enabled isolated><div className="documentacao-theme ata-workspace">
    <header className="ata-workspace-header">
      <Link href={`/projetos/${projetoId}/documentacao?doc=atas`} className="ata-workspace-back" aria-label="Voltar às atas" title="Voltar às atas"><ArrowLeft size={17} /></Link>
      <div className="ata-workspace-heading"><span>Atas de reunião</span><h1 title={titulo}>{titulo}</h1></div>
    </header>
    <main className="ata-workspace-content">{children}</main>
  </div></ProjectAppearance>
}
