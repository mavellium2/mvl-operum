'use client'

import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { GripVertical } from 'lucide-react'
import { fetchWithSession } from '@/lib/clientFetch'
import { navegarComGuarda } from '@/components/documentos/editor/GuardaSaida'

const DOCUMENTS = [
  { id: 'stakeholder', label: 'Partes Interessadas', tipo: 'STAKEHOLDER' },
  { id: 'charter', label: 'Termo de Abertura', tipo: 'CHARTER' },
  { id: 'eap', label: 'EAP', tipo: 'EAP' },
  { id: 'atas', label: 'Atas de Reunião', tipo: 'ATA' },
] as const

type DocId = (typeof DOCUMENTS)[number]['id']

const STORAGE_KEY = 'wbs-document-sidebar-order'

interface Props {
  embedded?: boolean
  activeDoc: string
  onSelect: (id: string) => void
  /** Com o projeto, mostra o estado de cada documento (propostas pendentes de aprovação). */
  projetoId?: string
}

/** Propostas pendentes por documento (bolinha laranja + contador no menu). */
function usePendentes(projetoId?: string): Partial<Record<DocId, number>> {
  const [pendentes, setPendentes] = useState<Partial<Record<DocId, number>>>({})
  useEffect(() => {
    if (!projetoId) return
    let ativo = true
    const carregar = async () => {
      const pares = await Promise.all(DOCUMENTS.map(async d => {
        try {
          const r = await fetchWithSession(`/api/projects/${projetoId}/revisions?type=${d.tipo}&tab=historico`)
          if (!r.ok) return [d.id, 0] as const
          const data = await r.json()
          const lista: { status: string }[] = Array.isArray(data?.versions) ? data.versions : []
          return [d.id, lista.filter(v => v.status === 'PENDING').length] as const
        } catch { return [d.id, 0] as const }
      }))
      if (ativo) setPendentes(Object.fromEntries(pares))
    }
    void carregar()
    const atualizar = (e: Event) => { if ((e as CustomEvent<{ projetoId: string }>).detail?.projetoId === projetoId) void carregar() }
    window.addEventListener('operum:document-version', atualizar)
    window.addEventListener('operum:document-published', atualizar)
    return () => {
      ativo = false
      window.removeEventListener('operum:document-version', atualizar)
      window.removeEventListener('operum:document-published', atualizar)
    }
  }, [projetoId])
  return pendentes
}

function loadOrder(): DocId[] {
  const defaultOrder = DOCUMENTS.map(d => d.id)
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaultOrder
    const parsed = JSON.parse(stored) as string[]
    const valid = parsed.filter((id): id is DocId => defaultOrder.includes(id as DocId))
    // Garante que documentos novos (não presentes num order salvo antigo) continuem aparecendo.
    const missing = defaultOrder.filter(id => !valid.includes(id))
    return [...valid, ...missing]
  } catch {
    return defaultOrder
  }
}

export default function DocumentSidebar({ activeDoc, onSelect, embedded = false, projetoId }: Props) {
  const pendentes = usePendentes(projetoId)
  const [order, setOrder] = useState<DocId[]>(DOCUMENTS.map(d => d.id))

  // Lido do localStorage só no client, depois do primeiro paint, para não gerar
  // divergência de hidratação entre servidor e navegador.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(loadOrder())
  }, [])

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return
    setOrder(prev => {
      const next = [...prev]
      const [moved] = next.splice(result.source.index, 1)
      next.splice(result.destination!.index, 0, moved)
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const orderedDocs = order
    .map(id => DOCUMENTS.find(d => d.id === id))
    .filter((d): d is (typeof DOCUMENTS)[number] => Boolean(d))

  return (
    <nav aria-label="Documentos" className={embedded ? "ml-3 border-l border-slate-200 py-2 pl-2" : "w-full lg:w-56 max-h-48 lg:max-h-none overflow-y-auto shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 flex flex-col py-4 gap-1 px-2"}>
      {!embedded && (
        <p className="px-2 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Documentos
        </p>
      )}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="documents">
          {provided => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
              {orderedDocs.map((doc, index) => (
                <Draggable key={doc.id} draggableId={doc.id} index={index}>
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={`group/doc flex items-center gap-1 rounded-lg transition-colors ${
                        dragSnapshot.isDragging ? 'bg-white shadow-md' : ''
                      }`}
                    >
                      <span
                        {...dragProvided.dragHandleProps}
                        className="shrink-0 p-1 text-slate-300 opacity-0 group-hover/doc:opacity-100 focus:opacity-100 hover:text-slate-500 cursor-grab active:cursor-grabbing"
                        aria-label="Arrastar para reordenar"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                      <button
                        onClick={() => navegarComGuarda(() => onSelect(doc.id))}
                        aria-current={activeDoc === doc.id ? 'page' : undefined}
                        className={`flex flex-1 items-center gap-2 text-left rounded-lg px-2 py-1.5 text-sm transition-colors ${
                          activeDoc === doc.id
                            ? 'bg-blue-50 font-medium text-blue-700'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${(pendentes[doc.id] ?? 0) > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        <span className="flex-1 truncate">{doc.label}</span>
                        {(pendentes[doc.id] ?? 0) > 0 && (
                          <span className="text-xs tabular-nums text-slate-500" aria-label={`${pendentes[doc.id]} proposta(s) pendente(s)`}>{pendentes[doc.id]}</span>
                        )}
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </nav>
  )
}
