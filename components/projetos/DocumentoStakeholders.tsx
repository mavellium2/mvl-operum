'use client'

import { EmailInput, TelefoneInput } from '@/components/ui/ContatoInputs'
import { erroEmail, erroTelefone } from '@/lib/contato'
import { printPageStyle } from '@/lib/printPageStyle'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useReactToPrint } from 'react-to-print'
import { Download, Save, History, Check, X } from 'lucide-react'
import StakeholderDocument, {
  type ProjetoHeader,
  type Stakeholder,
} from './StakeholderDocument'
import {
  type MembroEquipeOption,
  useMembrosEquipe,
} from './documentacao/MembroEquipeSelect'
import Modal from '@/components/ui/Modal'
import Drawer from '@/components/ui/Drawer'
import CamposQuadroDocumento from './documentacao/CamposQuadroDocumento'
import { useToast } from '@/components/ui/Toast'
import { fetchWithSession } from '@/lib/clientFetch'
import { formatDateBR, toDateInputValue } from '@/lib/date'
import PaginasDaPrevia from '@/components/projetos/documentacao/PaginasDaPrevia'

type DocumentData = { header: ProjetoHeader; stakeholders: Stakeholder[] }

interface EditableFields {
  elaboradoPor: string
  elaboradoPorUserId: string | null
  aprovadoPor: string
  aprovadoPorUserId: string | null
  versao: string
  dataAprovacaoRaw: string
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
}

const DEFAULTS: EditableFields = {
  elaboradoPor: '',
  elaboradoPorUserId: null,
  aprovadoPor: '',
  aprovadoPorUserId: null,
  versao: '1.0',
  dataAprovacaoRaw: '',
}

const labelClass = 'block text-sm font-semibold text-slate-700 mb-1'
const inputClass =
  'w-full border-2 border-slate-400 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white placeholder-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';


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

