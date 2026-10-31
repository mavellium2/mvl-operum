'use client'

import { erroEmail, erroTelefone, formatEmail, formatTelefone } from '@/lib/contato'
import { printFolhasStyle } from '@/lib/printPageStyle'
import { CopiaParaImpressao } from '@/components/documentos/editor/folha'
import { acrescentarPartesDoCadastro } from '@/lib/partesInteressadas'
import EditorDocumento from '@/components/documentos/editor/EditorDocumento'
import ProjetoStakeholdersClient from '@/components/projetos/ProjetoStakeholdersClient'
import { useDesfazer } from '@/hooks/useDesfazer'
import { useRascunhoDocumento } from '@/hooks/useRascunhoDocumento'
import { abrirPropostas, ROTULO_STATUS, useVersoesDocumento } from '@/hooks/useVersoesDocumento'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useReactToPrint } from 'react-to-print'
import { Save, Check, X } from 'lucide-react'
import StakeholderDocument, {
  type EdicaoStakeholders,
  type ProjetoHeader,
  type Stakeholder,
} from './StakeholderDocument'
import {
  type MembroEquipeOption,
  useMembrosEquipe,
} from './documentacao/MembroEquipeSelect'
import Modal from '@/components/ui/Modal'
import Drawer from '@/components/ui/Drawer'
import { useToast } from '@/components/ui/Toast'
import { fetchWithSession } from '@/lib/clientFetch'
import { formatDateBR, toDateInputValue } from '@/lib/date'

type DocumentData = { header: ProjetoHeader; stakeholders: Stakeholder[]; cadastrosExcluidos?: string[] }

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

/** Dados do cadastro de Stakeholders (para adicionar interno/externo pelo documento). */
export type CadastroStakeholders = NonNullable<Awaited<ReturnType<typeof import('@/services/stakeholdersDoProjeto').carregarStakeholdersDoProjeto>>> & { userRole: 'admin' | 'gerente' }

