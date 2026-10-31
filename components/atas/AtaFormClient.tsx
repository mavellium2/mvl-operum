'use client'

import { emailValido, formatEmail } from '@/lib/contato'
import { printFolhasStyle } from '@/lib/printPageStyle'
import EditorDocumento from '@/components/documentos/editor/EditorDocumento'
import { CopiaParaImpressao } from '@/components/documentos/editor/folha'
import Drawer from '@/components/ui/Drawer'
import { useDesfazer } from '@/hooks/useDesfazer'
import { useRascunhoDocumento } from '@/hooks/useRascunhoDocumento'
import { ROTULO_STATUS, useVersoesDocumento } from '@/hooks/useVersoesDocumento'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import HistoricoDocumento from '@/components/projetos/documentacao/HistoricoDocumento'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import AtaDocument, { TITULO_ATA, type EdicaoAta } from './AtaDocument'
import { ATA_PLANO_DO_PROJETO, type AtaExportData } from '@/lib/exports/ataDocx'
import { useRouter } from 'next/navigation'
import { criarAtaAction, atualizarAtaAction, enviarAnexoAtaAction } from '@/app/actions/atas'
import { type MemberOption } from '@/components/atas/MemberSelect'
import { useMembrosEquipe } from '@/components/projetos/documentacao/MembroEquipeSelect'
import { toDateInputValue } from '@/lib/date'
import MultiCreatableSelect from '@/components/ui/MultiCreatableSelect'

interface Presente { nome: string; setorEmpresa: string; userId: string }
interface Acao { acao: string; prazo: string; responsavel: string; responsavelUserId: string }
interface Anexo { nome: string; url: string }

interface Props {
  gerenteProjeto?: string
  assinaturaGerenteUrl?: string | null
  nomeProjeto?: string
  /** Linha institucional do projeto (Editar projeto > Informações iniciais). */
  instituicaoProjeto?: string
  logoUrl?: string | null
  numero?: number
  projetoId: string
  ataId?: string
  mode: 'create' | 'edit'
  members: MemberOption[]
  /** E-mails cadastrados dos stakeholders, oferecidos em "Enviar cópias para". */
  emailsSugeridos?: { email: string; nome: string }[]
  initial?: {
    instituicao?: string | null
    local?: string | null
    data?: string
    elaboradoPor: string
    elaboradoPorUserId?: string | null
    aprovadoPor?: string | null
    aprovadoPorUserId?: string | null
    assuntosTratados?: string | null
    decisoesTomadas?: string | null
    observacoes?: string | null
    copiasPara: string[]
    presentes: Presente[]
    acoes: Acao[]
    anexos: Anexo[]
  }
}

function toDateOnly(iso: string): string { return toDateInputValue(iso) }

/** Remove vazios e repetidos (sem diferenciar maiúsculas), mantendo a ordem. */
export function semRepetir(lista: string[]): string[] {
  const vistos = new Set<string>()
  return lista.map(x => x.trim()).filter(x => {
    const k = x.toLowerCase()
    if (!x || vistos.has(k)) return false
    vistos.add(k)
    return true
  })
}


