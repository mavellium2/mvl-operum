'use client'

import { useCallback, useRef, useState } from 'react'
import { Download, Star, Upload } from 'lucide-react'
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
  /** Estrela pessoal de quem está vendo. */
  favorito?: boolean
}

interface Envio { chave: string; nome: string; progresso: number; erro?: string }

const categoriaVisual = (tipo: string): CategoriaVisual =>
  tipo.startsWith('image/') ? 'imagem' : tipo.startsWith('video/') ? 'video' : tipo === 'application/pdf' ? 'pdf' : 'apresentacao'


/** Tipo legível para a coluna "Tipo": "Vídeo MP4", "Imagem PNG", "PDF"… */
function tipoLegivel(mime: string): string {
  const [grupo, sub = ''] = mime.split('/')
  const formato = sub.replace(/^x-/, '').replace(/^vnd\.openxmlformats-officedocument\.presentationml\.presentation$/, 'pptx').replace(/^vnd\.ms-powerpoint$/, 'ppt').replace(/^quicktime$/, 'mov').toUpperCase()
  if (grupo === 'image') return `Imagem ${formato}`
  if (grupo === 'video') return `Vídeo ${formato}`
  if (mime === 'application/pdf') return 'PDF'
  if (formato === 'PPTX' || formato === 'PPT') return `Apresentação ${formato}`
  return formato || mime
}

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

  /** Estrela pessoal: muda na hora e desfaz se o servidor recusar. */
  async function favoritar(lista: ArquivoDoProjeto[], favorito: boolean) {
    const ids = new Set(lista.map(a => a.id))
    const marcar = (valor: (a: ArquivoDoProjeto) => boolean) => setArquivos(atual => atual.map(a => (ids.has(a.id) ? { ...a, favorito: valor(a) } : a)))
    const antes = new Map(lista.map(a => [a.id, !!a.favorito]))
    marcar(() => favorito)
    const resultados = await Promise.all(lista.map(a =>
      fetchWithSession(`/api/projects/${projetoId}/arquivos/${a.id}/favorito`, { method: favorito ? 'PUT' : 'DELETE' }).then(r => ({ id: a.id, ok: r.ok }), () => ({ id: a.id, ok: false }))))
    const falhas = new Set(resultados.filter(r => !r.ok).map(r => r.id))
    if (falhas.size) {
      setArquivos(atual => atual.map(a => (falhas.has(a.id) ? { ...a, favorito: antes.get(a.id) } : a)))
      toast(favorito ? 'Não foi possível adicionar a estrela.' : 'Não foi possível remover a estrela.', 'error')
    }
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
      subtitulo: tipoLegivel(a.tipo),
      categoria: categoriaVisual(a.tipo),
      tamanho: formatarTamanho(a.tamanho),
      tamanhoBytes: a.tamanho,
      enviadoPor: a.enviadoPor,
      data: a.enviadoEm,
      previa: href,
      abrir: href,
      favorito: a.favorito,
      // Ações da linha (aparecem no hover/foco), como no Drive.
      acoes: <>
        <Tooltip label="Baixar">
          <GlassButton variant="icon" aria-label={`Baixar ${a.nome}`} onClick={() => baixar([a])}><Download className="h-4 w-4" aria-hidden="true" /></GlassButton>
        </Tooltip>
        {podeEnviar && <Tooltip label="Renomear"><AnimatedEditButton label={`Renomear ${a.nome}`} onClick={() => abrirRenomear(a)} /></Tooltip>}
        <Tooltip label={a.favorito ? 'Remover estrela' : 'Adicionar estrela'}>
          <GlassButton variant="icon" aria-label={`${a.favorito ? 'Remover estrela de' : 'Adicionar estrela a'} ${a.nome}`} aria-pressed={!!a.favorito} onClick={() => void favoritar([a], !a.favorito)}>
            <Star className={`h-4 w-4 ${a.favorito ? 'fill-amber-400 text-amber-500' : ''}`} aria-hidden="true" />
          </GlassButton>
        </Tooltip>
        {podeExcluir && <Tooltip label="Excluir"><AnimatedTrashButton effect="button" label={`Excluir ${a.nome}`} onDelete={() => setExcluir([a])} /></Tooltip>}
      </>,
    }
  })
  const doId = (ids: string[]) => arquivos.filter(a => ids.includes(a.id))
  const acoesSelecao = (ids: string[]) => {
    const lista = doId(ids)
    const plural = ids.length !== 1 ? `${ids.length} selecionados` : lista[0]?.nome ?? ''
    const todosComEstrela = lista.length > 0 && lista.every(a => a.favorito)
    return <>
      <Tooltip label="Baixar">
        <GlassButton variant="icon" aria-label={`Baixar ${plural}`} onClick={() => baixar(lista)}><Download className="h-4 w-4" aria-hidden="true" /></GlassButton>
      </Tooltip>
      {podeEnviar && <Tooltip label={ids.length > 1 ? 'Renomear (escolha um arquivo)' : 'Renomear'}>
        <AnimatedEditButton label="Renomear" disabled={ids.length !== 1} onClick={() => { if (lista[0]) abrirRenomear(lista[0]) }} />
      </Tooltip>}
      <Tooltip label={todosComEstrela ? 'Remover estrela' : 'Adicionar estrela'}>
        <GlassButton variant="icon" aria-label={todosComEstrela ? 'Remover estrela' : 'Adicionar estrela'} aria-pressed={todosComEstrela} onClick={() => void favoritar(lista, !todosComEstrela)}>
          <Star className={`h-4 w-4 ${todosComEstrela ? 'fill-amber-400 text-amber-500' : ''}`} aria-hidden="true" />
        </GlassButton>
      </Tooltip>
      {podeExcluir && <Tooltip label="Excluir">
        <AnimatedTrashButton effect="button" label={`Excluir ${plural}`} onDelete={() => setExcluir(lista)} />
      </Tooltip>}
    </>
  }

  return (
    <div className="arq px-3 py-3 sm:px-5 sm:py-4">
      {/* Título só para leitores de tela: a seção já aparece no menu do projeto. */}
      <h1 className="sr-only">{secao.titulo}</h1>
      {podeEnviar && (
        /* Seletor nativo de arquivo (controle permitido fora da base dos campos de texto). */
        <input ref={seletor} type="file" multiple accept={secao.aceita} className="hidden" aria-label={`Escolher arquivos para ${secao.titulo}`}
          onChange={e => { void escolher(e.target.files); e.target.value = '' }} />
      )}

      {envios.length > 0 && (
        <ul className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Envios em andamento">
          {envios.map(e => (
            <li key={e.chave} className="arq-quadro rounded-xl px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="arq-nome truncate font-medium">{e.nome}</span>
                {e.erro
                  ? <GlassButton variant="custom" type="button" onClick={() => setEnvios(l => l.filter(x => x.chave !== e.chave))} className="arq-meta text-xs underline">Dispensar</GlassButton>
                  : <span className="arq-meta text-xs tabular-nums">{e.progresso}%</span>}
              </div>
              {e.erro
                ? <p role="alert" className="arq-erro mt-1 text-xs">{e.erro}</p>
                : <div className="arq-progresso mt-1.5 h-1 overflow-hidden rounded-full" role="progressbar" aria-valuenow={e.progresso} aria-valuemin={0} aria-valuemax={100} aria-label={`Envio de ${e.nome}`}><div className="h-full transition-[width]" style={{ width: `${e.progresso}%` }} /></div>}
            </li>
          ))}
        </ul>
      )}

      <ListaArquivos
        itens={itens}
        tipos={categoria === 'FOTOS_VIDEOS' ? ['imagem', 'video'] : ['apresentacao', 'pdf', 'video']}
        vazio={secao.vazio}
        placeholderBusca={`Buscar em ${secao.titulo}`}
        visualizacao={categoria === 'FOTOS_VIDEOS' ? `projeto-${categoria}` : undefined}
        selecao={{ selecionados, onChange: setSelecionados, acoes: acoesSelecao }}
        acoesTopo={podeEnviar && (
          <GlassButton variant="primary" type="button" onClick={() => seletor.current?.click()} disabled={enviando} aria-busy={enviando} className="inline-flex h-10 items-center gap-1.5 px-4 text-sm">
            <Upload className="h-4 w-4" aria-hidden="true" />{enviando ? 'Enviando…' : 'Enviar'}
          </GlassButton>
        )}
      />

      <Modal isOpen={!!renomear} onClose={() => { if (!salvandoNome) setRenomear(null) }} title="Renomear arquivo" maxWidth="max-w-md">
        <form onSubmit={e => { e.preventDefault(); void salvarNome() }}>
          <label htmlFor="renomear-arquivo" className="mb-2 block text-sm text-slate-600">Nome</label>
          <Input id="renomear-arquivo" value={novoNome} onChange={e => setNovoNome(e.target.value)} maxLength={255} required autoFocus disabled={salvandoNome}
            aria-invalid={!!erroNome || undefined} aria-describedby={erroNome ? 'renomear-arquivo-erro' : undefined}
            // Seleciona só o nome, sem a extensão, como no Finder.
            onFocus={e => { const ponto = e.currentTarget.value.lastIndexOf('.'); e.currentTarget.setSelectionRange(0, ponto > 0 ? ponto : e.currentTarget.value.length) }}
            className="w-full rounded-xl border px-3 py-2 text-sm" />
          {erroNome && <p id="renomear-arquivo-erro" role="alert" className="arq-erro mt-2 text-sm">{erroNome}</p>}
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
