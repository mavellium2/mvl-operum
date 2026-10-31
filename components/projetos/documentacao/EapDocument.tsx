'use client'

import Select from '@/components/ui/Select'
import { printFolhasStyle, rodapeDocumento } from '@/lib/printPageStyle'
import EditorDocumento from '@/components/documentos/editor/EditorDocumento'
import { CopiaParaImpressao } from '@/components/documentos/editor/folha'
import Tooltip from '@/components/ui/Tooltip'
import { abrirPropostas, ROTULO_STATUS, useVersoesDocumento } from '@/hooks/useVersoesDocumento'
import { useRascunhoDocumento } from '@/hooks/useRascunhoDocumento'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useReactToPrint } from 'react-to-print'
import {
  Plus, RotateCcw, Trash2, Copy, ChevronUp, ChevronDown, CornerDownRight, FileUp, Network,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { type MembroEquipeOption, useMembrosEquipe } from './MembroEquipeSelect'
import { useToast } from '@/components/ui/Toast'
import { fetchWithSession } from '@/lib/clientFetch'
import type { EapDocument, EapNode, EapDocumentMetadata } from '@/types/eap'
import { findNode, collectSubtreeIds } from '@/lib/eapCode'
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
  const canEditRef = useRef(canEdit)
  useEffect(() => { canEditRef.current = canEdit })
  const { projetoId } = useParams<{ projetoId: string }>()
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
  const [versaoSelecionada, setVersaoSelecionada] = useState<string | null>(null)
  const { versoes, vigente, pendentes } = useVersoesDocumento(projetoId, 'EAP')
  /** Alterações ainda não enviadas com "Salvar versão" (indicador da barra). */
  const [alterado, setAlterado] = useState(false)
  const rascunho = useRascunhoDocumento(projetoId, 'EAP')
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false)
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
      setAlterado(false)
      // "Salvar mais tarde": volta de onde parou (rascunho privado, ainda sem versão).
      if (canEditRef.current) {
        const salvo = await rascunho.recuperar<EapDocumentMetadata & { nodes?: EapNode[] }>()
        if (salvo && Array.isArray(salvo.nodes)) {
          const { nodes: nosSalvos, ...meta } = salvo
          setMetadata(prev => ({ ...prev, ...meta }))
          setNodes(nosSalvos)
          setRascunhoRestaurado(true)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar EAP')
    } finally {
      setLoading(false)
    }
  }, [projetoId, rascunho])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // ── Histórico ─────────────────────────────────────────────────────────────

  function commit(nodes: EapNode[]) {
    if (!canEdit) return
    setPast(prev => [...prev.slice(-99), { metadata, nodes }])
    setFuture([])
    setNodes(nodes)
    setAlterado(true)
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
      setAlterado(true)
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
      setAlterado(true)
      return prev.slice(0, -1)
    })
  }

  // ── Operações estruturais (SPEC §9–§10) ───────────────────────────────────

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
    pageStyle: printFolhasStyle({ landscape: true }),
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
      setAlterado(false)
      setRascunhoRestaurado(false)
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
      setAlterado(false)
      toast('Documento recriado a partir do modelo.')
    } catch {
      toast('Erro ao recriar a partir do modelo', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── Métricas para a UI ────────────────────────────────────────────────────


  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#eef0f3] p-16">
        <div className="bg-white animate-pulse shadow" style={{ width: '297mm', height: '210mm' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-start justify-center bg-[#eef0f3] p-8">
        <div className="w-[297mm] rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">{error}</div>
      </div>
    )
  }

  function updateMetadata(field: keyof EapDocumentMetadata, value: string | null) {
    if (!canEdit) return
    setPast(prev => [...prev.slice(-99), { metadata, nodes }])
    setFuture([])
    setMetadata(prev => ({ ...prev, [field]: value }))
    setAlterado(true)
  }

  function updateMembro(nome: 'preparedBy' | 'approvedBy', idField: 'preparedByUserId' | 'approvedByUserId', membro: MembroEquipeOption | null) {
    if (!canEdit) return
    setPast(prev => [...prev.slice(-99), { metadata, nodes }])
    setFuture([])
    setMetadata(prev => ({ ...prev, [nome]: membro?.name ?? '', [idField]: membro?.id ?? null }))
    setAlterado(true)
  }

  // Versão aberta pelo seletor: só leitura, com a estrutura salva nela.
  const versaoAberta = versaoSelecionada ? versoes.find(v => v.id === versaoSelecionada) ?? null : null
  const conteudoVersao = versaoAberta?.payload as (Partial<EapDocumentMetadata> & { nodes?: EapNode[] }) | null | undefined
  const metaExibida: EapDocumentMetadata = conteudoVersao ? { ...metadata, ...conteudoVersao } : metadata
  const nosExibidos = conteudoVersao?.nodes ?? nodes
  const editavel = canEdit && !versaoAberta && !saving
  const rodape = rodapeDocumento('Estrutura Analítica do Projeto', metaExibida.version || '1.0')

  return (
    <>
      <EditorDocumento
        editarProjetoHref={permissions.has('projeto:editar') ? `/projetos/${projetoId}/configuracoes` : undefined}
        documento="EAP"
        paisagem
        editavel={editavel}
        status={!canEdit || versaoAberta ? 'leitura' : saving ? 'salvando' : alterado ? 'pendente' : 'salvo'}
        mensagemStatus={!canEdit || versaoAberta ? undefined : saving ? 'Salvando…' : alterado ? 'Alterações ainda não salvas — use “Salvar versão”' : 'Tudo salvo'}
        versao={{
          rotulo: versaoAberta ? `${versaoAberta.versao ?? '—'} · ${ROTULO_STATUS[versaoAberta.status] ?? ''}` : `${metadata.version || '1.0'} · ${vigente ? 'vigente' : 'rascunho'}`,
          rotuloAtual: 'Documento atual (editável)',
          selecionada: versaoSelecionada,
          opcoes: versoes.filter(v => v.payload).map(v => ({ id: v.id, rotulo: `${v.versao ?? '—'} · ${v.id === vigente?.id ? 'vigente' : ROTULO_STATUS[v.status] ?? ''}`, detalhe: v.commitTitle })),
          onSelecionar: setVersaoSelecionada,
        }}
        onSalvar={() => void handleSave()}
        podeSalvar={editavel}
        onHistorico={() => abrirPropostas(projetoId)}
        pendentes={{ total: pendentes, onRevisar: () => abrirPropostas(projetoId) }}
        onImprimir={() => handlePrint()}
        onPdf={() => handlePrint()}
        onWord={() => toast('A EAP ainda não tem exportação em Word. Use o PDF.', 'warning')}
        desfazer={{ desfazer: undo, refazer: redo, podeDesfazer: past.length > 0, podeRefazer: future.length > 0 }}
        onAdicionarLinha={!origemWbs ? handleAddItem : undefined}
        paginas={{ total: 2, seletor: '[data-testid^="eap-pagina-"]' }}
        saida={{
          pendente: canEdit && alterado && !versaoAberta,
          salvar: () => void handleSave(),
          salvarDepois: () => rascunho.guardar({ ...metadata, nodes }),
          descartar: () => rascunho.descartar(),
        }}
        extrasEdicao={<>
          <Tooltip label="Editar a estrutura na EAP/WBS">
            <Link href={`/projetos/${projetoId}/wbs`} aria-label="Editar a estrutura na EAP/WBS" className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100">
              <Network className="h-4 w-4" />
            </Link>
          </Tooltip>
          {!origemWbs && permissions.has('documentos:excluir') && (
            <Tooltip label="Recriar a partir do modelo EAP">
              <button type="button" aria-label="Recriar a partir do modelo EAP" disabled={!editavel} onClick={() => setConfirmReset(true)} className="flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-100 disabled:opacity-35">
                <RotateCcw className="h-4 w-4" />
              </button>
            </Tooltip>
          )}
        </>}
        avisos={<>
          {!origemWbs && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
              A aba <strong>EAP/WBS</strong> ainda não foi montada; o documento usa a estrutura do modelo (clique num bloco para editá-lo). <Link href={`/projetos/${projetoId}/wbs`} className="font-semibold underline">Montar a EAP/WBS</Link>.
            </div>
          )}
          {rascunhoRestaurado && !versaoAberta && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Seu rascunho foi restaurado. Salve uma versão para enviá-lo à aprovação.</p>}
          {versaoAberta && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              Versão {versaoAberta.versao ?? '—'} · {ROTULO_STATUS[versaoAberta.status] ?? versaoAberta.status} — somente leitura.
              <button type="button" className="ml-auto font-medium text-blue-700 underline" onClick={() => setVersaoSelecionada(null)}>Voltar ao documento atual</button>
            </div>
          )}
        </>}
      >
        <div className="[&_[data-folha]]:shadow-[0_1px_3px_rgba(15,23,42,0.12)]">
          <EapDocumentSheet
            metadata={metaExibida}
            nodes={nosExibidos}
            instituicao={instituicao}
            logoUrl={logoUrl}
            assinaturaUrl={assinaturaUrl}
            // Documento atual: EAP gráfica igual à aba. Versões antigas usam a estrutura salva nelas.
            arvore={!versaoAberta && origemWbs ? arvore : null}
            interactive={editavel && !origemWbs}
            selectedId={selectedId}
            onSelectBlock={id => editavel && openBlock(id)}
            rodape={rodape}
            edicao={{
              projetoId,
              membros: todosMembros,
              onCriarMembro: registrarCriado,
              onElaboradoPor: m => updateMembro('preparedBy', 'preparedByUserId', m),
              onVersao: v => updateMetadata('version', v),
              onDataAprovacao: v => updateMetadata('approvalDate', v || null),
              linkWbs: `/projetos/${projetoId}/wbs`,
            }}
          />
        </div>
      </EditorDocumento>

      {/* Cópia só de leitura usada pela impressão/PDF (mesma folha, sem os controles). */}
      <CopiaParaImpressao>
        <EapDocumentSheet
          ref={printRef}
          metadata={metaExibida}
          nodes={nosExibidos}
          instituicao={instituicao}
          logoUrl={logoUrl}
          assinaturaUrl={assinaturaUrl}
          arvore={!versaoAberta && origemWbs ? arvore : null}
          rodape={rodape}
        />
      </CopiaParaImpressao>

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
                <Select
                  id="eap-move-parent"
                  value={moveParentId}
                  onChange={setMoveParentId}
                  placeholder="— Escolha um destino —"
                  options={[{ value: 'ROOT', label: 'Raiz (nível 1)' }, ...candidates.map(c => ({ value: c.id, label: `${c.code} — ${c.title || '(sem título)'}` }))]}
                />
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
    </>
  )
}