export default function AtaFormClient({ projetoId, ataId, mode, members, emailsSugeridos = [], initial, nomeProjeto = '', numero, instituicaoProjeto, logoUrl = null, gerenteProjeto, assinaturaGerenteUrl }: Props) {
  const permissions = useProjectPermissions()
  const canEdit = permissions.has('documentos:editar')
  // Pessoas da ata: membros da equipe, com "+" para criar membro (padrão dos documentos).
  const { todos: todosMembros, registrarCriado } = useMembrosEquipe(members)
  const router = useRouter()

  // Vem sempre do projeto (Localização - Departamentos - termo - Período Ano); não é digitada.
  const instituicao = instituicaoProjeto ?? initial?.instituicao ?? ''
  const [historicoAberto, setHistoricoAberto] = useState(false)
  const documentRef = useRef<HTMLDivElement>(null)
  const tituloImpressao = `${TITULO_ATA} Nº ${String(numero ?? '').padStart(2, '0') || '__'}`
  const print = useReactToPrint({ contentRef: documentRef, documentTitle: tituloImpressao, pageStyle: printFolhasStyle() })
  const [local, setLocal] = useState(initial?.local ?? '')
  const [data, setData] = useState(initial?.data ? toDateOnly(initial.data) : '')
  const [elaboradoPor, setElaboradoPor] = useState(initial?.elaboradoPor ?? '')
  const [elaboradoPorUserId, setElaboradoPorUserId] = useState(initial?.elaboradoPorUserId ?? null)
  const [aprovadoPor, setAprovadoPor] = useState(initial?.aprovadoPor ?? '')
  const [aprovadoPorUserId, setAprovadoPorUserId] = useState(initial?.aprovadoPorUserId ?? null)
  const [assuntos, setAssuntos] = useState(initial?.assuntosTratados ?? '')
  const [decisoes, setDecisoes] = useState(initial?.decisoesTomadas ?? '')
  const [observacoes, setObservacoes] = useState(initial?.observacoes ?? '')
  const [copias, setCopias] = useState<string[]>(semRepetir(initial?.copiasPara ?? []))
  const [erroCopia, setErroCopia] = useState<string | null>(null)
  const [avisoPresente, setAvisoPresente] = useState<string | null>(null)
  const [enviandoAnexo, setEnviandoAnexo] = useState(false)
  const arquivoAnexo = useRef<HTMLInputElement>(null)
  const [presentes, setPresentes] = useState<Presente[]>(
    initial?.presentes ?? [{ nome: '', setorEmpresa: '', userId: '' }],
  )
  const [acoes, setAcoes] = useState<Acao[]>(
    initial?.acoes.map(a => ({ ...a, prazo: a.prazo ? toDateOnly(a.prazo) : '' })) ?? [{ acao: '', prazo: '', responsavel: '', responsavelUserId: '' }],
  )
  const [anexos, setAnexos] = useState<Anexo[]>(initial?.anexos ?? [])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const funcaoDe = (userId: string | null | undefined) => (userId ? todosMembros.find(m => m.id === userId)?.setor ?? null : null)
  // Mesmos dados na prévia/PDF e no Word (layout do modelo "01_Form Ata de Reunião").
  const dadosDocumento: AtaExportData = {
    instituicao, numero: numero ?? 0, nomeProjeto, local, logoUrl, gerenteProjeto, assinaturaGerenteUrl,
    data: data ? new Date(`${data}T12:00:00`) : null,
    elaboradoPor, elaboradoPorFuncao: funcaoDe(elaboradoPorUserId),
    aprovadoPor, aprovadoPorFuncao: funcaoDe(aprovadoPorUserId),
    assuntosTratados: assuntos, decisoesTomadas: decisoes, observacoes,
    copiasPara: copias,
    presentes: presentes.map(p => ({ ...p, assinaturaUrl: members.find(m => m.id === p.userId)?.signatureUrl ?? null })),
    acoes: acoes.map(a => ({ ...a, prazo: a.prazo ? new Date(`${a.prazo}T12:00:00`) : null })), anexos,
  }
  async function baixarWord() {
    try { await (await import('@/lib/exports/projectDocumentsDocx')).downloadAtaDocx(dadosDocumento) }
    catch { setError('Não foi possível gerar o Word. Verifique a logo do projeto.') }
  }

  function pickElaborador(member: MemberOption | null) {
    setElaboradoPor(member?.name ?? '')
    setElaboradoPorUserId(member?.id ?? null)
  }

  function pickAprovador(member: MemberOption | null) {
    setAprovadoPor(member?.name ?? '')
    setAprovadoPorUserId(member?.id ?? null)
  }

  function pickPresente(i: number, member: MemberOption | null) {
    if (member && presentes.some((p, j) => j !== i && p.userId === member.id)) {
      setAvisoPresente(`${member.name} já está na lista de presentes.`)
      return
    }
    setAvisoPresente(null)
    const next = [...presentes]
    next[i] = {
      nome: member?.name ?? '',
      // Setor auto-preenchido pela função do membro
      setorEmpresa: member?.setor ?? '',
      userId: member?.id ?? '',
    }
    setPresentes(next)
  }

  /** Inclui de uma vez os membros da equipe que ainda não estão na lista. */
  function adicionarEquipe() {
    const naLista = new Set(presentes.map(p => p.userId).filter(Boolean))
    const novos = todosMembros.filter(m => !naLista.has(m.id)).map(m => ({ nome: m.name, setorEmpresa: m.setor ?? '', userId: m.id }))
    setAvisoPresente(null)
    setPresentes([...presentes.filter(p => p.nome.trim() || p.userId), ...novos])
  }

  async function enviarAnexo(file: File | undefined) {
    if (!file) return
    setEnviandoAnexo(true)
    setError(null)
    const fd = new FormData()
    fd.append('file', file)
    const res = await enviarAnexoAtaAction(projetoId, fd)
    setEnviandoAnexo(false)
    if (arquivoAnexo.current) arquivoAnexo.current.value = ''
    if ('error' in res) { setError(res.error); return }
    setAnexos(prev => [...prev.filter(a => a.nome.trim() || a.url.trim()), { nome: res.anexo.nome, url: res.anexo.url }])
  }

  function pickResponsavel(i: number, member: MemberOption | null) {
    const next = [...acoes]
    next[i].responsavel = member?.name ?? ''
    next[i].responsavelUserId = member?.id ?? ''
    setAcoes(next)
  }

  /** Conteúdo da ata como vai para o servidor (salvar e "salvar mais tarde"). */
  function montarPayload() {
    return {
      instituicao: instituicao || null,
      local: local || null,
      data: data ? new Date(`${data}T00:00:00Z`).toISOString() : null,
      elaboradoPor,
      elaboradoPorUserId: elaboradoPorUserId || null,
      aprovadoPor: aprovadoPor || null,
      aprovadoPorUserId: aprovadoPorUserId || null,
      assuntosTratados: assuntos || null,
      decisoesTomadas: decisoes || null,
      observacoes: observacoes || null,
      copiasPara: semRepetir(copias),
      presentes: presentes
        .map(p => ({
          nome: p.nome.trim(),
          setorEmpresa: p.setorEmpresa.trim() || null,
          userId: p.userId || null,
        }))
        .filter(p => p.nome),
      acoes: acoes
        .map(a => ({
          acao: a.acao.trim(),
          prazo: a.prazo ? new Date(`${a.prazo}T00:00:00Z`).toISOString() : null,
          responsavel: a.responsavel.trim() || null,
          responsavelUserId: a.responsavelUserId || null,
        }))
        .filter(a => a.acao),
      anexos: anexos
        .map(a => ({ nome: a.nome.trim(), url: a.url.trim() || null }))
        .filter(a => a.nome),
    }
  }

  async function salvar() {
    if (!canEdit || saving) return
    setError(null)
    setSaving(true)

    if (!data) {
      setError('Informe a data da reunião.')
      setSaving(false)
      return
    }

    const payload = { ...montarPayload(), data: new Date(`${data}T00:00:00Z`).toISOString() }

    const result =
      mode === 'create'
        ? await criarAtaAction({ ...payload, projetoId })
        : await atualizarAtaAction(ataId!, projetoId, payload)

    if ('error' in result && result.error) {
      setError(result.error)
      setSaving(false)
      return
    }
    router.push(`/projetos/${projetoId}/documentacao?doc=atas`)
    router.refresh()
  }

  // ── Desfazer / refazer: todo o conteúdo da ata ─────────────────────────────
  const estadoEdicao = useMemo(
    () => ({ local, data, elaboradoPor, elaboradoPorUserId, aprovadoPor, aprovadoPorUserId, assuntos, decisoes, observacoes, copias, presentes, acoes, anexos }),
    [local, data, elaboradoPor, elaboradoPorUserId, aprovadoPor, aprovadoPorUserId, assuntos, decisoes, observacoes, copias, presentes, acoes, anexos],
  )
  const aplicarEstado = useCallback((e: typeof estadoEdicao) => {
    setLocal(e.local); setData(e.data); setElaboradoPor(e.elaboradoPor); setElaboradoPorUserId(e.elaboradoPorUserId)
    setAprovadoPor(e.aprovadoPor); setAprovadoPorUserId(e.aprovadoPorUserId); setAssuntos(e.assuntos); setDecisoes(e.decisoes)
    setObservacoes(e.observacoes); setCopias(e.copias); setPresentes(e.presentes); setAcoes(e.acoes); setAnexos(e.anexos)
  }, [])
  const [carregamentos, setCarregamentos] = useState(0)
  const historicoEdicao = useDesfazer(estadoEdicao, aplicarEstado, { ativo: canEdit, chave: carregamentos })
  // Alterações que ainda não viraram versão: compara com o que foi aberto (ou com o rascunho restaurado).
  const estadoAtual = JSON.stringify(estadoEdicao)
  const [base, setBase] = useState(estadoAtual)
  const alterado = estadoAtual !== base
  const estadoAtualRef = useRef(estadoAtual)
  useEffect(() => { estadoAtualRef.current = estadoAtual })
  useEffect(() => { if (carregamentos > 0) setBase(estadoAtualRef.current) }, [carregamentos])

  // "Salvar mais tarde": rascunho privado da ata (só de atas já criadas).
  const rascunho = useRascunhoDocumento(projetoId, 'ATA', ataId ?? '')
  const [rascunhoRestaurado, setRascunhoRestaurado] = useState(false)
  useEffect(() => {
    if (!ataId || !canEdit) return
    let ativo = true
    void rascunho.recuperar<{
      local?: string | null; data?: string | null; elaboradoPor?: string; elaboradoPorUserId?: string | null; aprovadoPor?: string | null; aprovadoPorUserId?: string | null
      assuntosTratados?: string | null; decisoesTomadas?: string | null; observacoes?: string | null; copiasPara?: string[]
      presentes?: { nome: string; setorEmpresa?: string | null; userId?: string | null }[]
      acoes?: { acao: string; prazo?: string | null; responsavel?: string | null; responsavelUserId?: string | null }[]
      anexos?: { nome: string; url?: string | null }[]
    }>().then(salvo => {
      if (!ativo || !salvo) return
      setLocal(salvo.local ?? ''); setData(salvo.data ? toDateOnly(salvo.data) : '')
      setElaboradoPor(salvo.elaboradoPor ?? ''); setElaboradoPorUserId(salvo.elaboradoPorUserId ?? null)
      setAprovadoPor(salvo.aprovadoPor ?? ''); setAprovadoPorUserId(salvo.aprovadoPorUserId ?? null)
      setAssuntos(salvo.assuntosTratados ?? ''); setDecisoes(salvo.decisoesTomadas ?? ''); setObservacoes(salvo.observacoes ?? '')
      setCopias(semRepetir(salvo.copiasPara ?? []))
      setPresentes((salvo.presentes ?? []).map(p => ({ nome: p.nome, setorEmpresa: p.setorEmpresa ?? '', userId: p.userId ?? '' })))
      setAcoes((salvo.acoes ?? []).map(x => ({ acao: x.acao, prazo: x.prazo ? toDateOnly(x.prazo) : '', responsavel: x.responsavel ?? '', responsavelUserId: x.responsavelUserId ?? '' })))
      setAnexos((salvo.anexos ?? []).map(x => ({ nome: x.nome, url: x.url ?? '' })))
      setCarregamentos(n => n + 1)
      setRascunhoRestaurado(true)
    })
    return () => { ativo = false }
  }, [ataId, canEdit, rascunho])

  const { versoes, vigente, pendentes } = useVersoesDocumento(projetoId, 'ATA', ataId ?? '')
  const [versaoSelecionada, setVersaoSelecionada] = useState<string | null>(null)
  const versaoAberta = versaoSelecionada ? versoes.find(v => v.id === versaoSelecionada) ?? null : null
  const conteudoVersao = versaoAberta?.payload as (Partial<AtaExportData> & { data?: string | null; acoes?: { prazo?: string | null }[] }) | null | undefined
  const dadosExibidos: AtaExportData = conteudoVersao
    ? {
      ...dadosDocumento,
      ...conteudoVersao,
      data: conteudoVersao.data ? new Date(conteudoVersao.data) : null,
      presentes: (conteudoVersao.presentes ?? []) as AtaExportData['presentes'],
      acoes: ((conteudoVersao.acoes ?? []) as { acao: string; prazo?: string | null; responsavel?: string | null }[]).map(x => ({ acao: x.acao, responsavel: x.responsavel ?? null, prazo: x.prazo ? new Date(x.prazo) : null })),
      anexos: (conteudoVersao.anexos ?? []) as AtaExportData['anexos'],
      copiasPara: (conteudoVersao.copiasPara ?? []) as string[],
    }
    : dadosDocumento
  const editavel = canEdit && !versaoAberta && !saving

  const edicao: EdicaoAta = {
    projetoId,
    numeroPrevisto: mode === 'create',
    membros: todosMembros,
    onCriarMembro: registrarCriado,
    onTexto: (campo, valor) => ({ local: setLocal, assuntosTratados: setAssuntos, decisoesTomadas: setDecisoes, observacoes: setObservacoes })[campo](valor),
    dataRaw: data,
    onData: setData,
    elaboradoPorUserId,
    onElaboradoPor: pickElaborador,
    aprovadoPorUserId,
    onAprovadoPor: pickAprovador,
    presentes: presentes.map(p => ({ userId: p.userId, setorEmpresa: p.setorEmpresa })),
    onPresente: pickPresente,
    onSetor: (i, v) => setPresentes(prev => prev.map((p, j) => j === i ? { ...p, setorEmpresa: v } : p)),
    onAdicionarPresente: () => setPresentes(prev => [...prev, { nome: '', setorEmpresa: '', userId: '' }]),
    onRemoverPresente: i => { setAvisoPresente(null); setPresentes(prev => prev.filter((_, j) => j !== i)) },
    onIncluirEquipe: todosMembros.every(m => presentes.some(p => p.userId === m.id)) ? undefined : adicionarEquipe,
    avisoPresente,
    acoes: acoes.map(a => ({ acao: a.acao, prazoRaw: a.prazo, responsavelUserId: a.responsavelUserId })),
    onAcao: (i, v) => setAcoes(prev => prev.map((a, j) => j === i ? { ...a, acao: v } : a)),
    onPrazo: (i, v) => setAcoes(prev => prev.map((a, j) => j === i ? { ...a, prazo: v } : a)),
    onResponsavel: pickResponsavel,
    onAdicionarAcao: () => setAcoes(prev => [...prev, { acao: '', prazo: '', responsavel: '', responsavelUserId: '' }]),
    onRemoverAcao: i => setAcoes(prev => prev.filter((_, j) => j !== i)),
    anexos: (
      <div className="mt-1 flex flex-col gap-1 font-sans">
        {anexos.map((a, i) => (
          <div key={i} className="group/anexo flex items-center gap-2">
            <input type="text" value={a.nome} aria-label={`Nome do anexo ${i + 1}`} placeholder="Nome do documento" onChange={e => setAnexos(prev => prev.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} className="min-w-0 flex-1 border-0 border-b border-slate-300 bg-transparent px-0 py-0.5 text-[9pt] outline-none focus:border-blue-500" />
            <input type="text" value={a.url} aria-label={`Link do anexo ${i + 1}`} placeholder="URL (opcional)" onChange={e => setAnexos(prev => prev.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} className="min-w-0 flex-1 border-0 border-b border-slate-300 bg-transparent px-0 py-0.5 text-[9pt] outline-none focus:border-blue-500" />
            {a.url && /^https?:\/\//i.test(a.url) && <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Abrir</a>}
            <button type="button" aria-label={`Remover anexo ${a.nome || i + 1}`} onClick={() => setAnexos(prev => prev.filter((_, j) => j !== i))} className="rounded px-1 text-slate-400 hover:bg-red-50 hover:text-red-600">×</button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-[12px]">
          <input ref={arquivoAnexo} type="file" className="sr-only" aria-label="Arquivo do anexo" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx" onChange={e => void enviarAnexo(e.target.files?.[0])} />
          <button type="button" onClick={() => arquivoAnexo.current?.click()} disabled={enviandoAnexo} className="font-medium text-blue-600 hover:underline disabled:opacity-60">{enviandoAnexo ? 'Enviando…' : '+ Enviar arquivo'}</button>
          <button type="button" onClick={() => setAnexos(prev => [...prev, { nome: '', url: '' }])} className="font-medium text-blue-600 hover:underline">+ Adicionar link</button>
          <span className="text-slate-500">PDF, imagem, Word ou Excel até 10 MB.</span>
        </div>
      </div>
    ),
    copias: (
      <div className="mt-1 font-sans text-sm">
        <MultiCreatableSelect
          values={copias}
          onChange={v => {
            // Só os destinatários novos são conferidos; os já salvos seguem como estão.
            const novos = v.filter(c => !copias.includes(c) && c !== ATA_PLANO_DO_PROJETO)
            const invalido = novos.find(c => !emailValido(c))
            if (invalido) {
              setErroCopia(`"${invalido}" não é um e-mail válido.`)
              return
            }
            setErroCopia(null)
            setCopias(semRepetir(v.map(c => (novos.includes(c) ? formatEmail(c) : c))))
          }}
          options={[...emailsSugeridos.map(e => e.email), ATA_PLANO_DO_PROJETO]}
          placeholder="Adicionar destinatário..."
          ariaLabel="Adicionar destinatário da cópia"
        />
        {erroCopia && <p role="alert" className="mt-1 text-xs text-red-600">{erroCopia}</p>}
        {copias.length > 0 && (
          <p className="mt-1 text-xs text-slate-500" data-testid="ata-copias-resumo">
            {copias.length} destinatário{copias.length === 1 ? '' : 's'}: {copias.map(c => emailsSugeridos.find(e => e.email.toLowerCase() === c.toLowerCase())?.nome ? `${emailsSugeridos.find(e => e.email.toLowerCase() === c.toLowerCase())!.nome} <${c}>` : c).join(', ')}
          </p>
        )}
      </div>
    ),
  }

  return (
    <>
      <EditorDocumento
        editarProjetoHref={permissions.has('projeto:editar') ? `/projetos/${projetoId}/configuracoes` : undefined}
        documento="Ata de Reunião"
        editavel={editavel}
        status={!canEdit || versaoAberta ? 'leitura' : saving ? 'salvando' : alterado ? 'pendente' : 'salvo'}
        mensagemStatus={!canEdit || versaoAberta ? undefined : saving ? 'Salvando…' : alterado ? 'Alterações ainda não salvas — use “Salvar versão”' : 'Tudo salvo'}
        versao={ataId ? {
          rotulo: versaoAberta ? `${versaoAberta.versao ?? '—'} · ${ROTULO_STATUS[versaoAberta.status] ?? ''}` : vigente ? `${vigente.versao ?? '1.0'} · vigente` : 'Rascunho',
          rotuloAtual: 'Ata atual (editável)',
          selecionada: versaoSelecionada,
          opcoes: versoes.filter(v => v.payload).map(v => ({ id: v.id, rotulo: `${v.versao ?? '—'} · ${v.id === vigente?.id ? 'vigente' : ROTULO_STATUS[v.status] ?? ''}`, detalhe: v.commitTitle })),
          onSelecionar: setVersaoSelecionada,
        } : undefined}
        onSalvar={() => void salvar()}
        podeSalvar={editavel}
        onHistorico={ataId ? () => setHistoricoAberto(true) : undefined}
        pendentes={ataId ? { total: pendentes, onRevisar: () => setHistoricoAberto(true) } : undefined}
        onImprimir={() => print()}
        onPdf={() => print()}
        onWord={() => void baixarWord()}
        desfazer={historicoEdicao}
        onAdicionarLinha={() => setAcoes(prev => [...prev, { acao: '', prazo: '', responsavel: '', responsavelUserId: '' }])}
        saida={{
          pendente: canEdit && alterado && !versaoAberta && !saving,
          salvar: () => void salvar(),
          // Ata nova ainda não existe no servidor: só dá para salvar (criar) ou descartar.
          salvarDepois: ataId ? () => rascunho.guardar(montarPayload()) : undefined,
          descartar: () => (ataId ? rascunho.descartar() : undefined),
        }}
        avisos={<>
          <p className="text-xs text-slate-500">Salvar envia uma nova versão para aprovação. A ata vigente permanece disponível até a aprovação.</p>
          {rascunhoRestaurado && !versaoAberta && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Seu rascunho foi restaurado. Salve para enviá-lo à aprovação.</p>}
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {versaoAberta && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              Versão {versaoAberta.versao ?? '—'} · {ROTULO_STATUS[versaoAberta.status] ?? versaoAberta.status} — somente leitura.
              <button type="button" className="ml-auto font-medium text-blue-700 underline" onClick={() => setVersaoSelecionada(null)}>Voltar à ata atual</button>
            </div>
          )}
        </>}
      >
        <AtaDocument data={dadosExibidos} edicao={edicao} />
      </EditorDocumento>

      {/* Cópia só de leitura usada pela impressão/PDF (mesma folha, sem os controles). */}
      <CopiaParaImpressao>
        <AtaDocument ref={documentRef} data={dadosExibidos} />
      </CopiaParaImpressao>

      {ataId && (
        <Drawer isOpen={historicoAberto} onClose={() => setHistoricoAberto(false)} title="Propostas e registro da ata" width="w-[480px]">
          {historicoAberto && <HistoricoDocumento projetoId={projetoId} type="ATA" resourceId={ataId} embutido />}
        </Drawer>
      )}
    </>
  )
}
