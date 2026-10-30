'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import DocumentoStakeholders, { type CadastroStakeholders } from '@/components/projetos/DocumentoStakeholders'
import HistoricoDocumento from './HistoricoDocumento'
import ProjectCharterWrapper from './ProjectCharterWrapper'
import DocumentoAtas, { type AtaListItem } from './DocumentoAtas'
import EapDocument from './EapDocument'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import Drawer from '@/components/ui/Drawer'

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
  /** Cadastro de Stakeholders (adicionar interno/externo no documento de Partes Interessadas). */
  cadastroStakeholders?: CadastroStakeholders | null
}

export default function DocumentacaoLayout({ projetoId, atas, gerente, membros = [], cadastroStakeholders = null }: Props) {
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

  // "Revisar proposta pendente" (barra do editor): abre o histórico e registro do documento num painel.
  const [revisando, setRevisando] = useState(false)
  useEffect(() => {
    const abrir = (event: Event) => {
      if ((event as CustomEvent<{ projetoId: string }>).detail?.projetoId === projetoId) setRevisando(true)
    }
    window.addEventListener('operum:revisar-propostas', abrir)
    return () => window.removeEventListener('operum:revisar-propostas', abrir)
  }, [projetoId])
  const tipo = ({ atas: 'ATA', charter: 'CHARTER', eap: 'EAP', stakeholder: 'STAKEHOLDER' } as const)[activeDoc]

  return (
    <div data-testid="doc-layout" className="flex flex-col lg:flex-row flex-1 h-full overflow-hidden">
      <div data-testid="doc-content" className="flex-1 min-w-0 overflow-y-auto">
        {activeDoc === 'atas' && <HistoricoDocumento key={activeDoc} projetoId={projetoId} type={tipo} />}
        {activeDoc === 'atas' ? (
          <DocumentoAtas projetoId={projetoId} atas={atas} gerente={gerente} />
        ) : activeDoc === 'charter' ? (
          <ProjectCharterWrapper key={publication} membros={membros} />
        ) : activeDoc === 'eap' ? (
          <EapDocument key={publication} membros={membros} />
        ) : (
          <DocumentoStakeholders key={publication} membros={membros} cadastro={cadastroStakeholders} />
        )}
      </div>
      <Drawer isOpen={revisando} onClose={() => setRevisando(false)} title="Propostas e registro do documento" width="w-[480px]">
        {revisando && <HistoricoDocumento key={activeDoc} projetoId={projetoId} type={tipo} embutido />}
      </Drawer>
    </div>
  )
}