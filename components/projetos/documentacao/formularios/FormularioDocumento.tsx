'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { useReactToPrint } from 'react-to-print'
import EditorDocumento, { type StatusSalvamento } from '@/components/documentos/editor/EditorDocumento'
import { CopiaParaImpressao } from '@/components/documentos/editor/folha'
import Modal from '@/components/ui/Modal'
import FormActions from '@/components/ui/FormActions'
import GlassButton from '@/components/ui/GlassButton'
import { Input } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import { abrirPropostas, ROTULO_STATUS, useVersoesDocumento } from '@/hooks/useVersoesDocumento'
import { useRascunhoDocumento } from '@/hooks/useRascunhoDocumento'
import { useAutosave } from '@/hooks/useAutosave'
import { fetchWithSession } from '@/lib/clientFetch'
import { printFolhasStyle } from '@/lib/printPageStyle'
import { safeAvatarUrl } from '@/lib/validation/avatarUrl'
import { proximaVersao } from '../CapaDocumento'
import type { MembroEquipeOption } from '../MembroEquipeSelect'
import type { EdicaoQuadro, SistemaFormulario } from './QuadroFormulario'

export type TipoFormulario = 'ESCOPO' | 'RISCOS' | 'LICOES'

/** Dados do sistema devolvidos por `/formularios` (comuns + específicos de cada documento). */
export interface DadosFormularios extends SistemaFormulario {
  termo: { justificativa: string; objetivos: string; descricaoProduto: string }
  entregas: { raiz: { codigo: string; titulo: string } | null; itens: { codigo: string; titulo: string }[] }
}

/** O que cada documento desenha: as folhas, a partir do conteúdo e do estado do editor. */
export interface RenderFormulario<T> {
  conteudo: T
  sistema: DadosFormularios
  /** Versão exibida no quadro quando o campo está vazio. */
  versaoPadrao: string
  /** Só no editor: altera o conteúdo (fora dele, PDF e Word, é indefinido). */
  alterar?: (fn: (atual: T) => T) => void
  edicao?: Omit<EdicaoQuadro, 'onCabecalho'>
}

interface Props<T> {
  tipo: TipoFormulario
  /** Nome do documento (barra do editor, mensagens). */
  documento: string
  /** Título do Word. */
  titulo: string
  /** Nome do arquivo .docx. */
  arquivo: string
  membros: MembroEquipeOption[]
  /** Conteúdo de um documento novo (sem versão nem rascunho), a partir do sistema e da equipe. */
  inicial: (sistema: DadosFormularios, membros: MembroEquipeOption[]) => T
  /** Normaliza um conteúdo salvo (versões antigas, campos faltando). */
  normalizar?: (salvo: T, sistema: DadosFormularios, membros: MembroEquipeOption[]) => T
  render: (r: RenderFormulario<T>) => ReactNode
  /** Botão "Adicionar" no grupo Edição (ex.: novo formulário de risco). */
  adicionar?: (alterar: (fn: (atual: T) => T) => void) => void
}

/**
 * Editor dos formulários de GP na Documentação: rascunho automático, versões
 * com aprovação do gerente, impressão, PDF e Word idêntico à folha — o mesmo
 * fluxo da Capa e do Termo.
 */
