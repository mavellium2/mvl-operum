'use client'

import { printFolhasStyle } from '@/lib/printPageStyle'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useDesfazer } from '@/hooks/useDesfazer'
import { useRascunhoDocumento } from '@/hooks/useRascunhoDocumento'
import EditorDocumento, { type StatusSalvamento } from '@/components/documentos/editor/EditorDocumento'
import { CopiaParaImpressao } from '@/components/documentos/editor/folha'
import { useRecoverableDraft } from '@/hooks/useRecoverableDraft'
import { useAutosave } from '@/hooks/useAutosave'
import { useParams } from 'next/navigation'
import { useReactToPrint } from 'react-to-print'
import { Save } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Drawer from '@/components/ui/Drawer'
import { useToast } from '@/components/ui/Toast'
import { fetchWithSession } from '@/lib/clientFetch'
import { formatDateBR, toDateInputValue } from '@/lib/date'
import type { MacroFase } from './MacroFaseTable'
import ProjectCharterDocument, { TITULO_TERMO, type CharterDocumentProps, type EdicaoTermo } from './ProjectCharterDocument'
import type { CharterChange } from '@/lib/charterChanges'
import {
  type MembroEquipeOption,
  useMembrosEquipe,
} from './MembroEquipeSelect'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CharterProject {
  id: string
  name: string
  categoria?: string | null
  logoUrl: string | null
  startDate: string | null
  justificativa: string | null
  objetivos: string | null
  metodologia: string | null
  descricaoProduto: string | null
  premissas: string | null
  restricoes: string | null
  limitesAutoridade: string | null
}

interface Gerente {
  name: string
  signatureUrl: string | null
}

interface CharterData {
  project: CharterProject
  macroFases: MacroFase[]
  gerente: Gerente | null
  gerenteProjeto: string
  membros: { name: string; papel?: string }[]
  /** Linha institucional do cadastro do projeto (automática no quadro). */
  instituicao?: string
}

interface DocumentVersion {
  id: string
  commitTitle: string
  versao: string
  elaboradoPor: string
  aprovadoPor: string
  dataAprovacao: string
  authorId: string | null
  author: { name: string } | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  approvedAt: string | null
  approvedById: string | null
  createdAt: string
  payload?: Partial<CharterDocumentProps> & { macroFases?: MacroFase[]; documentContext?: Pick<CharterDocumentProps, 'nomeProjeto' | 'logoUrl' | 'gerenteProjeto' | 'gerenteSignatureUrl' | 'membros'> }
  changes?: CharterChange[] | null
  previousVersionId?: string | null
}

interface VersionMeta {
  elaboradoPor: string
  elaboradoPorUserId: string | null
  aprovadoPor: string
  aprovadoPorUserId: string | null
  versao: string
  dataAprovacaoRaw: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<DocumentVersion['status'], string> = {
  PENDING:  'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
}
const STATUS_LABEL: Record<DocumentVersion['status'], string> = {
  PENDING:  'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Shared style constants ─────────────────────────────────────────────────────

const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1'
const inputClass =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white ' +
  ' focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProjectCharter({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  const permissions = useProjectPermissions()
  const canPublish = permissions.has('documentos:aprovar')
  const canEdit = permissions.has('documentos:editar')
  const { projetoId } = useParams<{ projetoId: string }>()
  const printRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Charter data
  const [data, setData] = useState<CharterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [draftAttempt, setDraftAttempt] = useState(0)

  // Editable text fields (mirrors DB, auto-saved)
  const [fields, setFields] = useState({
    categoria: '',
    justificativa: '',
    objetivos: '',
    metodologia: '',
    descricaoProduto: '',
    premissas: '',
    restricoes: '',
    limitesAutoridade: '',
    principaisEnvolvidos: '',
  })
  const savedFields = useRef(fields)

  // MacroFases (local state, synced with server)
  const [fases, setFases] = useState<MacroFase[]>([])
  const savedFases = useRef<MacroFase[]>([])

  // Versioning
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [isManager, setIsManager] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const debouncedSearch = useDebounce(historySearch, 300)
  const [commitModalOpen, setCommitModalOpen] = useState(false)
  const [commitTitle, setCommitTitle] = useState('')
  const [commitError, setCommitError] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)
  const savingVersionRef = useRef(false)
  const [actingVersionId, setActingVersionId] = useState<string | null>(null)
  const [versionMeta, setVersionMeta] = useState<VersionMeta>({
    elaboradoPor: '', elaboradoPorUserId: null, aprovadoPor: '', aprovadoPorUserId: null, versao: '1.0', dataAprovacaoRaw: '',
  })
  const initializedMeta = useRef(false)
  const [metaCarregada, setMetaCarregada] = useState(false)

