'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useReactToPrint } from 'react-to-print'
import EditorDocumento, { type StatusSalvamento } from '@/components/documentos/editor/EditorDocumento'
import { CampoTexto, CopiaParaImpressao, Folha, useEditorFolha } from '@/components/documentos/editor/folha'
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
import { alteracoesCapa, conteudoCapa, type CampoCapa } from '@/lib/capaPadrao'
import type { CapaConteudo } from '@/lib/validation/documentRevisionSchemas'

type Capa = Required<CapaConteudo>
const VAZIA: Capa = { instituicao: '', curso: '', disciplina: '', professor: '', endereco: '', email: '', periodo: '' }

export interface CapaFolhaProps {
  capa: Capa
  nomeProjeto: string
  logoUrl?: string | null
  integrantes: string[]
  onCampo?: (campo: CampoCapa, valor: string) => void
}

/** Linha da capa: na edição, campo de texto da folha; fora dela, só o texto com o mesmo estilo. */
function Linha({ id, rotulo, ajuda, valor, onCampo, campo, estilo, max = 300, prefixo }: {
  id: string; rotulo: string; ajuda: string; valor: string; campo: CampoCapa; max?: number
  onCampo?: (campo: CampoCapa, valor: string) => void; estilo: React.CSSProperties
  /** Texto fixo antes do campo, na mesma linha e sem o estilo do valor (ex.: "E-mails:"). */
  prefixo?: string
}) {
  const { editavel } = useEditorFolha()
  if (!editavel && !valor.trim()) return null
  if (prefixo) {
    // Prefixo e valor centralizados juntos: o campo ocupa só a largura do texto.
    const { color, textDecoration, ...base } = estilo
    return (
      <div data-capa-campo={campo} style={{ ...base, width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'baseline' }}>
        <span style={{ whiteSpace: 'nowrap', paddingRight: '0.2em' }}>{prefixo}</span>
        <div style={{ color, textDecoration, width: `min(100%, ${Math.max(valor.length + 3, 16)}ch)`, minWidth: 0 }}>
          <CampoTexto id={id} rotulo={rotulo} ajuda={ajuda} pergunta={rotulo.toLowerCase()} valor={valor} linha max={max}
            alinhamento="left" preencher={false} onChange={v => onCampo?.(campo, v)} />
        </div>
      </div>
    )
  }
  return (
    <div data-capa-campo={campo} style={{ ...estilo, width: '100%' }}>
      <CampoTexto id={id} rotulo={rotulo} ajuda={ajuda} pergunta={rotulo.toLowerCase()} valor={valor} linha={campo !== 'curso'} max={max}
        alinhamento={estilo.textAlign} preencher={false} onChange={v => onCampo?.(campo, v)} />
    </div>
  )
}

/**
 * Capa do trabalho no modelo "01 - CAPA" do professor: cabeçalho institucional,
 * instituição, curso, disciplina e professor, logo do projeto ao centro,
 * integrantes à direita e endereço, e-mail e período no rodapé. Uma folha A4.
 */