export default function FormularioDocumento<T>({ tipo, documento, titulo, arquivo, membros, inicial, normalizar, render, adicionar }: Props<T>) {
  const { projetoId } = useParams<{ projetoId: string }>()
  const permissions = useProjectPermissions()
  const canEdit = permissions.has('documentos:editar')
  const { toast } = useToast()
  const printRef = useRef<HTMLDivElement>(null)
  const { versoes, vigente, pendentes } = useVersoesDocumento(projetoId, tipo)
  const rascunho = useRascunhoDocumento(projetoId, tipo)

  const [sistema, setSistema] = useState<DadosFormularios | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState<T | null>(null)
  const [base, setBase] = useState<string | null>(null)
  const [versaoAberta, setVersaoAberta] = useState<string | null>(null)
  const [salvarAberto, setSalvarAberto] = useState(false)
  const [tituloAlteracao, setTituloAlteracao] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!projetoId) return
    let ativo = true
    fetchWithSession(`/api/projects/${projetoId}/formularios`)
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error)))
      .then((d: DadosFormularios) => { if (ativo) setSistema({ ...d, logoUrl: safeAvatarUrl(d.logoUrl) ?? null, gerente: { ...d.gerente, assinaturaUrl: safeAvatarUrl(d.gerente.assinaturaUrl) ?? null } }) })
      .catch(e => { if (ativo) setErro(typeof e === 'string' ? e : `Erro ao carregar ${documento}`) })
    return () => { ativo = false }
  }, [projetoId, documento])

  const payload = conteudo === null ? '' : JSON.stringify(conteudo)
  const autosave = useAutosave(payload, async valor => {
    if (!await rascunho.guardar(JSON.parse(valor))) throw new Error('Não foi possível salvar o rascunho')
  }, { delay: 1200, enabled: canEdit && conteudo !== null && !versaoAberta })
  const autosaveReset = useRef<((v: string) => void) | null>(null)
  useEffect(() => { autosaveReset.current = autosave.reset }, [autosave.reset])

  // Conteúdo inicial: rascunho do usuário; sem ele, a versão vigente; sem ela, o preenchido pelo sistema.
  const vigentePayload = vigente?.payload as T | undefined
  const ajustar = useCallback((c: T, s: DadosFormularios) => normalizar ? normalizar(c, s, membros) : c, [normalizar, membros])
  useEffect(() => {
    if (!sistema || conteudo !== null) return
    let ativo = true
    const partida = vigentePayload ? ajustar(vigentePayload, sistema) : inicial(sistema, membros)
    const aplicar = (draft: T | null) => {
      if (!ativo) return
      const atual = draft ? ajustar(draft, sistema) : partida
      setConteudo(atual)
      setBase(JSON.stringify(partida))
      autosaveReset.current?.(JSON.stringify(atual))
    }
    if (canEdit) void rascunho.recuperar<T>().then(aplicar)
    else aplicar(null)
    return () => { ativo = false }
  }, [sistema, vigentePayload, canEdit, rascunho, conteudo, inicial, membros, ajustar])

  const alterar = useCallback((fn: (atual: T) => T) => setConteudo(c => (c === null ? c : fn(c))), [])

  const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `${titulo} - ${sistema?.nomeProjeto ?? 'Projeto'}`, pageStyle: printFolhasStyle() })

  async function exportarWord() {
    if (!printRef.current) return
    try { await (await import('@/lib/exports/projectDocumentsDocx')).downloadFolhaDocx(printRef.current, titulo, arquivo) }
    catch (e) {
      const imagem = e instanceof Error && e.message.startsWith('Imagem indisponível')
      toast(imagem ? 'Não foi possível gerar o Word: a logo ou a assinatura não carregou. Tente novamente.' : 'Não foi possível gerar o Word. Tente novamente.', 'error')
    }
  }

  async function salvarVersao() {
    if (!canEdit || salvando || !tituloAlteracao.trim() || conteudo === null) return
    setSalvando(true)
    try {
      const cab = (conteudo as { cabecalho?: { elaboradoPor?: string; versao?: string } }).cabecalho
      const versao = cab?.versao?.trim() || proximaVersao(vigente?.versao)
      const r = await fetchWithSession(`/api/projects/${projetoId}/revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tipo, payload: conteudo, meta: { commitTitle: tituloAlteracao.trim(), versao, elaboradoPor: cab?.elaboradoPor ?? '', aprovadoPor: '', dataAprovacao: '' } }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? `Não foi possível salvar ${documento}`)
      const data = await r.json()
      setBase(payload)
      autosave.reset(payload)
      setSalvarAberto(false)
      setTituloAlteracao('')
      window.dispatchEvent(new CustomEvent('operum:document-version', { detail: { projetoId } }))
      if (data.status === 'APPROVED') {
        window.dispatchEvent(new CustomEvent('operum:document-published', { detail: { projetoId, type: tipo } }))
        toast(`${documento}: versão salva e publicada.`)
      } else toast(`${documento}: versão enviada para aprovação. A versão vigente foi preservada.`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro de rede ao salvar', 'error')
    } finally { setSalvando(false) }
  }

  if (erro) return <div role="alert" className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>
  if (!sistema || conteudo === null) return <div role="status" className="m-6 text-sm text-slate-500">Carregando {documento}…</div>

  const aberta = versaoAberta ? versoes.find(v => v.id === versaoAberta) : null
  const exibido = aberta?.payload ? ajustar(aberta.payload as T, sistema) : conteudo
  const editavel = canEdit && !aberta && !salvando
  const status: StatusSalvamento = !canEdit || aberta ? 'leitura'
    : autosave.status === 'saving' ? 'salvando' : autosave.status === 'error' ? 'erro' : autosave.status === 'pending' ? 'pendente' : 'salvo'
  const versaoPadrao = aberta?.versao ?? vigente?.versao ?? '1.0'
  const comum = { sistema, versaoPadrao }

  return (
    <>
      <EditorDocumento
        editarProjetoHref={permissions.has('projeto:editar') ? `/projetos/${projetoId}/configuracoes` : undefined}
        documento={documento}
        editavel={editavel}
        status={status}
        versao={{
          rotulo: aberta ? `${aberta.versao ?? '—'} · ${ROTULO_STATUS[aberta.status] ?? ''}` : vigente ? `${vigente.versao} · vigente` : 'Rascunho',
          rotuloAtual: vigente ? `Rascunho sobre a ${vigente.versao} (editável)` : 'Rascunho (editável)',
          selecionada: versaoAberta,
          opcoes: versoes.filter(v => v.payload).map(v => ({ id: v.id, rotulo: `${v.versao ?? '—'} · ${v.id === vigente?.id ? 'vigente' : ROTULO_STATUS[v.status] ?? ''}`, detalhe: v.commitTitle })),
          onSelecionar: setVersaoAberta,
        }}
        onSalvar={() => setSalvarAberto(true)}
        podeSalvar={editavel}
        onHistorico={() => abrirPropostas(projetoId)}
        pendentes={{ total: pendentes, onRevisar: () => abrirPropostas(projetoId) }}
        onImprimir={() => handlePrint()}
        onPdf={() => handlePrint()}
        onWord={() => void exportarWord()}
        onAdicionarLinha={editavel && adicionar ? () => adicionar(alterar) : undefined}
        saida={{
          pendente: canEdit && !aberta && base !== null && payload !== base,
          salvar: () => setSalvarAberto(true),
          salvarDepois: () => autosave.flush(),
          descartar: async () => { autosave.reset(payload); await rascunho.descartar() },
        }}
        avisos={<>
          {autosave.status === 'error' && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Falha ao salvar o rascunho. Seu texto foi preservado.
              <GlassButton variant="default" type="button" onClick={() => void autosave.flush()} className="ml-2 underline">Tentar salvar novamente</GlassButton>
            </div>
          )}
          {aberta && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              Versão {aberta.versao} · {ROTULO_STATUS[aberta.status]} — somente leitura.
              <GlassButton variant="default" type="button" className="ml-auto font-medium text-blue-700 underline" onClick={() => setVersaoAberta(null)}>Voltar ao rascunho</GlassButton>
            </div>
          )}
        </>}
      >
        {render({ ...comum, conteudo: exibido, ...(editavel ? { alterar, edicao: { projetoId, membros } } : {}) })}
      </EditorDocumento>
      <CopiaParaImpressao>
        <div ref={printRef}>{render({ ...comum, conteudo: exibido })}</div>
      </CopiaParaImpressao>
      <Modal isOpen={salvarAberto} onClose={() => { if (!salvando) setSalvarAberto(false) }} title="Salvar alteração" maxWidth="max-w-sm">
        <form className="flex flex-col gap-4 py-2" onSubmit={e => { e.preventDefault(); void salvarVersao() }}>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Título da alteração
            <Input value={tituloAlteracao} onChange={e => setTituloAlteracao(e.target.value)} placeholder="Ex: Revisão da estratégia de condução" maxLength={300} autoFocus required />
          </label>
          <FormActions className="flex flex-wrap justify-end gap-2">
            <GlassButton variant="ghost" type="button" disabled={salvando} onClick={() => setSalvarAberto(false)}>Cancelar</GlassButton>
            <GlassButton variant="primary" type="submit" disabled={salvando || !tituloAlteracao.trim()}>{salvando ? 'Salvando…' : 'Salvar versão'}</GlassButton>
          </FormActions>
        </form>
      </Modal>
    </>
  )
}
