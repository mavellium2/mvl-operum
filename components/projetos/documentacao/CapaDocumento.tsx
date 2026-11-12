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
import { CAPA, ESTILO_CAPA, PREFIXO_EMAIL, SEM_INTEGRANTES, TITULO_INTEGRANTES, medirLinhasCapa } from '@/lib/capaLayout'
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
  // Estilos e medidas vêm de lib/capaLayout, os mesmos usados no Word.
  const estilo = (campo: CampoCapa): React.CSSProperties => {
    const e = ESTILO_CAPA[campo]
    return {
      textAlign: e.alinhamento, fontSize: `${e.pt}pt`,
      ...(e.negrito ? { fontWeight: 'bold' } : {}), ...(e.cor ? { color: e.cor } : {}),
      ...(e.maiusculas ? { textTransform: 'uppercase' } : {}), ...(e.sublinhado ? { textDecoration: 'underline' } : {}),
    }
  }
  const linha = (campo: CampoCapa, rotulo: string, ajuda: string, max?: number, prefixo?: string) => (
    <Linha id={`capa-${campo}`} campo={campo} rotulo={rotulo} ajuda={ajuda} valor={capa[campo]} onCampo={onCampo} estilo={estilo(campo)} max={max} prefixo={prefixo} />
  )
  const mm = (n: number) => `${n}mm`
  return (
    <Folha ref={ref} fixa data-testid="capa-folha" margemMm={{ top: CAPA.margem.topo, x: CAPA.margem.x }} numerar={false}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12pt', lineHeight: CAPA.alturaLinha, gap: 0, alignItems: 'stretch' }}>
      {/* Logos Fatec, Centro Paula Souza e Governo do Estado, com a linha abaixo. */}
      <div style={{ textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={CAPA.cabecalho.src} alt="Fatec Garça, Centro Paula Souza e Governo do Estado de São Paulo" style={{ height: mm(CAPA.cabecalho.altura), maxWidth: '100%', objectFit: 'contain' }} />
        <div aria-hidden="true" style={{ borderBottom: `1px solid ${CAPA.linha.cor}`, margin: `${mm(CAPA.linha.antes)} 0 ${mm(CAPA.linha.depois)}` }} />
      </div>
      {linha('instituicao', 'Instituição', 'Nome da faculdade, como no modelo da capa.')}
      <div style={{ height: mm(CAPA.espacoBloco) }} />
      {linha('curso', 'Curso', 'Curso em letras maiúsculas (ex.: CURSO SUPERIOR DE TECNOLOGIA EM …).')}
      <div style={{ height: mm(CAPA.espacoBloco) }} />
      {linha('disciplina', 'Disciplina', 'Disciplina em que o trabalho é entregue.')}
      {linha('professor', 'Professor', 'Título e nome do professor (ex.: Prof. Esp. …). Vem do Termo, em Principais envolvidos.')}

      {/* Logo do projeto (sistema). */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: mm(CAPA.logo.regiaoMin) }}>
        {logo
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logo} alt={`Logo do projeto ${nomeProjeto}`} style={{ width: mm(CAPA.logo.caixa), height: mm(CAPA.logo.caixa), objectFit: 'contain' }} />
          : <span style={{ fontSize: `${CAPA.logo.nomeFonte}pt`, fontWeight: 'bold' }}>{nomeProjeto}</span>}
      </div>

      {/* Integrantes (sistema: membros ativos do projeto). */}
      <div data-capa-integrantes="" style={{ textAlign: 'right', fontSize: '11pt', marginBottom: mm(CAPA.espacoIntegrantes) }}>
        <p style={{ margin: 0, fontWeight: 'bold' }}>{TITULO_INTEGRANTES}</p>
        {integrantes.length
          ? integrantes.map((nome, i) => <p key={`${nome}-${i}`} style={{ margin: 0 }}>{nome}</p>)
          : <p style={{ margin: 0, color: CAPA.cor.vazio }}>{SEM_INTEGRANTES}</p>}
      </div>

      <div style={{ fontSize: '11pt' }}>
        {linha('endereco', 'Endereço e telefone', 'Endereço e telefone da instituição.')}
        {linha('email', 'E-mails', 'E-mail de contato do projeto.', undefined, PREFIXO_EMAIL)}
        <div style={{ height: mm(CAPA.espacoPeriodo) }} />
        {linha('periodo', 'Ano / semestre', 'Ano e semestre do trabalho (ex.: 2026 / 2).', 50)}
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
  const [exportando, setExportando] = useState(false)

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

  async function exportarWord() {
    if (!sistema || exportando) return
    setExportando(true)
    try {
      const { downloadCapaDocx } = await import('@/lib/exports/projectDocumentsDocx')
      // Linhas medidas na própria folha: o Word quebra e posiciona igual à tela.
      const linhas = printRef.current ? medirLinhasCapa(printRef.current) : undefined
      await downloadCapaDocx({ capa: exibida, nomeProjeto: sistema.nomeProjeto, integrantes: sistema.integrantes, logoUrl: sistema.logoUrl, linhas })
    } catch {
      toast('Não foi possível gerar o Word. Verifique a logo do projeto e tente novamente.', 'error')
    } finally { setExportando(false) }
  }

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
        onWord={() => void exportarWord()}
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