export default function DocumentoStakeholders({ membros = [] }: { membros?: MembroEquipeOption[] }) {
  const permissions = useProjectPermissions()
  const canEdit = permissions.has('documentos:editar')
  const { projetoId } = useParams<{ projetoId: string }>()
  const documentRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const [data, setData] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isManager, setIsManager] = useState(false)

  // Membros da equipe (responsável/aprovador devem ser membros) + criados na sessão (pendência)
  const { todos: todosMembros, registrarCriado } = useMembrosEquipe(membros)
  const todosMembrosRef = useRef(todosMembros)

  // Mantém a ref sincronizada com a lista mais recente de membros (lida em loadVersions)
  useEffect(() => {
    todosMembrosRef.current = todosMembros
  })

  // Campos editáveis — inicializados a partir da versão APPROVED mais recente (carregada no useEffect)
  const [editable, setEditable] = useState<EditableFields>(DEFAULTS)

  // Histórico
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const debouncedSearch = useDebounce(historySearch, 300)

  // Modal de commit
  const [commitModalOpen, setCommitModalOpen] = useState(false)
  const [commitTitle, setCommitTitle] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)

  // Aprovação em andamento
  const [actingVersionId, setActingVersionId] = useState<string | null>(null)
  const initializedFromDB = useRef(false)
  // Contatos como vieram do documento: só valores novos ou alterados são validados.
  const contatosCarregados = useRef({ emails: new Set<string>(), telefones: new Set<string>() })

  // ── Carregamento inicial ────────────────────────────────────────────────────

  useEffect(() => {
    if (!projetoId) return
    fetchWithSession(`/api/projects/${projetoId}/documento`)
      .then(r =>
        r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error)),
      )
      .then((d: DocumentData) => {
        contatosCarregados.current = {
          emails: new Set(d.stakeholders.map(s => s.email ?? '')),
          telefones: new Set(d.stakeholders.map(s => s.telefoneFax ?? '')),
        }
        setData(d)
      })
      .catch(e => setError(typeof e === 'string' ? e : 'Erro ao carregar documento'))
      .finally(() => setLoading(false))
  }, [projetoId])

  const loadVersions = useCallback(
    async (search = '') => {
      if (!projetoId) return
      try {
        const url = search
          ? `/api/projects/${projetoId}/documento/versions?search=${encodeURIComponent(search)}`
          : `/api/projects/${projetoId}/documento/versions`
        const r = await fetchWithSession(url)
        if (!r.ok) return
        const list: DocumentVersion[] = await r.json()
        setVersions(list)

        // Extrai isManager do header para controlar visibilidade dos botões de aprovação
        setIsManager(r.headers.get('x-is-manager') === 'true')

        // Inicializa campos com o payload da versão APPROVED mais recente (somente uma vez)
        if (!initializedFromDB.current && search === '') {
          const approved = list.filter(v => v.status === 'APPROVED').sort((a, b) => new Date(b.approvedAt ?? b.createdAt).getTime() - new Date(a.approvedAt ?? a.createdAt).getTime())[0]
          if (approved) {
            initializedFromDB.current = true
            const atuais = todosMembrosRef.current
            setEditable({
              elaboradoPor: approved.elaboradoPor,
              elaboradoPorUserId: atuais.find(m => m.name === approved.elaboradoPor)?.id ?? null,
              aprovadoPor: approved.aprovadoPor,
              aprovadoPorUserId: atuais.find(m => m.name === approved.aprovadoPor)?.id ?? null,
              versao: approved.versao,
              dataAprovacaoRaw: toDateInputValue(approved.dataAprovacao),
            })
          }
        }
      } catch {
        // não crítico
      }
    },
    [projetoId],
  )

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadVersions() }, [loadVersions])

  // ── Busca com debounce no drawer ────────────────────────────────────────────

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (historyOpen) loadVersions(debouncedSearch)
  }, [debouncedSearch, historyOpen, loadVersions])

  // ── Impressão ───────────────────────────────────────────────────────────────

  const handlePrint = useReactToPrint({
    contentRef: documentRef,
    documentTitle: 'Formulário de parte interessada',
    onBeforePrint: async () => { document.title = 'Formulário de parte interessada' },
    onAfterPrint: () => { document.title = 'Documentação' },
    pageStyle: printPageStyle({ landscape: true }),
  })

  // ── Commit (salvar versão) ──────────────────────────────────────────────────

  function validarResponsaveis(): string | null {
    if (editable.elaboradoPor && !editable.elaboradoPorUserId) {
      return 'Selecione um membro da equipe em "Elaborado por" — a pessoa informada não é um membro do projeto.'
    }
    if (editable.aprovadoPor && !editable.aprovadoPorUserId) {
      return 'Selecione um membro da equipe em "Aprovado por" — a pessoa informada não é um membro do projeto.'
    }
    for (const [index, pessoa] of (data?.stakeholders ?? []).entries()) {
      const rotulo = `Parte interessada ${index + 1}`
      const email = pessoa.email ?? ''
      const erroDoEmail = contatosCarregados.current.emails.has(email) ? null : erroEmail(email)
      if (erroDoEmail) return `${rotulo}: ${erroDoEmail}`
      const telefone = pessoa.telefoneFax ?? ''
      const erroDoTelefone = contatosCarregados.current.telefones.has(telefone) ? null : erroTelefone(telefone)
      if (erroDoTelefone) return `${rotulo}: ${erroDoTelefone}`
    }
    return null
  }

  function handleSelectElaborado(membro: MembroEquipeOption | null) {
    setEditable(prev => ({
      ...prev,
      elaboradoPor: membro?.name ?? '',
      elaboradoPorUserId: membro?.id ?? null,
    }))
  }

  function handleSelectAprovado(membro: MembroEquipeOption | null) {
    setEditable(prev => ({
      ...prev,
      aprovadoPor: membro?.name ?? '',
      aprovadoPorUserId: membro?.id ?? null,
    }))
  }

  function openCommitModal() {
    if (!canEdit) return
    const problema = validarResponsaveis()
    if (problema) {
      toast(problema, 'error')
      return
    }
    setCommitTitle('')
    setCommitModalOpen(true)
  }

  async function handleConfirmCommit() {
    if (!canEdit) return
    if (!projetoId || !commitTitle.trim()) return
    const problema = validarResponsaveis()
    if (problema) {
      setCommitModalOpen(false)
      toast(problema, 'error')
      return
    }
    setSavingVersion(true)
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/documento/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { ...data, header: { ...data?.header, elaboradoPor: editable.elaboradoPor, aprovadoPor: editable.aprovadoPor, versao: editable.versao, dataAprovacao: editable.dataAprovacaoRaw } },
          commitTitle: commitTitle.trim(),
          versao: editable.versao,
          elaboradoPor: editable.elaboradoPor,
          aprovadoPor: editable.aprovadoPor,
          dataAprovacao: editable.dataAprovacaoRaw,
        }),
      })
      if (r.ok) {
        setCommitModalOpen(false)
        await loadVersions()
        window.dispatchEvent(new CustomEvent('operum:document-version', { detail: { projetoId } }))
        const saved = await r.json()
        toast(saved.status === 'PENDING' ? 'Versão enviada para aprovação. O documento vigente foi preservado.' : 'Versão aprovada e publicada.')
        if (saved.status === 'APPROVED') window.dispatchEvent(new CustomEvent('operum:document-published', { detail: { projetoId } }))
      } else {
        const e = await r.json()
        toast(e.error ?? 'Erro ao salvar versão', 'error')
      }
    } catch {
      toast('Erro de rede ao salvar versão', 'error')
    } finally {
      setSavingVersion(false)
    }
  }

  // ── Aprovação / Rejeição ────────────────────────────────────────────────────

  async function handleVersionAction(versionId: string, action: 'approve' | 'reject') {
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

  // ── Helpers de renderização ─────────────────────────────────────────────────

  function update(field: keyof EditableFields, value: string) {
    if (!canEdit) return
    setEditable(prev => ({ ...prev, [field]: value }))
  }

  const mergedHeader: ProjetoHeader | null = data
    ? {
        ...data.header,
        elaboradoPor: editable.elaboradoPor,
        aprovadoPor: editable.aprovadoPor,
        versao: editable.versao,
        dataAprovacao: formatDateBR(editable.dataAprovacaoRaw, ''),
      }
    : null

  const pendenciasResponsaveis = [
    editable.elaboradoPorUserId &&
    todosMembros.find(m => m.id === editable.elaboradoPorUserId)?.pendente
      ? `Elaborado por: ${editable.elaboradoPor}`
      : null,
    editable.aprovadoPorUserId &&
    todosMembros.find(m => m.id === editable.aprovadoPorUserId)?.pendente
      ? `Aprovado por: ${editable.aprovadoPor}`
      : null,
  ].filter(Boolean) as string[]

  return (
    <div className="min-h-screen bg-gray-300 flex flex-col items-center py-8 gap-6">
      <div className="w-full max-w-[297mm] flex flex-col gap-3">
        {/* Campos editáveis */}
        {!loading && !error && data && (
          <div className="bg-white rounded-xl shadow-md p-5 grid grid-cols-2 gap-4">
            <CamposQuadroDocumento
              idPrefix="ds"
              projetoId={projetoId}
              membros={todosMembros}
              onCriarMembro={registrarCriado}
              gerenteProjeto={data.header.gerenteProjeto ?? ''}
              elaboradoPorUserId={editable.elaboradoPorUserId}
              onElaboradoPor={handleSelectElaborado}
              aprovadoPorUserId={editable.aprovadoPorUserId}
              onAprovadoPor={handleSelectAprovado}
              versao={editable.versao}
              onVersao={v => update('versao', v)}
              dataAprovacao={editable.dataAprovacaoRaw}
              onDataAprovacao={v => update('dataAprovacaoRaw', v)}
              labelClass={labelClass}
              inputClass={inputClass}
            />
          </div>
        )}

        {/* Barra de ações */}
        <button type="button" disabled={!mergedHeader || !data} className="self-end rounded bg-blue-600 px-4 py-2 text-white" onClick={async () => {
          if (!mergedHeader || !data) return
          try { await (await import('@/lib/exports/projectDocumentsDocx')).downloadStakeholderDocx(mergedHeader, data.stakeholders) }
          catch { toast('Não foi possível gerar o Word. Verifique as imagens do documento.', 'error') }
        }}>Baixar Word</button>
        <div className="flex justify-end gap-2">
          {/* Botão de histórico — ícone discreto */}
          <button
            aria-label="Histórico de versões"
            onClick={() => setHistoryOpen(true)}
            className="relative flex items-center gap-1.5 px-3 py-2 text-slate-600 text-sm rounded-xl hover:bg-white hover:shadow transition-all"
          >
            <History className="w-4 h-4" />
            {versions.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {versions.length > 99 ? '99+' : versions.length}
              </span>
            )}
          </button>

          <button
            onClick={openCommitModal}
            disabled={loading || !!error || !data || savingVersion}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            Salvar Versão
          </button>

          <button
            onClick={() => handlePrint()}
            disabled={loading || !!error || !data}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Baixar PDF
          </button>
        </div>
      </div>

      {canEdit && data && !loading && !error && (
        <details className="w-full max-w-4xl rounded-xl border border-gray-200 bg-white p-5">
          <summary className="cursor-pointer font-semibold">Editar partes interessadas desta versão</summary>
          <p className="my-3 text-sm text-gray-600">Estas alterações pertencem ao documento. O cadastro da equipe permanece independente. Salve uma versão para enviar à aprovação.</p>
          <div className="space-y-4">
            {data.stakeholders.map((person, index) => (
              <fieldset key={index} className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2">
                <legend className="px-1 text-sm font-semibold">Parte interessada {index + 1}</legend>
                {([
                  ['nome', 'Nome'], ['empresaEquipe', 'Empresa / equipe'], ['cargoCompetencia', 'Cargo / competência'],
                  ['email', 'E-mail'], ['telefoneFax', 'Telefone'], ['endereco', 'Endereço'], ['observacoes', 'Observações'],
                ] as const).map(([field, label]) => {
                  const alterar = (value: string) =>
                    setData(prev => prev ? { ...prev, stakeholders: prev.stakeholders.map((row, i) => i === index ? { ...row, [field]: value } : row) } : prev)
                  return (
                    <label key={field} className="text-sm">{label}
                      {field === 'email' ? (
                        <EmailInput className={inputClass} value={person[field] ?? ''} onValueChange={alterar} />
                      ) : field === 'telefoneFax' ? (
                        <TelefoneInput className={inputClass} value={person[field] ?? ''} onValueChange={alterar} />
                      ) : (
                        <input className={inputClass} value={person[field] ?? ''} onChange={event => alterar(event.target.value)} />
                      )}
                    </label>
                  )
                })}
                <button type="button" className="text-left text-sm text-red-700" onClick={() => setData(prev => prev ? { ...prev, stakeholders: prev.stakeholders.filter((_, i) => i !== index) } : prev)}>Remover desta versão</button>
              </fieldset>
            ))}
            <button type="button" className="rounded border border-blue-300 px-3 py-2 text-sm text-blue-700" onClick={() => setData(prev => prev ? { ...prev, stakeholders: [...prev.stakeholders, { ref: String(prev.stakeholders.length + 1).padStart(2, '0'), nome: '', empresaEquipe: '', cargoCompetencia: '', email: '', telefoneFax: '', endereco: '', observacoes: '' }] } : prev)}>Adicionar parte interessada ao documento</button>
          </div>
        </details>
      )}

      {/* States */}
      {loading && (
        <div className="bg-white animate-pulse rounded shadow-2xl" style={{ width: '297mm', minHeight: '210mm' }} />
      )}
      {error && (
        <div className="w-full max-w-[297mm] rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">
          {error}
        </div>
      )}
      {mergedHeader && !loading && (
        <div role="region" aria-label="Prévia em paisagem das partes interessadas" tabIndex={0} className="w-full max-w-[297mm] overflow-x-auto shadow-2xl">
          <PaginasDaPrevia landscape>
            <StakeholderDocument ref={documentRef} header={mergedHeader} stakeholders={data!.stakeholders} />
          </PaginasDaPrevia>
        </div>
      )}

      {/* ── Modal de commit ───────────────────────────────────────────────── */}
      <Modal
        isOpen={commitModalOpen}
        onClose={() => setCommitModalOpen(false)}
        title="Salvar alteração"
        maxWidth="max-w-sm"
      >
        <div className="flex flex-col gap-4 py-2">
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
              placeholder="Ex: Atualização dos aprovadores"
              onKeyDown={e => { if (e.key === 'Enter' && commitTitle.trim()) handleConfirmCommit() }}
              autoFocus
            />
            <p className="text-xs text-slate-500 mt-1">Descreva brevemente o que foi alterado.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setCommitModalOpen(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmCommit}
              disabled={!commitTitle.trim() || savingVersion}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              {savingVersion ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Drawer de histórico ───────────────────────────────────────────── */}
      <Drawer
        isOpen={historyOpen}
        onClose={() => { setHistoryOpen(false); setHistorySearch('') }}
        title="Histórico de versões"
        width="w-[420px]"
      >
        <div className="flex flex-col h-full">
          {/* Busca */}
          <div className="px-4 py-3 border-b border-slate-100">
            <input
              className={inputClass}
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              placeholder="Buscar por título ou autor…"
              aria-label="Buscar no histórico"
            />
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {versions.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-10">Nenhuma versão encontrada.</p>
            ) : (
              versions.map(v => (
                <div key={v.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{v.commitTitle || '(sem título)'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {v.author?.name ?? 'Usuário desconhecido'} ·{' '}
                        {new Date(v.createdAt).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">v{v.versao}</p>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[v.status]}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                  </div>

                  {/* Botões de aprovação — somente para gerentes e versões pendentes */}
                  {permissions.has('documentos:aprovar') && isManager && v.status === 'PENDING' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleVersionAction(v.id, 'approve')}
                        disabled={actingVersionId === v.id}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" /> Aprovar
                      </button>
                      <button
                        onClick={() => handleVersionAction(v.id, 'reject')}
                        disabled={actingVersionId === v.id}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        <X className="w-3 h-3" /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </Drawer>
    </div>
  )
}
