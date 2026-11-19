'use client'

import { useCallback, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AnimatedTrashButton from '@/components/ui/AnimatedTrashButton'
import AnimatedEditButton from '@/components/ui/AnimatedEditButton'
import Modal from '@/components/ui/Modal'
import FormActions from '@/components/ui/FormActions'
import { Input } from '@/components/ui/Field'
import Tooltip from '@/components/ui/Tooltip'
import { useToast } from '@/components/ui/Toast'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import { fetchWithSession } from '@/lib/clientFetch'
import { erroDoArquivo, formatarTamanho, SECOES_ARQUIVOS, tipoDoArquivo, type CategoriaArquivoProjeto } from '@/lib/arquivosProjeto'
import ListaArquivos, { type CategoriaVisual, type ItemArquivo } from '@/components/arquivos/ListaArquivos'

export interface ArquivoDoProjeto {
  id: string
  nome: string
  tipo: string
  tamanho: number
  enviadoEm: string
  enviadoPor: string | null
}

interface Envio { chave: string; nome: string; progresso: number; erro?: string }

const categoriaVisual = (tipo: string): CategoriaVisual =>
  tipo.startsWith('image/') ? 'imagem' : tipo.startsWith('video/') ? 'video' : tipo === 'application/pdf' ? 'pdf' : 'apresentacao'


/** Envia o arquivo direto ao storage pela URL assinada, com progresso. */
function enviarParaStorage(url: string, arquivo: File, tipo: string, onProgresso: (p: number) => void): Promise<void> {
  return new Promise((ok, falha) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', tipo)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgresso(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? ok() : falha(new Error(`Falha no envio (${xhr.status})`)))
    xhr.onerror = () => falha(new Error('Falha de rede no envio'))
    xhr.send(arquivo)
  })
}

/**
 * Seção de arquivos do projeto ("Fotos e Vídeos" ou "Apresentação e Vídeo"),
 * na mesma base da lista do menu Arquivos.
 */
