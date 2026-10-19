'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import DocumentoStakeholders from '@/components/projetos/DocumentoStakeholders'
import HistoricoDocumento from './HistoricoDocumento'
import ProjectCharterWrapper from './ProjectCharterWrapper'
import DocumentoAtas, { type AtaListItem } from './DocumentoAtas'
import EapDocument from './EapDocument'
import type { MembroEquipeOption } from './MembroEquipeSelect'

const DOCUMENT_MAP = {
  stakeholder: DocumentoStakeholders,
  charter: ProjectCharterWrapper,
  eap: EapDocument,
  atas: DocumentoAtas,
} as const

type DocType = keyof typeof DOCUMENT_MAP

interface Props {
  projetoId: string
  atas: AtaListItem[]
  gerente: boolean
  /** Membros da equipe — responsáveis/aprovadores dos documentos devem ser membros */
  membros?: MembroEquipeOption[]
}

export default function DocumentacaoLayout({ projetoId, atas, gerente, membros = [] }: Props) {
  const searchParams = useSearchParams()

  const raw = searchParams.get('doc') ?? 'stakeholder'
  const activeDoc: DocType = raw in DOCUMENT_MAP ? (raw as DocType) : 'stakeholder'

  const [publication, setPublication] = useState(0)
  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent<{ projetoId: string }>).detail
      if (detail?.projetoId === projetoId) setPublication(value => value + 1)
    }
    window.addEventListener('operum:document-published', refresh)
    return () => window.removeEventListener('operum:document-published', refresh)
  }, [projetoId])

  return (
    <div data-testid="doc-layout" className="flex flex-col lg:flex-row flex-1 h-full overflow-hidden">
      <div data-testid="doc-content" className="flex-1 min-w-0 overflow-y-auto">
        <HistoricoDocumento key={activeDoc} projetoId={projetoId} type={{ atas: 'ATA', charter: 'CHARTER', eap: 'EAP', stakeholder: 'STAKEHOLDER' }[activeDoc]} />
        {activeDoc === 'atas' ? (
          <DocumentoAtas projetoId={projetoId} atas={atas} gerente={gerente} />
        ) : activeDoc === 'charter' ? (
          <ProjectCharterWrapper key={publication} membros={membros} />
        ) : activeDoc === 'eap' ? (
          <EapDocument key={publication} membros={membros} />
        ) : (
          <DocumentoStakeholders key={publication} membros={membros} />
        )}
      </div>
    </div>
  )
}