  // Membros da equipe (responsável/aprovador devem ser membros) + criados na sessão (pendência)
  const { todos: todosMembros, registrarCriado } = useMembrosEquipe(membros)
  const todosMembrosRef = useRef(todosMembros)
  useEffect(() => { todosMembrosRef.current = todosMembros }, [todosMembros])

  const draftPayload = JSON.stringify({ ...fields, macroFases: fases })
  const draftAutosave = useAutosave(draftPayload, async payload => {
    const response = await fetchWithSession(`/api/projects/${projetoId}/charter`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: payload,
    })
    if (!response.ok) throw new Error('Não foi possível salvar o rascunho')
  }, { delay: 1200, enabled: canEdit && draftReady })
  const resetDraft = draftAutosave.reset
  const recovery = useRecoverableDraft(projetoId, draftPayload, draftAutosave.status, canEdit && draftReady)
  function restoreLocalDraft() {
    try {
      const payload = JSON.parse(recovery.backup!)
      const next = { ...fields }
      for (const key of Object.keys(next) as (keyof typeof next)[]) {
        if (payload[key] === undefined) continue
        if (typeof payload[key] !== 'string') throw new Error('invalid')
        next[key] = payload[key]
      }
      if (!Array.isArray(payload.macroFases) || !payload.macroFases.every((fase: MacroFase) =>
        typeof fase.id === 'string' && typeof fase.fase === 'string' && typeof fase.dataLimite === 'string' && typeof fase.custo === 'string')) throw new Error('invalid')
      setFields(next); setFases(payload.macroFases)
      recovery.discard()
      toast('Cópia local restaurada. Aguarde a confirmação do salvamento.')
    } catch { toast('A cópia local não pôde ser restaurada.', 'error') }
  }

  // ── Load charter data ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!projetoId) return
    fetchWithSession(`/api/projects/${projetoId}/charter`)
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error)))
      .then((d: CharterData) => {
        setData(d)
        setFases(d.macroFases)
        savedFases.current = d.macroFases
        const p = d.project
        const init = {
          categoria: p.categoria ?? '',
          justificativa: p.justificativa ?? '',
          objetivos: p.objetivos ?? '',
          metodologia: p.metodologia ?? '',
          descricaoProduto: p.descricaoProduto ?? '',
          premissas: p.premissas ?? '',
          restricoes: p.restricoes ?? '',
          limitesAutoridade: p.limitesAutoridade ?? '',
          principaisEnvolvidos: (p as CharterProject & { principaisEnvolvidos?: string }).principaisEnvolvidos ?? '',
        }
        setFields(init)
        savedFields.current = init
        resetDraft(JSON.stringify({ ...init, macroFases: d.macroFases }))
      })
      .catch(e => setError(typeof e === 'string' ? e : 'Erro ao carregar Termo de Abertura'))
      .finally(() => setLoading(false))
  }, [projetoId, resetDraft])

  useEffect(() => {
    if (loading || !canEdit || !projetoId) return
    let cancelled = false
    fetchWithSession(`/api/projects/${projetoId}/revisions?type=CHARTER&draft=1`)
      .then(async response => {
        if (!response.ok) throw new Error('Não foi possível carregar o rascunho')
        const draft = await response.json()
        if (!cancelled && draft?.payload) {
          const { macroFases: _fases, documentContext: _context, ...draftFields } = draft.payload
          const next = { ...savedFields.current, ...draftFields }
          resetDraft(JSON.stringify({ ...next, macroFases: draft.payload.macroFases ?? savedFases.current }))
          setFields(next)
          if (draft.payload.macroFases) setFases(draft.payload.macroFases)
          toast('Seu rascunho privado foi restaurado. Salve uma versão para enviá-lo à aprovação.')
        }
        if (!cancelled) setDraftReady(true)
      }).catch(() => { if (!cancelled) setDraftError('Não foi possível recuperar seu rascunho. Tente novamente antes de editar.') })
    return () => { cancelled = true }
  }, [loading, canEdit, projetoId, toast, draftAttempt, resetDraft])

  // ── Load versions ──────────────────────────────────────────────────────────

  const loadVersions = useCallback(async (search = '') => {
    if (!projetoId) return
    try {
      const url = search
        ? `/api/projects/${projetoId}/charter/versions?search=${encodeURIComponent(search)}`
        : `/api/projects/${projetoId}/charter/versions`
      const r = await fetchWithSession(url)
      if (!r.ok) return
      const list: DocumentVersion[] = await r.json()
      setVersions(list)
      setIsManager(r.headers.get('x-is-manager') === 'true')
      if (!initializedMeta.current && search === '') {
        const approved = list.filter(v => v.status === 'APPROVED').sort((a, b) => new Date(b.approvedAt ?? b.createdAt).getTime() - new Date(a.approvedAt ?? a.createdAt).getTime())[0]
        if (approved) {
          initializedMeta.current = true
          const atuais = todosMembrosRef.current
          setVersionMeta({
            elaboradoPor: approved.elaboradoPor,
            elaboradoPorUserId: atuais.find(m => m.name === approved.elaboradoPor)?.id ?? null,
            aprovadoPor: approved.aprovadoPor,
            aprovadoPorUserId: atuais.find(m => m.name === approved.aprovadoPor)?.id ?? null,
            versao: approved.versao,
            dataAprovacaoRaw: toDateInputValue(approved.dataAprovacao),
          })
          setMetaCarregada(true)
        }
      }
    } catch {/* non-critical */}
  }, [projetoId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadVersions() }, [loadVersions])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (historyOpen) loadVersions(debouncedSearch)
  }, [debouncedSearch, historyOpen, loadVersions])

  // ── Macro fases ────────────────────────────────────────────────────────────

  function handleAddFase() {
    if (!canEdit) return
    const id = crypto.randomUUID()
    setFases(prev => [...prev, { id, fase: '', dataLimite: '', custo: '' }])
    // A nova linha já recebe o foco para digitar o nome da fase.
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-campo="fase-${CSS.escape(id)}"] textarea`)?.focus())
  }
  function handleFaseChange(id: string, field: keyof Omit<MacroFase, 'id'>, value: string) {
    if (canEdit) setFases(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f))
  }
  function handleRemoveFase(id: string) {
    if (canEdit) setFases(prev => prev.filter(f => f.id !== id))
  }

  // ── Print ──────────────────────────────────────────────────────────────────

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: TITULO_TERMO,
    pageStyle: printFolhasStyle(),
  })

  // ── Commit (save version) ──────────────────────────────────────────────────

  function validarResponsaveis(): string | null {
    if (versionMeta.elaboradoPor && !versionMeta.elaboradoPorUserId) {
      return 'Selecione um membro da equipe em "Elaborado por" — a pessoa informada não é um membro do projeto.'
    }
    if (versionMeta.aprovadoPor && !versionMeta.aprovadoPorUserId) {
      return 'Selecione um membro da equipe em "Aprovado por" — a pessoa informada não é um membro do projeto.'
    }
    return null
  }

  function openCommitModal() {
    if (!canEdit || !draftReady) return
    const problema = validarResponsaveis()
    if (problema) {
      toast(problema, 'error')
      return
    }
    setCommitError('')
    setCommitTitle('')
    setCommitModalOpen(true)
  }

  function handleSelectElaborado(membro: MembroEquipeOption | null) {
    setVersionMeta(m => ({
      ...m,
      elaboradoPor: membro?.name ?? '',
      elaboradoPorUserId: membro?.id ?? null,
    }))
  }

  async function handleConfirmCommit() {
    if (!canEdit || !draftReady) return
    if (!projetoId || !commitTitle.trim() || savingVersionRef.current) return
    const problema = validarResponsaveis()
    if (problema) {
      setCommitModalOpen(false)
      toast(problema, 'error')
      return
    }
    setCommitError('')
    savingVersionRef.current = true
    setSavingVersion(true)
    try {
      if (!await draftAutosave.flush()) {
        setCommitError('O rascunho não foi salvo. Tente novamente antes de criar a versão.')
        toast('O rascunho não foi salvo. Tente novamente antes de criar a versão.', 'error')
        return
      }
      const r = await fetchWithSession(`/api/projects/${projetoId}/charter/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { ...fields, macroFases: fases, documentContext: { nomeProjeto: data?.project.name ?? '', logoUrl: data?.project.logoUrl, gerenteProjeto: data?.gerenteProjeto ?? '', gerenteSignatureUrl: data?.gerente?.signatureUrl, membros: data?.membros ?? [] } },
          commitTitle: commitTitle.trim(),
          versao: versionMeta.versao,
          elaboradoPor: versionMeta.elaboradoPor,
          aprovadoPor: versionMeta.aprovadoPor,
          dataAprovacao: versionMeta.dataAprovacaoRaw,
        }),
      })
      if (r.ok) {
        setCommitModalOpen(false)
        await loadVersions()
        window.dispatchEvent(new CustomEvent('operum:document-version', { detail: { projetoId } }))
        savedFields.current = fields
        savedFases.current = fases
        setBase(JSON.stringify({ fields, fases, versionMeta }))
        const saved = await r.json()
        toast(saved.status === 'PENDING' ? 'Versão enviada para aprovação. O documento vigente foi preservado.' : 'Versão aprovada e publicada.')
        if (saved.status === 'APPROVED') window.dispatchEvent(new CustomEvent('operum:document-published', { detail: { projetoId } }))
      } else {
        const e = await r.json()
        setCommitError(e.error ?? 'Erro ao salvar versão')
        toast(e.error ?? 'Erro ao salvar versão', 'error')
      }
    } catch {
      setCommitError('Erro de rede ao salvar versão')
      toast('Erro de rede ao salvar versão', 'error')
    } finally {
      savingVersionRef.current = false
      setSavingVersion(false)
    }
  }

  // ── Version approve/reject ─────────────────────────────────────────────────

  async function handleVersionAction(versionId: string, action: 'approve' | 'reject') {
    if (!(canPublish)) return
    if (!projetoId) return
    setActingVersionId(versionId)
    try {
      const r = await fetchWithSession(
        `/api/projects/${projetoId}/documento/versions/${versionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      )
      if (r.ok) {
        await loadVersions(debouncedSearch)
        if (action === 'approve') window.dispatchEvent(new CustomEvent('operum:document-published', { detail: { projetoId } }))
        toast(action === 'approve' ? 'Versão aprovada!' : 'Versão rejeitada.', action === 'approve' ? 'success' : 'warning')
      } else {
        const e = await r.json()
        toast(e.error ?? 'Erro ao processar ação', 'error')
      }
    } catch {
      toast('Erro de rede', 'error')
    } finally {
      setActingVersionId(null)
    }
  }

  // ── Desfazer / refazer (campos, macro fases e quadro) ──────────────────────

  const estadoEdicao = useMemo(() => ({ fields, fases, versionMeta }), [fields, fases, versionMeta])
  const aplicarEstado = useCallback((e: typeof estadoEdicao) => { setFields(e.fields); setFases(e.fases); setVersionMeta(e.versionMeta) }, [])
  // O histórico começa depois de carregar o documento, o rascunho e o quadro da versão vigente.
  const historicoEdicao = useDesfazer(estadoEdicao, aplicarEstado, { ativo: draftReady && !selectedVersion, chave: `${draftReady}-${metaCarregada}` })

  // Alterações desta sessão que ainda não viraram versão (aviso ao sair do documento).
  const estadoAtual = JSON.stringify(estadoEdicao)
  const [base, setBase] = useState<string | null>(null)
  const estadoAtualRef = useRef(estadoAtual)
  useEffect(() => { estadoAtualRef.current = estadoAtual })
  useEffect(() => { if (draftReady) setBase(estadoAtualRef.current) }, [draftReady, metaCarregada])
  const rascunho = useRascunhoDocumento(projetoId, 'CHARTER')

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#eef0f3] p-8">
        <div className="bg-white animate-pulse shadow" style={{ width: '210mm', minHeight: '297mm' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-[#eef0f3] p-8">
        <div className="w-full max-w-[210mm] rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">{error}</div>
      </div>
    )
  }

  const pendenciasResponsaveis = [
    versionMeta.elaboradoPorUserId &&
    todosMembros.find(m => m.id === versionMeta.elaboradoPorUserId)?.pendente
      ? `Elaborado por: ${versionMeta.elaboradoPor}`
      : null,
    versionMeta.aprovadoPorUserId &&
    todosMembros.find(m => m.id === versionMeta.aprovadoPorUserId)?.pendente
      ? `Aprovado por: ${versionMeta.aprovadoPor}`
      : null,
  ].filter(Boolean) as string[]

  const context = selectedVersion ? selectedVersion.payload?.documentContext : {
    nomeProjeto: data?.project.name ?? '', logoUrl: data?.project.logoUrl,
    gerenteProjeto: data?.gerenteProjeto ?? '', gerenteSignatureUrl: data?.gerente?.signatureUrl, membros: data?.membros ?? [],
  }
  const content = selectedVersion ? selectedVersion.payload : fields
  const documentProps: CharterDocumentProps = {
    nomeProjeto: context?.nomeProjeto ?? 'Nome não registrado nesta versão',
    logoUrl: context?.logoUrl, gerenteProjeto: context?.gerenteProjeto ?? '',
    // O documento atual usa a assinatura do perfil do gerente; versões abertas pelo histórico
    // preservam a imagem registrada na aprovação (sem preencher propostas ainda pendentes).
    gerenteSignatureUrl: selectedVersion ? (selectedVersion.status === 'APPROVED' ? context?.gerenteSignatureUrl || data?.gerente?.signatureUrl || null : null) : data?.gerente?.signatureUrl ?? null,
    membros: context?.membros ?? [], fases: selectedVersion ? selectedVersion.payload?.macroFases ?? [] : fases,
    elaboradoPor: selectedVersion?.elaboradoPor ?? versionMeta.elaboradoPor,
    aprovadoPor: selectedVersion?.aprovadoPor ?? versionMeta.aprovadoPor,
    versao: selectedVersion?.versao ?? versionMeta.versao,
    dataAprovacao: formatDateBR(selectedVersion?.dataAprovacao ?? versionMeta.dataAprovacaoRaw, ''),
    // Linha institucional: automática, do cadastro do projeto (versões antigas guardaram a digitada).
    categoria: (selectedVersion ? content?.categoria : data?.instituicao) || content?.categoria || '',
    justificativa: content?.justificativa ?? '',
    objetivos: content?.objetivos ?? '', metodologia: content?.metodologia ?? '',
    descricaoProduto: content?.descricaoProduto ?? '', premissas: content?.premissas ?? '',
    restricoes: content?.restricoes ?? '', limitesAutoridade: content?.limitesAutoridade ?? '',
    principaisEnvolvidos: content?.principaisEnvolvidos ?? '',
  }
  async function exportWord() {
    try { await (await import('@/lib/exports/projectDocumentsDocx')).downloadCharterDocx(documentProps) }
    catch { toast('Não foi possível gerar o Word. Verifique as imagens do documento.', 'error') }
  }

  const editavel = canEdit && draftReady && !selectedVersion && !savingVersion
  const edicao: EdicaoTermo = {
    projetoId,
    membros: todosMembros,
    onCriarMembro: registrarCriado,
    onCampo: (campo, valor) => setFields(f => ({ ...f, [campo]: valor })),
    elaboradoPorUserId: versionMeta.elaboradoPorUserId,
    onElaboradoPor: handleSelectElaborado,
    onVersao: v => setVersionMeta(m => ({ ...m, versao: v })),
    dataAprovacaoRaw: versionMeta.dataAprovacaoRaw,
    onDataAprovacao: v => setVersionMeta(m => ({ ...m, dataAprovacaoRaw: v })),
    onFase: handleFaseChange,
    onAdicionarFase: handleAddFase,
    onRemoverFase: handleRemoveFase,
  }
  const vigente = versions.filter(v => v.status === 'APPROVED').sort((a, b) => new Date(b.approvedAt ?? b.createdAt).getTime() - new Date(a.approvedAt ?? a.createdAt).getTime())[0]
  const pendentes = versions.filter(v => v.status === 'PENDING').length
  const statusSalvamento: StatusSalvamento = !canEdit || selectedVersion ? 'leitura'
    : draftAutosave.status === 'saving' ? 'salvando'
    : draftAutosave.status === 'error' ? 'erro'
    : draftAutosave.status === 'pending' ? 'pendente' : 'salvo'

  return (
    <>
      <EditorDocumento
        editarProjetoHref={permissions.has('projeto:editar') ? `/projetos/${projetoId}/configuracoes` : undefined}
        documento="Termo de Abertura"
        editavel={editavel}
        status={statusSalvamento}
        versao={{
          rotulo: selectedVersion ? `${selectedVersion.versao} · ${STATUS_LABEL[selectedVersion.status].toLowerCase()}` : vigente ? `${vigente.versao} · vigente` : 'Rascunho',
          rotuloAtual: vigente ? `Rascunho sobre a ${vigente.versao} (editável)` : 'Rascunho (editável)',
          selecionada: selectedVersion?.id ?? null,
          opcoes: versions.filter(v => v.payload).map(v => ({ id: v.id, rotulo: `${v.versao} · ${v.id === vigente?.id ? 'vigente' : STATUS_LABEL[v.status].toLowerCase()}`, detalhe: v.commitTitle })),
          onSelecionar: id => setSelectedVersion(versions.find(v => v.id === id) ?? null),
        }}
        onSalvar={openCommitModal}
        podeSalvar={canEdit && draftReady && !savingVersion && !selectedVersion}
        onHistorico={() => setHistoryOpen(true)}
        pendentes={{ total: pendentes, onRevisar: () => window.dispatchEvent(new CustomEvent('operum:revisar-propostas', { detail: { projetoId } })) }}
        onImprimir={() => handlePrint()}
        onPdf={() => handlePrint()}
        onWord={() => void exportWord()}
        desfazer={historicoEdicao}
        onAdicionarLinha={handleAddFase}
        saida={{
          pendente: canEdit && draftReady && !selectedVersion && base !== null && estadoAtual !== base,
          salvar: openCommitModal,
          // O Termo já guarda o rascunho sozinho: "salvar mais tarde" só garante o último texto.
          salvarDepois: () => draftAutosave.flush(),
          descartar: async () => {
            draftAutosave.reset(draftPayload)
            await rascunho.descartar()
          },
        }}
        avisos={<>
          {recovery.backup && <div role="alert" className="rounded border bg-amber-50 p-3 text-sm">Há uma cópia local de alterações não confirmadas nesta aba.
            <button type="button" onClick={restoreLocalDraft} className="ml-2 underline">Restaurar cópia local</button>
            <button type="button" onClick={recovery.discard} className="ml-2 underline">Descartar cópia local</button>
          </div>}
          {draftError && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {draftError}
              <button type="button" className="ml-3 font-medium underline" onClick={() => { setDraftError(''); setDraftAttempt(value => value + 1) }}>Tentar novamente</button>
            </div>
          )}
          {draftAutosave.status === 'error' && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Falha ao salvar o rascunho. Seu texto foi preservado.
              <button type="button" onClick={() => void draftAutosave.flush()} className="ml-2 underline">Tentar salvar novamente</button>
            </div>
          )}
          {selectedVersion && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              Versão {selectedVersion.versao} · {STATUS_LABEL[selectedVersion.status]} — somente leitura.
              {!context && <span role="alert">Esta versão antiga não registrou cabeçalho e equipe. Os dados atuais não substituem o histórico.</span>}
              <button type="button" className="ml-auto font-medium text-blue-700 underline" onClick={() => setSelectedVersion(null)}>Voltar ao rascunho</button>
            </div>
          )}
        </>}
      >
        <ProjectCharterDocument {...documentProps} edicao={edicao} />
      </EditorDocumento>

      {/* Cópia só de leitura usada pela impressão/PDF (mesma folha, sem os controles). */}
      <CopiaParaImpressao>
        <ProjectCharterDocument ref={printRef} {...documentProps} />
      </CopiaParaImpressao>

      {/* ── Commit modal ──────────────────────────────────────────────────── */}
      <Modal isOpen={commitModalOpen} onClose={() => { if (!savingVersionRef.current) setCommitModalOpen(false) }} title="Salvar alteração" maxWidth="max-w-sm">
        <div className="flex flex-col gap-4 py-2">
          {commitError && <p role="alert" className="text-sm text-red-700">{commitError}</p>}
          {pendenciasResponsaveis.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs leading-relaxed">
              <strong>Pendência de cadastro:</strong> {pendenciasResponsaveis.join(' · ')} — membro(s)
              criado(s) de forma simples; o 1º acesso (troca de senha) é necessário para regularizar.
            </div>
          )}
          <div>
            <label className={labelClass}>Título da alteração <span className="text-red-500">*</span></label>
            <input
              className={inputClass}
              value={commitTitle}
              onChange={e => setCommitTitle(e.target.value)}
              placeholder="Ex: Inclusão da metodologia ágil"
              onKeyDown={e => { if (e.key === 'Enter' && commitTitle.trim()) handleConfirmCommit() }}
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">Descreva brevemente o que foi alterado.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button disabled={savingVersion} onClick={() => setCommitModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancelar</button>
            <button
              onClick={handleConfirmCommit}
              disabled={!draftReady || !commitTitle.trim() || savingVersion}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              {savingVersion ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── History drawer ────────────────────────────────────────────────── */}
      <Drawer
        isOpen={historyOpen}
        onClose={() => { setHistoryOpen(false); setHistorySearch('') }}
        title="Histórico de versões – Termo de Abertura"
        width="w-[420px]"
      >
        <div className="flex flex-col h-full">
          <div className="px-4 py-3 border-b border-slate-100">
            <input
              className={inputClass}
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Buscar por título ou autor…"
            />
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {versions.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">Nenhuma versão encontrada.</p>
            ) : (
              versions.map(v => (
                <div key={v.id} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{v.commitTitle}</span>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[v.status]}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    v{v.versao} · {v.author?.name ?? 'Desconhecido'} · {new Date(v.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <button disabled={!v.payload} className="text-left text-sm text-blue-700 disabled:opacity-50" onClick={() => { setSelectedVersion(v); setHistoryOpen(false) }}>Abrir documento desta versão</button>
                  <details><summary className="text-xs cursor-pointer">Alterações desta versão</summary>
                    {v.changes ? v.changes.length ? v.changes.map(change => <div key={change.field} className="my-2 text-xs"><strong>{change.field}</strong><p>Antes</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify(change.before, null, 2)}</pre><p>Depois</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{JSON.stringify(change.after, null, 2)}</pre></div>) : <p>Sem alterações de conteúdo.</p> : <p>Diff não registrado nesta versão antiga.</p>}
                  </details>
                  {isManager && v.status === 'PENDING' && (
                    <div className="flex gap-2 mt-1">
                      <button
                        disabled={actingVersionId === v.id}
                        onClick={() => handleVersionAction(v.id, 'approve')}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                      >
                        Aprovar
                      </button>
                      <button
                        disabled={actingVersionId === v.id}
                        onClick={() => handleVersionAction(v.id, 'reject')}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 transition-colors"
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Drawer>
    </>
  )
}