export default function ArquivosProjetoClient({ projetoId, categoria, iniciais }: {
  projetoId: string
  categoria: CategoriaArquivoProjeto
  iniciais: ArquivoDoProjeto[]
}) {
  const secao = SECOES_ARQUIVOS[categoria]
  const permissions = useProjectPermissions()
  const podeEnviar = permissions.has('documentos:editar')
  const podeExcluir = permissions.has('documentos:excluir')
  const { toast } = useToast()
  const seletor = useRef<HTMLInputElement>(null)
  const [arquivos, setArquivos] = useState(iniciais)
  const [envios, setEnvios] = useState<Envio[]>([])
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [excluir, setExcluir] = useState<ArquivoDoProjeto[]>([])
  const [renomear, setRenomear] = useState<ArquivoDoProjeto | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNome, setSalvandoNome] = useState(false)
  const [erroNome, setErroNome] = useState('')

  const recarregar = useCallback(async () => {
    const r = await fetchWithSession(`/api/projects/${projetoId}/arquivos?categoria=${categoria}`)
    if (!r.ok) return
    const lista = await r.json() as ArquivoDoProjeto[]
    setArquivos(lista)
    // Tira da seleção o que saiu da lista.
    setSelecionados(sel => sel.filter(id => lista.some(a => a.id === id)))
  }, [projetoId, categoria])

  /** Envia um arquivo; devolve se ele entrou na lista. */
  async function enviar(arquivo: File, chaveLocal: string): Promise<boolean> {
    const atualizar = (parcial: Partial<Envio>) => setEnvios(lista => lista.map(e => (e.chave === chaveLocal ? { ...e, ...parcial } : e)))
    const tipo = tipoDoArquivo(arquivo.name, arquivo.type)
    const problema = erroDoArquivo(categoria, tipo, arquivo.size)
    if (problema) { atualizar({ erro: problema }); return false }
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/arquivos/envio`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria, nome: arquivo.name, tipo, tamanho: arquivo.size }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Não foi possível iniciar o envio')
      const { url, chave } = await r.json() as { url: string; chave: string }
      await enviarParaStorage(url, arquivo, tipo, p => atualizar({ progresso: p }))
      const reg = await fetchWithSession(`/api/projects/${projetoId}/arquivos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria, chave, nome: arquivo.name }),
      })
      if (!reg.ok) throw new Error((await reg.json().catch(() => ({})))?.error ?? 'Não foi possível registrar o arquivo')
      setEnvios(lista => lista.filter(e => e.chave !== chaveLocal))
      return true
    } catch (e) {
      atualizar({ erro: e instanceof Error ? e.message : 'Falha no envio' })
      return false
    }
  }

  async function escolher(lista: FileList | null) {
    if (!lista?.length) return
    const novos = [...lista].map((arquivo, i) => ({ arquivo, chave: `${Date.now()}-${i}-${arquivo.name}` }))
    setEnvios(e => [...e, ...novos.map(n => ({ chave: n.chave, nome: n.arquivo.name, progresso: 0 }))])
    const enviados = await Promise.all(novos.map(n => enviar(n.arquivo, n.chave)))
    if (enviados.some(Boolean)) await recarregar()
  }

  async function confirmarExclusao(lista: ArquivoDoProjeto[]) {
    const resultados = await Promise.all(lista.map(a =>
      fetchWithSession(`/api/projects/${projetoId}/arquivos/${a.id}`, { method: 'DELETE' }).then(r => r.ok, () => false)))
    const ok = resultados.filter(Boolean).length
    const falhas = lista.length - ok
    if (ok) toast(lista.length === 1 ? `"${lista[0].nome}" excluído.` : `${ok} arquivo${ok !== 1 ? 's' : ''} excluído${ok !== 1 ? 's' : ''}.`, 'success')
    if (falhas) toast(`Não foi possível excluir ${falhas} arquivo${falhas !== 1 ? 's' : ''}.`, 'error')
    await recarregar()
  }

  /** Baixa cada arquivo pela rota que confere a sessão; links com `download` não trocam de página nem se cancelam. */
  function baixar(lista: ArquivoDoProjeto[]) {
    lista.forEach((a, i) => setTimeout(() => {
      const link = document.createElement('a')
      link.href = `/api/projects/${projetoId}/arquivos/${a.id}?baixar=1`
      link.download = a.nome
      document.body.appendChild(link)
      link.click()
      link.remove()
    }, i * 250))
  }

  function abrirRenomear(arquivo: ArquivoDoProjeto) {
    setRenomear(arquivo); setNovoNome(arquivo.nome); setErroNome('')
  }

  async function salvarNome() {
    if (!renomear || salvandoNome) return
    setSalvandoNome(true); setErroNome('')
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/arquivos/${renomear.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: novoNome }),
      })
      if (!r.ok) { setErroNome((await r.json().catch(() => ({})))?.error ?? 'Não foi possível renomear o arquivo.'); return }
      const { nome } = await r.json() as { nome: string }
      setArquivos(lista => lista.map(a => (a.id === renomear.id ? { ...a, nome } : a)))
      setRenomear(null)
      toast('Arquivo renomeado.', 'success')
    } catch {
      setErroNome('Não foi possível renomear o arquivo.')
    } finally { setSalvandoNome(false) }
  }

  const enviando = envios.some(e => !e.erro)
  const itens: ItemArquivo[] = arquivos.map(a => {
    const href = `/api/projects/${projetoId}/arquivos/${a.id}`
    return {
      id: a.id,
      nome: a.nome,
      subtitulo: a.tipo,
      categoria: categoriaVisual(a.tipo),
      tamanho: formatarTamanho(a.tamanho),
      enviadoPor: a.enviadoPor,
      data: a.enviadoEm,
      previa: href,
      abrir: href,
    }
  })
  const doId = (ids: string[]) => arquivos.filter(a => ids.includes(a.id))
  const acoesSelecao = (ids: string[]) => {
    const nada = ids.length === 0
    return <>
      <Tooltip label="Baixar">
        <GlassButton variant="icon" aria-label={nada ? 'Baixar' : `Baixar ${ids.length} selecionado${ids.length !== 1 ? 's' : ''}`} disabled={nada} onClick={() => baixar(doId(ids))}>
          <Download className="h-4 w-4" aria-hidden="true" />
        </GlassButton>
      </Tooltip>
      {podeEnviar && <Tooltip label={ids.length > 1 ? 'Renomear (escolha um arquivo)' : 'Renomear'}>
        <AnimatedEditButton label="Renomear" disabled={ids.length !== 1} onClick={() => { const [a] = doId(ids); if (a) abrirRenomear(a) }} />
      </Tooltip>}
      {podeExcluir && <Tooltip label="Excluir">
        <AnimatedTrashButton effect="button" label={nada ? 'Excluir' : `Excluir ${ids.length} selecionado${ids.length !== 1 ? 's' : ''}`} disabled={nada} onDelete={() => setExcluir(doId(ids))} />
      </Tooltip>}
    </>
  }

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{secao.titulo}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{secao.descricao}</p>
          </div>
          {podeEnviar && <>
            {/* Seletor nativo de arquivo (controle permitido fora da base dos campos de texto). */}
            <input ref={seletor} type="file" multiple accept={secao.aceita} className="hidden" aria-label={`Escolher arquivos para ${secao.titulo}`}
              onChange={e => { void escolher(e.target.files); e.target.value = '' }} />
            <GlassButton variant="primary" type="button" onClick={() => seletor.current?.click()} disabled={enviando} aria-busy={enviando} className="inline-flex h-9 items-center gap-1.5 px-4 text-sm">
              <Upload className="h-4 w-4" />{enviando ? 'Enviando…' : 'Enviar arquivos'}
            </GlassButton>
          </>}
        </header>

        {envios.length > 0 && (
          <ul className="mb-6 space-y-2" aria-label="Envios em andamento">
            {envios.map(e => (
              <li key={e.chave} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-slate-800">{e.nome}</span>
                  {e.erro
                    ? <GlassButton variant="custom" type="button" onClick={() => setEnvios(l => l.filter(x => x.chave !== e.chave))} className="text-xs text-slate-500 underline">Dispensar</GlassButton>
                    : <span className="text-xs text-slate-500">{e.progresso}%</span>}
                </div>
                {e.erro
                  ? <p role="alert" className="mt-1 text-xs text-red-600">{e.erro}</p>
                  : <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={e.progresso} aria-valuemin={0} aria-valuemax={100} aria-label={`Envio de ${e.nome}`}><div className="h-full bg-blue-500 transition-[width]" style={{ width: `${e.progresso}%` }} /></div>}
              </li>
            ))}
          </ul>
        )}

        <ListaArquivos
          itens={itens}
          tipos={categoria === 'FOTOS_VIDEOS' ? ['imagem', 'video'] : ['apresentacao', 'pdf', 'video']}
          vazio={secao.vazio}
          visualizacao={categoria === 'FOTOS_VIDEOS' ? `projeto-${categoria}` : undefined}
          selecao={{ selecionados, onChange: setSelecionados, acoes: acoesSelecao }}
        />
      </div>

      <Modal isOpen={!!renomear} onClose={() => { if (!salvandoNome) setRenomear(null) }} title="Renomear arquivo" maxWidth="max-w-md">
        <form onSubmit={e => { e.preventDefault(); void salvarNome() }}>
          <label htmlFor="renomear-arquivo" className="mb-2 block text-sm text-slate-600">Nome</label>
          <Input id="renomear-arquivo" value={novoNome} onChange={e => setNovoNome(e.target.value)} maxLength={255} required autoFocus disabled={salvandoNome}
            aria-invalid={!!erroNome || undefined} aria-describedby={erroNome ? 'renomear-arquivo-erro' : undefined}
            // Seleciona só o nome, sem a extensão, como no Finder.
            onFocus={e => { const ponto = e.currentTarget.value.lastIndexOf('.'); e.currentTarget.setSelectionRange(0, ponto > 0 ? ponto : e.currentTarget.value.length) }}
            className="w-full rounded-xl border px-3 py-2 text-sm" />
          {erroNome && <p id="renomear-arquivo-erro" role="alert" className="mt-2 text-sm text-red-600">{erroNome}</p>}
          <FormActions surface="none" className="mt-4 flex justify-end gap-2">
            <GlassButton type="button" onClick={() => setRenomear(null)} disabled={salvandoNome}>Cancelar</GlassButton>
            <GlassButton variant="primary" type="submit" disabled={salvandoNome || !novoNome.trim()} aria-busy={salvandoNome}>{salvandoNome ? 'Salvando…' : 'Salvar'}</GlassButton>
          </FormActions>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={excluir.length > 0}
        onClose={() => setExcluir([])}
        onConfirm={() => { if (excluir.length) void confirmarExclusao(excluir) }}
        title={excluir.length === 1 ? `Excluir "${excluir[0].nome}"?` : `Excluir ${excluir.length} arquivos?`}
        message={excluir.length === 1
          ? 'O arquivo sai do projeto e do armazenamento. A exclusão fica registrada na auditoria.'
          : 'Os arquivos saem do projeto e do armazenamento. As exclusões ficam registradas na auditoria.'}
        confirmLabel={excluir.length === 1 ? 'Excluir arquivo' : 'Excluir arquivos'}
      />
    </div>
  )
}