export const CapaFolha = forwardRef<HTMLDivElement, CapaFolhaProps>(function CapaFolha({ capa, nomeProjeto, logoUrl, integrantes, onCampo }, ref) {
  const logo = safeAvatarUrl(logoUrl ?? null)
  const centro: React.CSSProperties = { textAlign: 'center' }
  const negrito: React.CSSProperties = { ...centro, fontWeight: 'bold' }
  const linha = (campo: CampoCapa, rotulo: string, ajuda: string, estilo: React.CSSProperties, max?: number, prefixo?: string) => (
    <Linha id={`capa-${campo}`} campo={campo} rotulo={rotulo} ajuda={ajuda} valor={capa[campo]} onCampo={onCampo} estilo={estilo} max={max} prefixo={prefixo} />
  )
  return (
    <Folha ref={ref} fixa data-testid="capa-folha" margemMm={{ top: 12, x: 25 }} numerar={false}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12pt', lineHeight: 1.25, gap: 0, alignItems: 'stretch' }}>
      {/* Logos Fatec, Centro Paula Souza e Governo do Estado, com a linha abaixo. */}
      <div style={{ textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/documentos/cabecalho-fatec-cps-sp.png" alt="Fatec Garça, Centro Paula Souza e Governo do Estado de São Paulo" style={{ height: '19mm', maxWidth: '100%', objectFit: 'contain' }} />
        <div aria-hidden="true" style={{ borderBottom: '1px solid #555', margin: '3mm 0 6mm' }} />
      </div>
      {linha('instituicao', 'Instituição', 'Nome da faculdade, como no modelo da capa.', { ...negrito, color: '#c00000', fontSize: '11pt' })}
      <div style={{ height: '8mm' }} />
      {linha('curso', 'Curso', 'Curso em letras maiúsculas (ex.: CURSO SUPERIOR DE TECNOLOGIA EM …).', { ...negrito, textTransform: 'uppercase', textDecoration: 'underline' })}
      <div style={{ height: '8mm' }} />
      {linha('disciplina', 'Disciplina', 'Disciplina em que o trabalho é entregue.', negrito)}
      {linha('professor', 'Professor', 'Título e nome do professor (ex.: Prof. Esp. …). Vem do Termo, em Principais envolvidos.', centro)}

      {/* Logo do projeto (sistema). */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60mm' }}>
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt={`Logo do projeto ${nomeProjeto}`} style={{ width: '75mm', height: '75mm', objectFit: 'contain' }} />
          : <span style={{ fontSize: '20pt', fontWeight: 'bold' }}>{nomeProjeto}</span>}
      </div>

      {/* Integrantes (sistema: membros ativos do projeto). */}
      <div data-capa-integrantes="" style={{ textAlign: 'right', fontSize: '11pt', marginBottom: '22mm' }}>
        <p style={{ margin: 0, fontWeight: 'bold' }}>Integrantes (Membro da Equipe)</p>
        {integrantes.length
          ? integrantes.map((nome, i) => <p key={`${nome}-${i}`} style={{ margin: 0 }}>{nome}</p>)
          : <p style={{ margin: 0, color: '#666' }}>Nenhum membro ativo no projeto.</p>}
      </div>

      <div style={{ fontSize: '11pt' }}>
        {linha('endereco', 'Endereço e telefone', 'Endereço e telefone da instituição.', centro)}
        {linha('email', 'E-mails', 'E-mail de contato do projeto.', { ...centro, color: '#1155cc', textDecoration: 'underline' }, undefined, 'E-mails:')}
        <div style={{ height: '6mm' }} />
        {linha('periodo', 'Ano / semestre', 'Ano e semestre do trabalho (ex.: 2026 / 2).', { ...negrito, fontSize: '12pt' }, 50)}
      </div>
    </Folha>
  )
})

interface DadosSistema { nomeProjeto: string; logoUrl: string | null; integrantes: string[]; padrao: Capa }

/** Documento "Capa" na Documentação: rascunho automático, versões e impressão como os demais. */
export default function CapaDocumento() {
  const { projetoId } = useParams<{ projetoId: string }>()
  const permissions = useProjectPermissions()
  const canEdit = permissions.has('documentos:editar')
  const { toast } = useToast()
  const printRef = useRef<HTMLDivElement>(null)
  const { versoes, vigente, pendentes } = useVersoesDocumento(projetoId, 'CAPA')
  const rascunho = useRascunhoDocumento(projetoId, 'CAPA')

  const [sistema, setSistema] = useState<DadosSistema | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [capa, setCapa] = useState<Capa>(VAZIA)
  const [base, setBase] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [versaoAberta, setVersaoAberta] = useState<string | null>(null)
  const [salvarAberto, setSalvarAberto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!projetoId) return
    let ativo = true
    fetchWithSession(`/api/projects/${projetoId}/capa`)
      .then(r => r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error)))
      .then((d: DadosSistema) => { if (ativo) setSistema(d) })
      .catch(e => { if (ativo) setErro(typeof e === 'string' ? e : 'Erro ao carregar a capa') })
    return () => { ativo = false }
  }, [projetoId])

  const payload = JSON.stringify(capa)
  const autosave = useAutosave(payload, async valor => {
    // Só o que foi trocado: os campos não editados continuam acompanhando o sistema.
    const inicial: Capa | null = base ? JSON.parse(base) : null
    const draft = inicial ? alteracoesCapa(JSON.parse(valor), inicial) : JSON.parse(valor)
    if (!await rascunho.guardar(draft)) throw new Error('Não foi possível salvar o rascunho')
  }, { delay: 1200, enabled: canEdit && pronto && !versaoAberta })
  const autosaveReset = useRef<((v: string) => void) | null>(null)
  useEffect(() => { autosaveReset.current = autosave.reset }, [autosave.reset])

  // Conteúdo inicial: valores do sistema, por cima a versão vigente e, por fim, o rascunho do usuário.
  const vigentePayload = vigente?.payload as CapaConteudo | undefined
  useEffect(() => {
    if (!sistema || pronto) return
    let ativo = true
    const inicial = conteudoCapa(sistema.padrao, vigentePayload)
    const aplicar = (draft: CapaConteudo | null) => {
      if (!ativo) return
      const atual = conteudoCapa(inicial, draft)
      setCapa(atual)
      setBase(JSON.stringify(inicial))
      autosaveReset.current?.(JSON.stringify(atual))
      setPronto(true)
    }
    if (canEdit) void rascunho.recuperar<CapaConteudo>().then(aplicar)
    else aplicar(null)
    return () => { ativo = false }
  }, [sistema, vigentePayload, canEdit, rascunho, pronto])

  const alterarCampo = useCallback((campo: CampoCapa, valor: string) => setCapa(c => ({ ...c, [campo]: valor })), [])

  const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `Capa - ${sistema?.nomeProjeto ?? 'Projeto'}`, pageStyle: printFolhasStyle() })

  async function salvarVersao() {
    if (!canEdit || salvando || !titulo.trim()) return
    setSalvando(true)
    try {
      const versao = proximaVersao(vigente?.versao)
      const r = await fetchWithSession(`/api/projects/${projetoId}/revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'CAPA', payload: capa, meta: { commitTitle: titulo.trim(), versao, elaboradoPor: '', aprovadoPor: '', dataAprovacao: '' } }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Não foi possível salvar a capa')
      const data = await r.json()
      setBase(payload)
      autosave.reset(payload)
      setSalvarAberto(false)
      setTitulo('')
      window.dispatchEvent(new CustomEvent('operum:document-version', { detail: { projetoId } }))
      if (data.status === 'APPROVED') {
        window.dispatchEvent(new CustomEvent('operum:document-published', { detail: { projetoId, type: 'CAPA' } }))
        toast('Capa salva e publicada.')
      } else toast('Versão da capa enviada para aprovação. A capa vigente foi preservada.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro de rede ao salvar', 'error')
    } finally { setSalvando(false) }
  }

  if (erro) return <div role="alert" className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>
  if (!sistema || !pronto) return <div role="status" className="m-6 text-sm text-slate-500">Carregando a capa…</div>

  const aberta = versaoAberta ? versoes.find(v => v.id === versaoAberta) : null
  const exibida = aberta ? conteudoCapa(sistema.padrao, aberta.payload as CapaConteudo) : capa
  const editavel = canEdit && !aberta && !salvando
  const status: StatusSalvamento = !canEdit || aberta ? 'leitura'
    : autosave.status === 'saving' ? 'salvando' : autosave.status === 'error' ? 'erro' : autosave.status === 'pending' ? 'pendente' : 'salvo'
  const folha = { nomeProjeto: sistema.nomeProjeto, logoUrl: sistema.logoUrl, integrantes: sistema.integrantes }

  return (
    <>
      <EditorDocumento
        editarProjetoHref={permissions.has('projeto:editar') ? `/projetos/${projetoId}/configuracoes` : undefined}
        documento="Capa"
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
        onWord={() => toast('A capa ainda não tem exportação em Word. Use o PDF.', 'warning')}
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
        <CapaFolha capa={exibida} {...folha} onCampo={editavel ? alterarCampo : undefined} />
      </EditorDocumento>
      <CopiaParaImpressao>
        <CapaFolha ref={printRef} capa={exibida} {...folha} />
      </CopiaParaImpressao>
      <Modal isOpen={salvarAberto} onClose={() => { if (!salvando) setSalvarAberto(false) }} title="Salvar alteração" maxWidth="max-w-sm">
        <form className="flex flex-col gap-4 py-2" onSubmit={e => { e.preventDefault(); void salvarVersao() }}>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Título da alteração
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Ajuste do nome do professor" maxLength={300} autoFocus required />
          </label>
          <FormActions className="flex flex-wrap justify-end gap-2">
            <GlassButton variant="ghost" type="button" disabled={salvando} onClick={() => setSalvarAberto(false)}>Cancelar</GlassButton>
            <GlassButton variant="primary" type="submit" disabled={salvando || !titulo.trim()}>{salvando ? 'Salvando…' : 'Salvar versão'}</GlassButton>
          </FormActions>
        </form>
      </Modal>
    </>
  )
}

/** 1.0 → 1.1; sem versão vigente, 1.0. */
export function proximaVersao(atual?: string | null): string {
  if (!atual) return '1.0'
  const [maior, menor] = atual.split('.').map(n => Number.parseInt(n, 10))
  return Number.isFinite(maior) ? `${maior}.${(Number.isFinite(menor) ? menor : 0) + 1}` : '1.0'
}

