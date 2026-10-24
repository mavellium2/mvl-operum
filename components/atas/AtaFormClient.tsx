'use client'

import { emailValido, formatEmail } from '@/lib/contato'
import { printPageStyle } from '@/lib/printPageStyle'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import HistoricoDocumento from '@/components/projetos/documentacao/HistoricoDocumento'
import { useState, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import AtaDocument from './AtaDocument'
import { ATA_PLANO_DO_PROJETO, type AtaExportData } from '@/lib/exports/ataDocx'
import { useRouter } from 'next/navigation'
import { criarAtaAction, atualizarAtaAction, enviarAnexoAtaAction } from '@/app/actions/atas'
import { type MemberOption } from '@/components/atas/MemberSelect'
import MembroEquipeSelect, { useMembrosEquipe } from '@/components/projetos/documentacao/MembroEquipeSelect'
import DateInput from '@/components/ui/DateInput'
import { toDateInputValue } from '@/lib/date'
import PaginasDaPrevia from '@/components/projetos/documentacao/PaginasDaPrevia'
import MultiCreatableSelect from '@/components/ui/MultiCreatableSelect'

interface Presente { nome: string; setorEmpresa: string; userId: string }
interface Acao { acao: string; prazo: string; responsavel: string; responsavelUserId: string }
interface Anexo { nome: string; url: string }

interface Props {
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

const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function AtaFormClient({ projetoId, ataId, mode, members, emailsSugeridos = [], initial, nomeProjeto = '', numero, instituicaoProjeto, logoUrl = null }: Props) {
  const permissions = useProjectPermissions()
  const canEdit = permissions.has('documentos:editar')
  // Pessoas da ata: membros da equipe, com "+" para criar membro (padrão dos documentos).
  const { todos: todosMembros, registrarCriado } = useMembrosEquipe(members)
  const router = useRouter()

  // Vem sempre do projeto (Localização - Departamentos - termo - Período Ano); não é digitada.
  const instituicao = instituicaoProjeto ?? initial?.instituicao ?? ''
  const [preview, setPreview] = useState(false)
  const documentRef = useRef<HTMLDivElement>(null)
  const print = useReactToPrint({ contentRef: documentRef, documentTitle: 'Ata de Reunião', pageStyle: printPageStyle() })
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
    instituicao, numero: numero ?? 0, nomeProjeto, local, logoUrl,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) return
    setError(null)
    setSaving(true)

    if (!data) {
      setError('Informe a data da reunião.')
      setSaving(false)
      return
    }

    const payload = {
      instituicao: instituicao || null,
      local: local || null,
      data: new Date(`${data}T00:00:00Z`).toISOString(),
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

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-4 rounded bg-blue-50 p-3 text-sm text-blue-800">Salvar envia uma nova versão para aprovação. A ata vigente permanece disponível até a aprovação.</p>
      {ataId && <HistoricoDocumento projetoId={projetoId} type="ATA" resourceId={ataId} />}
      <div className="mb-4 flex gap-3">
        <button type="button" className="rounded border px-3 py-2" onClick={() => setPreview(value => !value)}>{preview ? 'Voltar ao formulário' : 'Gerar documento'}</button>
        {preview && <button type="button" className="rounded bg-blue-600 px-3 py-2 text-white" onClick={() => print()}>Baixar PDF</button>}
        {preview && <button type="button" className="rounded bg-gray-800 px-3 py-2 text-white" onClick={baixarWord}>Baixar Word</button>}
      </div>
      {preview && <><p className="mb-2 text-sm">Prévia do rascunho — ainda não publicada</p><div role="region" aria-label="Prévia da ata" tabIndex={0} className="max-w-full overflow-x-auto mb-4"><PaginasDaPrevia><AtaDocument ref={documentRef} data={dadosDocumento} /></PaginasDaPrevia></div></>}
    <fieldset hidden={preview} disabled={!canEdit} className="space-y-6 min-w-0">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="block text-sm font-medium">Instituição / curso / termo / semestre
        <input className={`${inputCls} bg-gray-100 cursor-not-allowed`} value={instituicao} readOnly title="Preenchido com os dados do projeto (Editar projeto > Informações iniciais)" />
        <span className="mt-1 block text-xs text-gray-500">Vem de Editar projeto &gt; Informações iniciais (localização, departamentos, período e ano).</span>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data da reunião *</label>
          <DateInput required value={data} onChange={setData} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
          <input type="text" value={local} onChange={e => setLocal(e.target.value)} className={inputCls} placeholder="Sala / online" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Elaborado por *</label>
          <MembroEquipeSelect membros={todosMembros} projetoId={projetoId} onCriarMembro={registrarCriado} value={elaboradoPorUserId} onChange={pickElaborador} placeholder="Selecionar membro" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Aprovado por</label>
          <MembroEquipeSelect membros={todosMembros} projetoId={projetoId} onCriarMembro={registrarCriado} value={aprovadoPorUserId} onChange={pickAprovador} placeholder="Selecionar membro" />
        </div>
      </div>

      <section aria-labelledby="ata-presentes">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 id="ata-presentes" className="text-sm font-medium text-gray-700">
            I. Relação dos presentes <span className="font-normal text-gray-500">({presentes.filter(p => p.nome.trim()).length} incluído{presentes.filter(p => p.nome.trim()).length === 1 ? '' : 's'})</span>
          </h2>
          <button
            type="button"
            onClick={adicionarEquipe}
            disabled={todosMembros.every(m => presentes.some(p => p.userId === m.id))}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Incluir toda a equipe
          </button>
        </div>
        {presentes.length === 0 && (
          <p className="mb-2 rounded-lg border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500">Nenhum presente incluído ainda.</p>
        )}
        <ol className="space-y-2 mb-2">
          {presentes.map((p, i) => (
            <li key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
              <span className="hidden sm:block w-6 shrink-0 text-right text-xs font-semibold text-gray-400" aria-hidden="true">{i + 1}.</span>
              {/* Nome com 2/3 da linha: o setor (w-full) espremia o seletor até ficar ilegível. */}
              <div className="min-w-0 sm:flex-[2]">
                <MembroEquipeSelect
                  membros={todosMembros.filter(m => m.id === p.userId || !presentes.some(x => x.userId === m.id))}
                  projetoId={projetoId}
                  onCriarMembro={registrarCriado}
                  value={p.userId}
                  onChange={m => pickPresente(i, m)}
                  placeholder="Selecionar presente"
                />
              </div>
              <div className="min-w-0 sm:flex-1">
                <input
                  type="text"
                  value={p.setorEmpresa}
                  onChange={e => {
                    const next = [...presentes]; next[i] = { ...next[i], setorEmpresa: e.target.value }; setPresentes(next)
                  }}
                  placeholder="Setor (auto pela função)"
                  aria-label={`Setor/Empresa de ${p.nome || `presente ${i + 1}`}`}
                  className={inputCls}
                />
              </div>
              <button
                type="button"
                onClick={() => { setAvisoPresente(null); setPresentes(presentes.filter((_, j) => j !== i)) }}
                aria-label={`Remover ${p.nome || `presente ${i + 1}`}`}
                title="Remover da lista"
                className="self-end sm:self-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                <span className="sm:hidden">Remover</span>
              </button>
            </li>
          ))}
        </ol>
        {avisoPresente && <p role="alert" className="mb-2 text-sm text-amber-700">{avisoPresente}</p>}
        <button
          type="button"
          onClick={() => setPresentes([...presentes, { nome: '', setorEmpresa: '', userId: '' }])}
          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
        >
          + Adicionar presente
        </button>
      </section>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">II. Assuntos tratados</label>
        <p className="mb-2 text-xs text-gray-500">Registre os assuntos da reunião; as 11 etapas do documento de ajustes são uma referência de pauta.</p>
        <textarea rows={8} value={assuntos} onChange={e => setAssuntos(e.target.value)} className={inputCls} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">III. Decisões tomadas</label>
        <textarea rows={3} value={decisoes} onChange={e => setDecisoes(e.target.value)} className={inputCls} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">IV. Ações a serem empreendidas</label>
        {acoes.map((a, i) => (
          <div key={i} className="flex flex-col gap-2 mb-3 p-3 rounded-lg border border-gray-200">
            <textarea
              rows={2}
              value={a.acao}
              onChange={e => {
                const next = [...acoes]; next[i].acao = e.target.value; setAcoes(next)
              }}
              placeholder="Ação"
              className={inputCls}
            />
            <div className="flex flex-col sm:flex-row gap-2 items-stretch">
              <div className="sm:w-44">
                <DateInput
                  value={a.prazo}
                  onChange={v => {
                    const next = [...acoes]; next[i].prazo = v; setAcoes(next)
                  }}
                  className={inputCls}
                />
              </div>
              <div className="flex-1">
                <MembroEquipeSelect
                  membros={todosMembros}
                  projetoId={projetoId}
                  onCriarMembro={registrarCriado}
                  value={a.responsavelUserId}
                  onChange={m => pickResponsavel(i, m)}
                  placeholder="Responsável (membro)"
                />
              </div>
              <button
                type="button"
                onClick={() => setAcoes(acoes.filter((_, j) => j !== i))}
                className="px-2 text-red-500 hover:bg-red-50 rounded-lg"
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAcoes([...acoes, { acao: '', prazo: '', responsavel: '', responsavelUserId: '' }])}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          + Adicionar ação
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Documentos anexos</label>
        {anexos.map((a, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              type="text"
              value={a.nome}
              onChange={e => {
                const next = [...anexos]; next[i].nome = e.target.value; setAnexos(next)
              }}
              placeholder="Nome do documento"
              className={inputCls}
            />
            <input
              type="text"
              value={a.url}
              onChange={e => {
                const next = [...anexos]; next[i].url = e.target.value; setAnexos(next)
              }}
              placeholder="URL (opcional)"
              className={inputCls}
            />
            {a.url && /^https?:\/\//i.test(a.url) && (
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="self-center whitespace-nowrap text-sm text-blue-600 hover:underline">Abrir</a>
            )}
            <button
              type="button"
              onClick={() => setAnexos(anexos.filter((_, j) => j !== i))}
              className="px-2 text-red-500 hover:bg-red-50 rounded-lg"
            >
              ×
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={arquivoAnexo}
            type="file"
            className="sr-only"
            aria-label="Arquivo do anexo"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx"
            onChange={e => void enviarAnexo(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => arquivoAnexo.current?.click()}
            disabled={enviandoAnexo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            {enviandoAnexo ? 'Enviando...' : 'Enviar arquivo'}
          </button>
          <button
            type="button"
            onClick={() => setAnexos([...anexos, { nome: '', url: '' }])}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Adicionar link
          </button>
          <span className="text-xs text-gray-500">PDF, imagem, Word ou Excel até 10 MB.</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Enviar cópias para</label>
        <p className="mb-2 text-xs text-gray-500">Escolha os e-mails cadastrados dos stakeholders ou digite outro e tecle Enter. Revise a lista antes de salvar.</p>
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
          <p className="mt-1 text-xs text-gray-500" data-testid="ata-copias-resumo">
            {copias.length} destinatário{copias.length === 1 ? '' : 's'}: {copias.map(c => emailsSugeridos.find(e => e.email.toLowerCase() === c.toLowerCase())?.nome ? `${emailsSugeridos.find(e => e.email.toLowerCase() === c.toLowerCase())!.nome} <${c}>` : c).join(', ')}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
        <textarea rows={3} value={observacoes} onChange={e => setObservacoes(e.target.value)} className={inputCls} />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
        >
          {saving ? 'Salvando...' : mode === 'create' ? 'Criar Ata' : 'Salvar alterações'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/projetos/${projetoId}/documentacao?doc=atas`)}
          className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg"
        >
          Cancelar
        </button>
      </div>
    </fieldset>
    </form>
  )
}