export default function DocumentoStakeholders({ membros = [], cadastro }: { membros?: MembroEquipeOption[]; cadastro?: CadastroStakeholders | null }) {
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
  const [alterado, setAlterado] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const rascunho = useRascunhoDocumento(projetoId, 'STAKEHOLDER')
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false)
  const [painel, setPainel] = useState<null | 'interno' | 'externo'>(null)
  const [versaoSelecionada, setVersaoSelecionada] = useState<string | null>(null)
  const { versoes, vigente, pendentes } = useVersoesDocumento(projetoId, 'STAKEHOLDER')

  // Desfazer/refazer: quadro + linhas da tabela.
  const linhasAtuais = data?.stakeholders
  const cadastrosExcluidos = data?.cadastrosExcluidos
  const estadoEdicao = useMemo(() => ({ editable, linhas: linhasAtuais, cadastrosExcluidos }), [editable, linhasAtuais, cadastrosExcluidos])
  const aplicarEstado = useCallback((e: { editable: EditableFields; linhas?: Stakeholder[]; cadastrosExcluidos?: string[] }) => {
    setEditable(e.editable)
    setData(prev => prev && e.linhas ? { ...prev, stakeholders: e.linhas, cadastrosExcluidos: e.cadastrosExcluidos } : prev)
    setAlterado(true)
  }, [])
  // O histórico recomeça quando o documento e o quadro da versão vigente terminam de carregar.
  const [carregamentos, setCarregamentos] = useState(0)
  const historicoEdicao = useDesfazer(estadoEdicao, aplicarEstado, { ativo: !!data, chave: carregamentos })

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
      .then((d: DocumentData & { cadastroAtualizado?: boolean }) => {
        contatosCarregados.current = {
          emails: new Set(d.stakeholders.map(s => s.email ?? '')),
          telefones: new Set(d.stakeholders.map(s => s.telefoneFax ?? '')),
        }
        setData({ header: d.header, stakeholders: d.stakeholders, ...(d.cadastrosExcluidos ? { cadastrosExcluidos: d.cadastrosExcluidos } : {}) })
        if (d.cadastroAtualizado) setAlterado(true)
        setCarregamentos(n => n + 1)
        // "Salvar mais tarde": volta de onde parou (rascunho privado, ainda sem versão).
        if (!canEdit) return
        return rascunho.recuperar<DocumentData>().then(salvo => {
          if (!salvo?.header || !Array.isArray(salvo.stakeholders)) return
          initializedFromDB.current = true
          const atuais = todosMembrosRef.current
          setEditable(prev => ({
            ...prev,
            elaboradoPor: salvo.header.elaboradoPor ?? prev.elaboradoPor,
            elaboradoPorUserId: atuais.find(m => m.name === salvo.header.elaboradoPor)?.id ?? prev.elaboradoPorUserId,
            versao: salvo.header.versao || prev.versao,
            dataAprovacaoRaw: toDateInputValue(salvo.header.dataAprovacao) || prev.dataAprovacaoRaw,
          }))
          setData(prev => prev ? { ...prev, stakeholders: acrescentarPartesDoCadastro(salvo.stakeholders, prev.stakeholders, salvo.cadastrosExcluidos), cadastrosExcluidos: salvo.cadastrosExcluidos } : prev)
          setCarregamentos(n => n + 1)
          setRascunhoRestaurado(true)
        })
      })
      .catch(e => setError(typeof e === 'string' ? e : 'Erro ao carregar documento'))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega uma vez por projeto
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
            setCarregamentos(n => n + 1)
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
    // Layout do modelo "03_Form Stakeholders": margens menores e só a numeração no rodapé.
    pageStyle: printFolhasStyle({ landscape: true }),
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

  /** Conteúdo do documento como vai para a versão (e para o rascunho de "salvar mais tarde"). */
  function payloadDocumento() {
    return { ...data, header: { ...data?.header, elaboradoPor: editable.elaboradoPor, aprovadoPor: editable.aprovadoPor, versao: editable.versao, dataAprovacao: editable.dataAprovacaoRaw } }
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
          payload: payloadDocumento(),
          commitTitle: commitTitle.trim(),
          versao: editable.versao,
          elaboradoPor: editable.elaboradoPor,
          aprovadoPor: editable.aprovadoPor,
          dataAprovacao: editable.dataAprovacaoRaw,
        }),
      })
      if (r.ok) {
        setCommitModalOpen(false)
        setAlterado(false)
        setRascunhoRestaurado(false)
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

  // Versão aberta pelo seletor: só leitura, com o conteúdo salvo nela.
  const versaoAberta = versaoSelecionada ? versoes.find(v => v.id === versaoSelecionada) ?? null : null
  const conteudoVersao = versaoAberta?.payload as Partial<DocumentData> | null | undefined
  const headerExibido: ProjetoHeader | null = conteudoVersao?.header && mergedHeader
    ? { ...mergedHeader, ...conteudoVersao.header, dataAprovacao: formatDateBR(conteudoVersao.header.dataAprovacao, '') }
    : mergedHeader
  const linhasExibidas = conteudoVersao?.stakeholders ?? data?.stakeholders ?? []
  const editavel = canEdit && !versaoAberta && !savingVersion && !!data
  const alterarLinhas = (fn: (linhas: Stakeholder[]) => Stakeholder[]) => {
    setData(prev => prev ? { ...prev, stakeholders: fn(prev.stakeholders) } : prev)
    setAlterado(true)
  }
  const edicao: EdicaoStakeholders = {
    projetoId,
    membros: todosMembros,
    onCriarMembro: registrarCriado,
    elaboradoPorUserId: editable.elaboradoPorUserId,
    onElaboradoPor: m => { handleSelectElaborado(m); setAlterado(true) },
    onVersao: v => { update('versao', v); setAlterado(true) },
    dataAprovacaoRaw: editable.dataAprovacaoRaw,
    onDataAprovacao: v => { update('dataAprovacaoRaw', v); setAlterado(true) },
    onCelula: (indice, campo, valor) => alterarLinhas(linhas => linhas.map((row, i) => i === indice
      ? { ...row, [campo]: campo === 'telefoneFax' ? formatTelefone(valor) : campo === 'email' ? formatEmail(valor) : valor }
      : row)),
    onAdicionar: () => {
      // Sem acesso ao cadastro de Stakeholders: só uma linha em branco nesta versão do documento.
      alterarLinhas(linhas => [...linhas, { ref: String(linhas.length + 1).padStart(2, '0'), nome: '', empresaEquipe: '', cargoCompetencia: '', email: '', telefoneFax: '', endereco: '', observacoes: '' }])
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-campo="ds-${data?.stakeholders.length ?? 0}-nome"] textarea`)?.focus())
    },
    onRemover: indice => {
      setData(prev => {
        if (!prev) return prev
        const cadastroId = prev.stakeholders[indice]?.cadastroId
        return { ...prev, stakeholders: prev.stakeholders.filter((_, i) => i !== indice), ...(cadastroId ? { cadastrosExcluidos: [...new Set([...(prev.cadastrosExcluidos ?? []), cadastroId])] } : {}) }
      })
      setAlterado(true)
    },
  }
  /**
   * Depois de vincular/criar/salvar no cadastro, busca o documento de novo e
   * acrescenta só as pessoas que ainda não estão na tabela (as edições feitas
   * nesta versão do documento são mantidas).
   */
  const incluirNovosDoCadastro = useCallback(async () => {
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/documento?origem=cadastro`, { cache: 'no-store' })
      if (!r.ok) throw new Error('Falha ao consultar o cadastro atualizado')
      const atual: DocumentData = await r.json()
      setData(prev => prev ? { ...prev, stakeholders: acrescentarPartesDoCadastro(prev.stakeholders, atual.stakeholders, prev.cadastrosExcluidos) } : prev)
      setAlterado(true)
    } catch {
      toast('A pessoa foi salva no projeto, mas não foi possível atualizar a tabela. Tente adicionar novamente para recarregar o cadastro.', 'error')
    }
  }, [projetoId, toast])

  useEffect(() => {
    const atualizar = (event: Event) => {
      if ((event as CustomEvent<{ projetoId: string }>).detail?.projetoId === projetoId) void incluirNovosDoCadastro()
    }
    window.addEventListener("operum:project-members-updated", atualizar)
    return () => window.removeEventListener("operum:project-members-updated", atualizar)
  }, [incluirNovosDoCadastro, projetoId])

  // "Adicionar parte interessada": abre o cadastro da tela Stakeholders (interno ou externo) à direita.
  const menuAdicionar = cadastro ? {
    aberto: menuAberto,
    onAbrir: setMenuAberto,
    opcoes: [
      { rotulo: 'Stakeholder interno', descricao: 'Membro da equipe (usuário do sistema)', onClick: () => setPainel('interno') },
      { rotulo: 'Stakeholder externo', descricao: 'Pessoa ou organização de fora da equipe', onClick: () => setPainel('externo') },
    ],
  } : undefined

  async function baixarWord() {
    if (!headerExibido) return
    try { await (await import('@/lib/exports/projectDocumentsDocx')).downloadStakeholderDocx(headerExibido, linhasExibidas) }
    catch { toast('Não foi possível gerar o Word. Verifique as imagens do documento.', 'error') }
  }

  if (loading || error || !headerExibido) {
    return (
      <div className="flex h-full items-start justify-center bg-[#eef0f3] p-8">
        {loading
          ? <div className="bg-white animate-pulse shadow" style={{ width: '297mm', minHeight: '210mm' }} />
          : <div className="w-full max-w-[297mm] rounded-xl bg-red-50 border border-red-200 p-6 text-red-700 text-sm">{error ?? 'Erro ao carregar documento'}</div>}
      </div>
    )
  }

  return (
    <>
      <EditorDocumento
        editarProjetoHref={permissions.has('projeto:editar') ? `/projetos/${projetoId}/configuracoes` : undefined}
        documento="Partes Interessadas"
        paisagem
        editavel={editavel}
        status={!canEdit || versaoAberta ? 'leitura' : savingVersion ? 'salvando' : alterado ? 'pendente' : 'salvo'}
        mensagemStatus={!canEdit || versaoAberta ? undefined : alterado ? 'Alterações ainda não salvas — use “Salvar versão”' : 'Tudo salvo'}
        versao={{
          rotulo: versaoAberta ? `${versaoAberta.versao ?? '—'} · ${ROTULO_STATUS[versaoAberta.status] ?? ''}` : `${editable.versao || '1.0'} · ${vigente ? 'vigente' : 'rascunho'}`,
          rotuloAtual: 'Documento atual (editável)',
          selecionada: versaoSelecionada,
          opcoes: versoes.filter(v => v.payload).map(v => ({ id: v.id, rotulo: `${v.versao ?? '—'} · ${v.id === vigente?.id ? 'vigente' : ROTULO_STATUS[v.status] ?? ''}`, detalhe: v.commitTitle })),
          onSelecionar: setVersaoSelecionada,
        }}
        onSalvar={openCommitModal}
        podeSalvar={editavel}
        onHistorico={() => setHistoryOpen(true)}
        pendentes={{ total: pendentes, onRevisar: () => abrirPropostas(projetoId) }}
        onImprimir={() => handlePrint()}
        onPdf={() => handlePrint()}
        onWord={() => void baixarWord()}
        desfazer={historicoEdicao}
        onAdicionarLinha={cadastro ? () => setMenuAberto(true) : edicao.onAdicionar}
        saida={{
          pendente: canEdit && alterado && !versaoAberta,
          salvar: openCommitModal,
          salvarDepois: () => rascunho.guardar(payloadDocumento()),
          descartar: () => rascunho.descartar(),
        }}
        avisos={versaoAberta ? (
          <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
            Versão {versaoAberta.versao ?? '—'} · {ROTULO_STATUS[versaoAberta.status] ?? versaoAberta.status} — somente leitura.
            <button type="button" className="ml-auto font-medium text-blue-700 underline" onClick={() => setVersaoSelecionada(null)}>Voltar ao documento atual</button>
          </div>
        ) : canEdit ? (<>
          {rascunhoRestaurado && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Seu rascunho foi restaurado. Salve uma versão para enviá-lo à aprovação.</p>}
          <p className="text-xs text-slate-500">As alterações nesta folha pertencem ao documento; o cadastro de Stakeholders do projeto não muda. Salve uma versão para enviar à aprovação.</p>
        </>) : null}
      >
        <StakeholderDocument header={headerExibido} stakeholders={linhasExibidas} edicao={edicao} menuAdicionar={menuAdicionar} />
      </EditorDocumento>

      {cadastro && painel && (
        <ProjetoStakeholdersClient
          key={painel}
          projetoId={projetoId}
          stakeholders={cadastro.stakeholders}
          stakeholdersDisponiveis={cadastro.stakeholdersDisponiveis}
          usuariosDisponiveis={cadastro.usuariosDisponiveis}
          funcoesExistentes={cadastro.funcoesExistentes}
          departamentosExistentes={cadastro.departamentosExistentes}
          userRole={cadastro.userRole}
          painel={{ modo: painel, onFechar: () => setPainel(null), onAlterado: () => void incluirNovosDoCadastro() }}
        />
      )}

      {/* Cópia só de leitura usada pela impressão/PDF (mesma folha, sem os controles). */}
      <CopiaParaImpressao>
        <StakeholderDocument ref={documentRef} header={headerExibido} stakeholders={linhasExibidas} />
      </CopiaParaImpressao>

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
    </>
  )
}
