'use client'

import { printPageStyle } from '@/lib/printPageStyle'
import { EAP_PRINT_MARGIN_TOP_MM } from './EapDocumentSheet'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useReactToPrint } from 'react-to-print'
import {
  ArrowLeft, Undo2, Redo2, Plus, ZoomIn, ZoomOut, Save, Eye, Download,
  RotateCcw, Trash2, Copy, ChevronUp, ChevronDown, CornerDownRight, FileUp,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CamposQuadroDocumento from './CamposQuadroDocumento'
import { type MembroEquipeOption, useMembrosEquipe } from './MembroEquipeSelect'
import { useToast } from '@/components/ui/Toast'
import { fetchWithSession } from '@/lib/clientFetch'
import type { EapDocument, EapNode, EapDocumentMetadata } from '@/types/eap'
import { findNode, flattenTree, collectSubtreeIds } from '@/lib/eapCode'
import {
  insertChild, insertSibling, removeNode, duplicateNode, moveNode,
  moveNodeRelative, updateTitle, listCandidateParents,
} from '@/lib/eapTree'
import EapDocumentSheet from './EapDocumentSheet'
import type { ArvoreDaAba } from './EapGraficaDaAba'

// ── UI constants (padrão do app) ─────────────────────────────────────────────

const labelClass = 'block text-sm font-semibold text-slate-700 mb-1'
const inputClass =
  'w-full border-2 border-slate-400 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white placeholder-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
const toolButton =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

// ── Estado do editor (metadados + árvore = uma única fonte de verdade) ──────

interface EditorSnapshot {
  metadata: EapDocumentMetadata
  nodes: EapNode[]
}

const EMPTY_METADATA: EapDocumentMetadata = {
  projectName: '',
  projectManager: '',
  preparedBy: '',
  version: '1.0',
  approvedBy: '',
  signature: '',
  approvalDate: null,
}

function defaultChildTitle(parentLevel: number): string {
  return parentLevel <= 1 ? '[ENTREGA / FASE]' : '[PACOTE DE TRABALHO]'
}

function defaultSiblingTitle(level: number): string {
  return level <= 1 ? '[ENTREGA / FASE]' : '[PACOTE DE TRABALHO]'
}

export default function EapDocument({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  const permissions = useProjectPermissions()
  const canEdit = permissions.has('documentos:editar')
  const { projetoId } = useParams<{ projetoId: string }>()
  const router = useRouter()
  const { toast } = useToast()

  const printRef = useRef<HTMLDivElement>(null)

  // ── Documento ─────────────────────────────────────────────────────────────
  const [doc, setDoc] = useState<EapDocument | null>(null)
  const [instituicao, setInstituicao] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  /** Estrutura vinda da aba EAP/WBS: no documento, só leitura. */
  const [origemWbs, setOrigemWbs] = useState(false)
  const [arvore, setArvore] = useState<ArvoreDaAba | null>(null)
  /** Assinatura do gerente (só com versão aprovada). */
  const [assinaturaUrl, setAssinaturaUrl] = useState<string | null>(null)
  const { todos: todosMembros, registrarCriado } = useMembrosEquipe(membros)
  // Documentos antigos só guardavam o nome: recupera o membro pelo nome para o select.
  const membrosRef = useRef(membros)
  useEffect(() => { membrosRef.current = membros }, [membros])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [metadata, setMetadata] = useState<EapDocumentMetadata>(EMPTY_METADATA)
  const [nodes, setNodes] = useState<EapNode[]>([])

  // Histórico (desfazer/refazer) — snapshots da árvore + metadados
  const [past, setPast] = useState<EditorSnapshot[]>([])
  const [future, setFuture] = useState<EditorSnapshot[]>([])

  // Interação
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [zoom, setZoom] = useState(100)
  const [viewing, setViewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [moveParentId, setMoveParentId] = useState<string>('')

  // ── Carga inicial ─────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!projetoId) return
    setLoading(true)
    setError(null)
    const membroPorNome = (nome?: string | null) => (nome ? membrosRef.current.find(m => m.name === nome)?.id ?? null : null)
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/eap`)
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: 'Erro ao carregar EAP' }))
        throw new Error(e.error ?? 'Erro ao carregar EAP')
      }
      const data = await r.json()
      setDoc(data.document)
      setInstituicao(data.instituicao ?? '')
      setLogoUrl(data.logoUrl ?? null)
      setOrigemWbs(Boolean(data.origemWbs))
      setArvore(data.arvore ?? null)
      setAssinaturaUrl(data.assinaturaUrl ?? null)
      setMetadata({
        projectName: data.document.projectName ?? '',
        projectManager: data.document.projectManager ?? '',
        preparedBy: data.document.preparedBy ?? '',
        preparedByUserId: data.document.preparedByUserId ?? membroPorNome(data.document.preparedBy),
        approvedByUserId: data.document.approvedByUserId ?? membroPorNome(data.document.approvedBy),
        version: data.document.version || '1.0',
        approvedBy: data.document.approvedBy ?? '',
        signature: data.document.signature ?? '',
        approvalDate: data.document.approvalDate ?? null,
      })
      setNodes(data.document.nodes ?? [])
      setPast([])
      setFuture([])
      setSelectedId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar EAP')
    } finally {
      setLoading(false)
    }
  }, [projetoId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // ── Histórico ─────────────────────────────────────────────────────────────

  function commit(nodes: EapNode[]) {
    if (!canEdit) return
    setPast(prev => [...prev.slice(-99), { metadata, nodes }])
    setFuture([])
    setNodes(nodes)
  }

  function undo() {
    if (!canEdit) return
    setPast(prev => {
      if (prev.length === 0) return prev
      const snapshot = prev[prev.length - 1]
      setFuture(fut => [...fut, { metadata, nodes }])
      setMetadata(snapshot.metadata)
      setNodes(snapshot.nodes)
      setEditingNodeId(null)
      return prev.slice(0, -1)
    })
  }

  function redo() {
    if (!canEdit) return
    setFuture(prev => {
      if (prev.length === 0) return prev
      const snapshot = prev[prev.length - 1]
      setPast(p => [...p, { metadata, nodes }])
      setMetadata(snapshot.metadata)
      setNodes(snapshot.nodes)
      setEditingNodeId(null)
      return prev.slice(0, -1)
    })
  }

  // ── Operações estruturais (SPEC §9–§10) ───────────────────────────────────

  const handleAddLevel = () => {
    // "Adicionar nível": cria um filho direto da raiz
    if (nodes.length === 0) {
      commit([{ id: crypto.randomUUID(), parentId: null, code: '1', title: '[NOME DO PROJETO]', level: 1, order: 0, children: [] }])
      return
    }
    const root = nodes[0]
    commit(insertChild(nodes, root.id, defaultChildTitle(root.level)))
  }

  const handleAddItem = () => {
    if (nodes.length === 0) {
      commit([{ id: crypto.randomUUID(), parentId: null, code: '1', title: '[NOME DO PROJETO]', level: 1, order: 0, children: [] }])
      return
    }
    if (selectedId) {
      const node = findNode(nodes, selectedId)
      if (!node) return
      commit(insertSibling(nodes, selectedId, defaultSiblingTitle(node.level)))
      return
    }
    const root = nodes[0]
    commit(insertChild(nodes, root.id, defaultChildTitle(root.level)))
  }

  const handleDelete = (id: string) => {
    commit(removeNode(nodes, id))
    setSelectedId(null)
  }

  const handleDuplicate = (id: string) => {
    commit(duplicateNode(nodes, id))
  }

  const handleMoveUp = (id: string) => commit(moveNodeRelative(nodes, id, -1))
  const handleMoveDown = (id: string) => commit(moveNodeRelative(nodes, id, 1))

  const handleMoveToParent = (id: string, parentId: string) => {
    if (collectSubtreeIds(nodes, id).has(parentId)) {
      toast('Não é possível mover um item para dentro dele mesmo.', 'error')
      return
    }
    commit(moveNode(nodes, id, parentId === 'ROOT' ? null : parentId))
  }

  const handleSaveTitle = (id: string, title: string) => {
    commit(updateTitle(nodes, id, title.trim() || '[SEM TÍTULO]'))
  }

  // ── Abrir/atualizar o painel de edição do bloco ───────────────────────────

  function openBlock(id: string) {
    if (!canEdit || origemWbs) return
    setSelectedId(id)
    const node = findNode(nodes, id)
    setEditingTitle(node?.title ?? '')
    setMoveParentId('')
    setEditingNodeId(id)
  }

  // ── Impressão / PDF (layout fixo A4) ──────────────────────────────────────

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: doc ? `EAP - ${doc.projectName || 'Projeto'}` : 'EAP - Estrutura Analítica do Projeto',
    pageStyle: printPageStyle({ landscape: true, marginMm: { top: EAP_PRINT_MARGIN_TOP_MM, x: 0 } }),
  })

  // ── Salvar (PUT) ──────────────────────────────────────────────────────────

  async function handleSave() {
    if (!canEdit) return
    if (!projetoId || !doc) return
    setSaving(true)
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/eap`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...metadata, nodes }),
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({ error: 'Erro ao salvar' }))
        throw new Error(e.error ?? 'Erro ao salvar')
      }
      const data = await r.json()
      setDoc(data.document)
      window.dispatchEvent(new CustomEvent('operum:document-version', { detail: { projetoId } }))
      toast(data.status === 'PENDING' ? 'Versão da EAP enviada para aprovação. O documento vigente foi preservado.' : 'EAP aprovada e publicada.')
      if (data.status === 'APPROVED') window.dispatchEvent(new CustomEvent('operum:document-published', { detail: { projetoId, type: 'EAP' } }))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro de rede ao salvar', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (!canEdit || !permissions.has('documentos:excluir') || !permissions.has('documentos:aprovar')) return
    if (!projetoId) return
    setSaving(true)
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/eap`, { method: 'POST' })
      if (!r.ok) throw new Error('Erro ao recriar a partir do modelo')
      const data = await r.json()
      setDoc(data.document)
      setMetadata({
        projectName: data.document.projectName ?? '',
        projectManager: '', preparedBy: '', version: '1.0',
        approvedBy: '', signature: '', approvalDate: null,
      })
      setNodes(data.document.nodes ?? [])
      setPast([])
      setFuture([])
      setSelectedId(null)
      setEditingNodeId(null)
      toast('Documento recriado a partir do modelo.')
    } catch {
      toast('Erro ao recriar a partir do modelo', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Métricas para a UI ────────────────────────────────────────────────────

  const selectedNode = selectedId ? findNode(nodes, selectedId) : null
  const flat = useMemo(() => flattenTree(nodes), [nodes])
  const totalNodes = flat.length

  const snapshot = useMemo(() => ({ metadata, nodes }), [metadata, nodes])

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="bg-white animate-pulse rounded shadow-2xl" style={{ width: '297mm', height: '210mm' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start justify-center p-8">
        <div className="w-[297mm] rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">{error}</div>
      </div>
    )
  }

  function updateMetadata(field: keyof EapDocumentMetadata, value: string | null) {
    if (!canEdit) return
    setMetadata(prev => ({ ...prev, [field]: value }))
  }

  function updateMembro(nome: 'preparedBy' | 'approvedBy', idField: 'preparedByUserId' | 'approvedByUserId', membro: MembroEquipeOption | null) {
    if (!canEdit) return
    setMetadata(prev => ({ ...prev, [nome]: membro?.name ?? '', [idField]: membro?.id ?? null }))
  }

  return (
    <div className="min-h-screen bg-gray-300 flex flex-col items-center py-8 gap-5">
      {/* ── Toolbar (SPEC §19) ───────────────────────────────────────────── */}
      <div className="w-[297mm] flex items-center gap-1.5 flex-wrap print:hidden">
        <button
          aria-label="Voltar"
          title="Voltar"
          onClick={() => router.back()}
          className={`${toolButton} text-slate-600 hover:bg-white hover:shadow transition-all`}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="w-px h-6 bg-slate-400/50 mx-1" />
        <button
          aria-label="Desfazer"
          title="Desfazer (Ctrl+Z)"
          disabled={!canEdit || past.length === 0}
          onClick={undo}
          className={`${toolButton} text-slate-600 hover:bg-white hover:shadow transition-all`}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          aria-label="Refazer"
          title="Refazer (Ctrl+Shift+Z)"
          disabled={!canEdit || future.length === 0}
          onClick={redo}
          className={`${toolButton} text-slate-600 hover:bg-white hover:shadow transition-all`}
        >
          <Redo2 className="w-4 h-4" />
        </button>
        <span className="w-px h-6 bg-slate-400/50 mx-1" />
        {!origemWbs && <>
        <button
          onClick={handleAddLevel}
          className={`${toolButton} bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 transition-colors`}
        >
          <Plus className="w-4 h-4" /> Adicionar nível
        </button>
        <button
          onClick={handleAddItem}
          className={`${toolButton} bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 transition-colors`}
        >
          <CornerDownRight className="w-4 h-4" /> Adicionar item
        </button>
        </>}
        <span className="w-px h-6 bg-slate-400/50 mx-1" />
        <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-300 px-1 py-0.5">
          <button
            aria-label="Diminuir zoom"
            disabled={zoom <= 50}
            onClick={() => setZoom(z => Math.max(50, z - 10))}
            className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(100)}
            title="Redefinir zoom"
            className="px-1 text-xs font-semibold text-slate-700 w-10 hover:bg-slate-100 rounded"
          >
            {zoom}%
          </button>
          <button
            aria-label="Aumentar zoom"
            disabled={zoom >= 200}
            onClick={() => setZoom(z => Math.min(200, z + 10))}
            className="p-1 rounded text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
        <span className="w-px h-6 bg-slate-400/50 mx-1" />
        <button
          onClick={() => setViewing(v => !v)}
          className={`${toolButton} ${viewing
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'} transition-colors`}
        >
          <Eye className="w-4 h-4" /> {viewing ? 'Editar' : 'Visualizar'}
        </button>
        <button
          disabled={!canEdit || (saving)} onClick={handleSave}
          className={`${toolButton} bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm`}
        >
          <Save className="w-4 h-4" /> {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {!origemWbs && <button
          onClick={() => setConfirmReset(true)}
          disabled={saving || !canEdit || !permissions.has('documentos:excluir')}
          className={`${toolButton} text-amber-700 bg-white border border-amber-200 hover:bg-amber-50 transition-colors`}
          title="Recriar o documento a partir do modelo EAP (matriz original)"
        >
          <RotateCcw className="w-4 h-4" /> Modelo
        </button>}
        <button
          onClick={() => handlePrint()}
          disabled={!doc}
          className={`${toolButton} bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm`}
        >
          <Download className="w-4 h-4" /> Exportar PDF
        </button>
      </div>

      <div className="w-[297mm] rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 print:hidden">
        {origemWbs
          ? <>A estrutura deste documento vem da aba <strong>EAP/WBS</strong>. Para incluir, renomear ou mover itens, <Link href={`/projetos/${projetoId}/wbs`} className="font-semibold underline">edite a EAP/WBS</Link>.</>
          : <>A aba <strong>EAP/WBS</strong> ainda não foi montada; o documento usa a estrutura do modelo. <Link href={`/projetos/${projetoId}/wbs`} className="font-semibold underline">Montar a EAP/WBS</Link>.</>}
      </div>

      {/* ── Metadados do documento (SPEC §17) ────────────────────────────── */}
      {!viewing && (
        <div className="w-[297mm] bg-white rounded-xl shadow-md p-6 grid grid-cols-2 gap-4 print:hidden">
          <div>
            <label className={labelClass} htmlFor="eap-nome-projeto">Nome do projeto</label>
            <input
              id="eap-nome-projeto"
              className={inputClass}
              value={metadata.projectName}
              onChange={e => updateMetadata('projectName', e.target.value)}
              placeholder="Nome do projeto"
            />
          </div>
          <CamposQuadroDocumento
            idPrefix="eap"
            projetoId={projetoId}
            membros={todosMembros}
            onCriarMembro={registrarCriado}
            gerenteProjeto={metadata.projectManager}
            elaboradoPorUserId={metadata.preparedByUserId}
            onElaboradoPor={m => updateMembro('preparedBy', 'preparedByUserId', m)}
            aprovadoPorUserId={metadata.approvedByUserId}
            onAprovadoPor={m => updateMembro('approvedBy', 'approvedByUserId', m)}
            versao={metadata.version}
            onVersao={v => updateMetadata('version', v)}
            dataAprovacao={metadata.approvalDate ?? ''}
            onDataAprovacao={v => updateMetadata('approvalDate', v || null)}
            disabled={!canEdit}
            labelClass={labelClass}
            inputClass={inputClass}
          />
          <div className="flex items-end">
            <p className="text-xs text-slate-500 leading-relaxed">
              <strong>{totalNodes}</strong> {totalNodes === 1 ? 'bloco' : 'blocos'} na EAP ·{' '}
              {origemWbs ? 'estrutura da aba EAP/WBS' : selectedNode ? `selecionado: ${selectedNode.code}` : 'clique em um bloco para editar'}
            </p>
          </div>
        </div>
      )}

      {/* ── Prancheta do documento (A4, layout fixo) ─────────────────────── */}
      <div className="shadow-2xl rounded-sm overflow-hidden bg-white">
        <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
          <EapDocumentSheet
            ref={printRef}
            metadata={snapshot.metadata}
            nodes={snapshot.nodes}
            instituicao={instituicao}
            logoUrl={logoUrl}
            assinaturaUrl={assinaturaUrl}
            // Documento atual: EAP gráfica igual à aba. Versões antigas usam a estrutura salva nelas.
            arvore={!viewing && origemWbs ? arvore : null}
            interactive={!viewing && !origemWbs}
            selectedId={selectedId}
            onSelectBlock={id => !viewing && openBlock(id)}
          />
        </div>
      </div>

      {/* ── Painel de edição do bloco (SPEC §20) ─────────────────────────── */}
      <Modal
        isOpen={Boolean(editingNodeId)}
        onClose={() => setEditingNodeId(null)}
        title={editingNodeId ? `Editar item — ${findNode(nodes, editingNodeId)?.code ?? ''}` : 'Editar item'}
        maxWidth="max-w-md"
      >
        {editingNodeId && (() => {
          const node = findNode(nodes, editingNodeId)
          if (!node) return null
          const candidates = listCandidateParents(nodes, editingNodeId)
          return (
            <div className="flex flex-col gap-4 py-2">
              <div>
                <label className={labelClass} htmlFor="eap-node-title">Título {node.code}</label>
                <input
                  id="eap-node-title"
                  className={inputClass}
                  value={editingTitle}
                  onChange={e => setEditingTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { handleSaveTitle(editingNodeId, editingTitle); setEditingNodeId(null) }
                  }}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    handleSaveTitle(editingNodeId, editingTitle)
                    const next = insertChild(nodes, editingNodeId, defaultChildTitle(node.level))
                    commit(next)
                    setEditingNodeId(null)
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Adicionar filho
                </button>
                <button
                  onClick={() => {
                    handleSaveTitle(editingNodeId, editingTitle)
                    commit(insertSibling(nodes, editingNodeId, defaultSiblingTitle(node.level)))
                    setEditingNodeId(null)
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <CornerDownRight className="w-4 h-4" /> Irmão
                </button>
                <button
                  onClick={() => { handleSaveTitle(editingNodeId, editingTitle); handleDuplicate(editingNodeId); setEditingNodeId(null) }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <Copy className="w-4 h-4" /> Duplicar
                </button>
                <button
                  onClick={() => { handleSaveTitle(editingNodeId, editingTitle); setConfirmDeleteId(editingNodeId); setEditingNodeId(null) }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Excluir
                </button>
                <button
                  onClick={() => { handleSaveTitle(editingNodeId, editingTitle); handleMoveUp(editingNodeId) }}
                  disabled={node.order === 0}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-40"
                >
                  <ChevronUp className="w-4 h-4" /> Subir
                </button>
                <button
                  onClick={() => { handleSaveTitle(editingNodeId, editingTitle); handleMoveDown(editingNodeId) }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <ChevronDown className="w-4 h-4" /> Descer
                </button>
              </div>
              <div>
                <label className={labelClass} htmlFor="eap-move-parent">Mover para (pai)</label>
                <select
                  id="eap-move-parent"
                  className={inputClass}
                  value={moveParentId}
                  onChange={e => setMoveParentId(e.target.value)}
                >
                  <option value="">— Escolha um destino —</option>
                  <option value="ROOT">Raiz (nível 1)</option>
                  {candidates.map(c => (
                    <option key={c.id} value={c.id}>{c.code} — {c.title || '(sem título)'}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!moveParentId) return
                    handleSaveTitle(editingNodeId, editingTitle)
                    handleMoveToParent(editingNodeId, moveParentId)
                    setEditingNodeId(null)
                  }}
                  disabled={!moveParentId}
                  className="mt-2 flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40"
                >
                  <FileUp className="w-4 h-4" /> Mover item
                </button>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => { handleSaveTitle(editingNodeId, editingTitle); setEditingNodeId(null) }}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>

      {/* ── Confirmações ─────────────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={Boolean(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        title="Excluir item"
        message={confirmDeleteId
          ? `Excluir "${findNode(nodes, confirmDeleteId)?.title ?? ''}" e toda a sub-árvore? Os códigos dos demais itens serão renumerados automaticamente.`
          : ''}
        confirmLabel="Excluir"
      />

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={handleReset}
        title="Criar a partir do modelo EAP"
        message="O documento atual será substituído pela estrutura padrão do modelo (com campos em branco). Esta ação não altera o template — apenas esta cópia."
        confirmLabel="Recriar"
      />
    </div>
  )
}