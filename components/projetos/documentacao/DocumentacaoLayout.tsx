'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import DocumentoStakeholders, { type CadastroStakeholders } from '@/components/projetos/DocumentoStakeholders'
import HistoricoDocumento from './HistoricoDocumento'
import ProjectCharterWrapper from './ProjectCharterWrapper'
import DocumentoAtas, { type AtaListItem } from './DocumentoAtas'
import EapDocument from './EapDocument'
import CapaDocumento from './CapaDocumento'
import DeclaracaoEscopo from './formularios/DeclaracaoEscopo'
import DocumentoRiscos, { type RiscoListItem } from './formularios/DocumentoRiscos'
import LicoesAprendidas from './formularios/LicoesAprendidas'
import CanvasDocumento from './CanvasDocumento'
import AvaliacaoRhDocumento, { type AvaliacaoRhItem } from './formularios/AvaliacaoRh'
import type { MembroEquipeOption } from './MembroEquipeSelect'
import Drawer from '@/components/ui/Drawer'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import './documentacao.css'

const DOCUMENT_MAP = {
  capa: CapaDocumento,
  stakeholder: DocumentoStakeholders,
  charter: ProjectCharterWrapper,
  eap: EapDocument,
  atas: DocumentoAtas,
  escopo: DeclaracaoEscopo,
  riscos: DocumentoRiscos,
  licoes: LicoesAprendidas,
  canvas: CanvasDocumento,
  'avaliacao-rh': AvaliacaoRhDocumento,
} as const

type DocType = keyof typeof DOCUMENT_MAP

interface Props {
  projetoId: string
  atas: AtaListItem[]
  /** Formulários de Riscos (um documento por risco, como as Atas). */
  riscos?: RiscoListItem[]
  avaliacoesRh?: AvaliacaoRhItem[]
  podeAvaliarRh?: boolean
  gerente: boolean
  /** Membros da equipe — responsáveis/aprovadores dos documentos devem ser membros */
  membros?: MembroEquipeOption[]
  /** Cadastro de Stakeholders (adicionar interno/externo no documento de Partes Interessadas). */
  cadastroStakeholders?: CadastroStakeholders | null
}

export default function DocumentacaoLayout({ projetoId, atas, riscos = [], avaliacoesRh = [], podeAvaliarRh = false, gerente, membros = [], cadastroStakeholders = null }: Props) {
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

  // "Revisar proposta pendente" (barra do editor, lista de atas): abre o histórico e registro num painel.
  // Com `resourceId`, só as versões daquela ata.
  const [revisando, setRevisando] = useState<{ resourceId: string } | null>(null)
  useEffect(() => {
    const abrir = (event: Event) => {
      const detail = (event as CustomEvent<{ projetoId: string; resourceId?: string }>).detail
      if (detail?.projetoId === projetoId) setRevisando({ resourceId: detail.resourceId ?? '' })
    }
    window.addEventListener('operum:revisar-propostas', abrir)
    return () => window.removeEventListener('operum:revisar-propostas', abrir)
  }, [projetoId])
  const tipo = ({ atas: 'ATA', charter: 'CHARTER', eap: 'EAP', stakeholder: 'STAKEHOLDER', capa: 'CAPA', escopo: 'ESCOPO', riscos: 'RISCOS', licoes: 'LICOES', canvas: 'CANVAS', 'avaliacao-rh': 'AVALIACAO_RH' } as const)[activeDoc]

  return (
    <ProjectAppearance enabled isolated>
    <div data-testid="doc-layout" className="documentacao-theme flex flex-col lg:flex-row flex-1 h-full overflow-hidden">
      <div data-testid="doc-content" className="documentacao-content flex-1 min-w-0 overflow-y-auto">
        {activeDoc === 'capa' ? (
          <CapaDocumento key={publication} />
        ) : activeDoc === 'atas' ? (
          <DocumentoAtas projetoId={projetoId} atas={atas} gerente={gerente} />
        ) : activeDoc === 'charter' ? (
          <ProjectCharterWrapper key={publication} membros={membros} />
        ) : activeDoc === 'escopo' ? (
          <DeclaracaoEscopo key={publication} membros={membros} />
        ) : activeDoc === 'riscos' ? (
          <DocumentoRiscos key={`${publication}-${searchParams.get('risco') ?? ''}`} projetoId={projetoId} riscos={riscos} membros={membros} />
        ) : activeDoc === 'licoes' ? (
          <LicoesAprendidas key={publication} membros={membros} />
        ) : activeDoc === 'canvas' ? (
          <CanvasDocumento key={publication} membros={membros} />
        ) : activeDoc === 'avaliacao-rh' ? (
          <AvaliacaoRhDocumento key={`${publication}-${searchParams.get('integrante') ?? ''}-${searchParams.get('rodada') ?? ''}`} projetoId={projetoId} membros={membros} avaliacoes={avaliacoesRh} permitido={podeAvaliarRh} />
        ) : activeDoc === 'eap' ? (
          <EapDocument key={publication} membros={membros} />
        ) : (
          <DocumentoStakeholders key={publication} membros={membros} cadastro={cadastroStakeholders} />
        )}
      </div>
      <Drawer isOpen={!!revisando} onClose={() => setRevisando(null)} title="Propostas e registro do documento" width="w-[480px]">
        {revisando && <HistoricoDocumento key={`${activeDoc}-${revisando.resourceId}`} projetoId={projetoId} type={tipo} resourceId={revisando.resourceId} embutido />}
      </Drawer>
    </div>
    </ProjectAppearance>
  )
}
