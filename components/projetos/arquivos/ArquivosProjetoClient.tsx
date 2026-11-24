'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Star, Upload } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AnimatedTrashButton from '@/components/ui/AnimatedTrashButton'
import AnimatedEditButton from '@/components/ui/AnimatedEditButton'
import Modal from '@/components/ui/Modal'
import FormActions from '@/components/ui/FormActions'
import { Input } from '@/components/ui/Field'
import Tooltip from '@/components/ui/Tooltip'
import VisualizadorMidia, { type MidiaVisualizavel } from '@/components/ui/VisualizadorMidia'
import { useToast } from '@/components/ui/Toast'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import { fetchWithSession } from '@/lib/clientFetch'
import { erroDoArquivo, formatarTamanho, SECOES_ARQUIVOS, tipoDoArquivo, tipoLegivel, visualDoTipo, type CategoriaArquivoProjeto } from '@/lib/arquivosProjeto'
import ZonaSoltarArquivos from '@/components/arquivos/ZonaSoltarArquivos'
import PainelEnvios, { type EnvioArquivo } from '@/components/arquivos/PainelEnvios'
import ListaArquivos, { type ItemArquivo } from '@/components/arquivos/ListaArquivos'

export interface ArquivoDoProjeto {
  id: string
  nome: string
  tipo: string
  tamanho: number
  enviadoEm: string
  enviadoPor: string | null
  enviadoPorAvatar?: string | null
  /** Estrela pessoal de quem está vendo. */
  favorito?: boolean
}


/** Envios ao mesmo tempo (o resto espera na fila, como no Drive). */
const ENVIOS_SIMULTANEOS = 3

/** Envia o arquivo direto ao storage pela URL assinada, com progresso; o sinal interrompe o envio. */
function enviarParaStorage(url: string, arquivo: File, tipo: string, onProgresso: (p: number) => void, sinal: AbortSignal): Promise<void> {
  return new Promise((ok, falha) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', tipo)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgresso(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? ok() : falha(new Error(`Falha no envio (${xhr.status})`)))
    xhr.onerror = () => falha(new Error('Falha de rede no envio'))
    xhr.onabort = () => falha(new DOMException('Cancelado', 'AbortError'))
    sinal.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(arquivo)
  })
}

/**
 * Tela de uma seção de arquivos do projeto (Fotos e Vídeos, Apresentação Final e
 * Vídeos, Desenhos Técnicos, Pesquisas…), na mesma base da lista do menu Arquivos.
 * Tudo o que muda entre as seções vem de `SECOES_ARQUIVOS[categoria]`
 * (`lib/arquivosProjeto.ts`): título, formatos aceitos, filtro de tipo e modo Blocos.
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
  const [envios, setEnvios] = useState<EnvioArquivo[]>([])
  const cancelamentos = useRef(new Map<string, AbortController>())
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [visualizar, setVisualizar] = useState<{ itens: MidiaVisualizavel[]; indice: number } | null>(null)
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
    const atualizar = (parcial: Partial<EnvioArquivo>) => setEnvios(lista => lista.map(e => (e.chave === chaveLocal ? { ...e, ...parcial } : e)))
    const controle = cancelamentos.current.get(chaveLocal)
    if (!controle || controle.signal.aborted) return false
    const tipo = tipoDoArquivo(arquivo.name, arquivo.type)
    const problema = erroDoArquivo(categoria, tipo, arquivo.size)
    if (problema) { atualizar({ estado: 'erro', erro: problema }); return false }
    atualizar({ estado: 'enviando' })
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/arquivos/envio`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controle.signal,
        body: JSON.stringify({ categoria, nome: arquivo.name, tipo, tamanho: arquivo.size }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Não foi possível iniciar o envio')
      const { url, chave } = await r.json() as { url: string; chave: string }
      await enviarParaStorage(url, arquivo, tipo, p => atualizar({ progresso: p }), controle.signal)
      const reg = await fetchWithSession(`/api/projects/${projetoId}/arquivos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controle.signal,
        body: JSON.stringify({ categoria, chave, nome: arquivo.name }),
      })
      if (!reg.ok) throw new Error((await reg.json().catch(() => ({})))?.error ?? 'Não foi possível registrar o arquivo')
      atualizar({ estado: 'concluido', progresso: 100 })
      return true
    } catch (e) {
      if (controle.signal.aborted) atualizar({ estado: 'cancelado' })
      else atualizar({ estado: 'erro', erro: e instanceof Error ? e.message : 'Falha no envio' })
      return false
    } finally {
      cancelamentos.current.delete(chaveLocal)
    }
  }

  async function escolher(lista: FileList | null) {
    if (!lista?.length) return
    const novos = [...lista].map((arquivo, i) => ({ arquivo, chave: `${Date.now()}-${i}-${arquivo.name}` }))
    novos.forEach(n => cancelamentos.current.set(n.chave, new AbortController()))
    setEnvios(e => [...e, ...novos.map(n => ({ chave: n.chave, nome: n.arquivo.name, tipo: tipoDoArquivo(n.arquivo.name, n.arquivo.type), progresso: 0, estado: 'aguardando' as const }))])
    // Fila com poucos envios simultâneos; a lista recarrega a cada arquivo concluído.
    const fila = [...novos]
    const trabalhar = async () => {
      for (let n = fila.shift(); n; n = fila.shift()) if (await enviar(n.arquivo, n.chave)) void recarregar()
    }
    await Promise.all(Array.from({ length: Math.min(ENVIOS_SIMULTANEOS, novos.length) }, trabalhar))
  }

  function cancelarEnvio(chave: string) {
    const controle = cancelamentos.current.get(chave)
    if (controle) { controle.abort(); setEnvios(l => l.map(e => (e.chave === chave && e.estado === 'aguardando' ? { ...e, estado: 'cancelado' } : e))) }
  }
  function cancelarTodos() { for (const chave of [...cancelamentos.current.keys()]) cancelarEnvio(chave) }
  // Sair da tela interrompe os envios pendentes.
  useEffect(() => {
    const pendentes = cancelamentos.current
    return () => { for (const c of pendentes.values()) c.abort() }
  }, [])

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

  const itens: ItemArquivo[] = arquivos.map(a => {
    const href = `/api/projects/${projetoId}/arquivos/${a.id}`
    return {
      id: a.id,
      nome: a.nome,
      subtitulo: tipoLegivel(a.tipo),
      categoria: visualDoTipo(a.tipo),
      tamanho: formatarTamanho(a.tamanho),
      tamanhoBytes: a.tamanho,
      enviadoPor: a.enviadoPor,
      enviadoPorAvatar: a.enviadoPorAvatar,
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
  /** Foto e vídeo abrem no visualizador do Operum, navegando na ordem da lista; os demais tipos, em nova aba. */
  function abrir(item: ItemArquivo, lista: ItemArquivo[]) {
    if (item.categoria !== 'imagem' && item.categoria !== 'video') {
      if (item.abrir) window.open(item.abrir, '_blank', 'noopener,noreferrer')
      return
    }
    const midias: MidiaVisualizavel[] = lista
      .filter(i => (i.categoria === 'imagem' || i.categoria === 'video') && i.abrir)
      .map(i => ({ id: i.id, nome: i.nome, tipo: i.categoria as 'imagem' | 'video', url: i.abrir!, baixar: `${i.abrir}?baixar=1`, detalhe: i.tamanho }))
    setVisualizar({ itens: midias, indice: Math.max(0, midias.findIndex(m => m.id === item.id)) })
  }

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


      {/* Arrastar arquivos do computador para cá envia direto (como no Drive). */}
      <ZonaSoltarArquivos ativa={podeEnviar} destino={secao.titulo} onSoltar={lista => void escolher(lista)} className="min-h-[calc(100vh-10rem)] rounded-2xl">
      <ListaArquivos
        itens={itens}
        tipos={secao.tiposVisuais}
        vazio={secao.vazio}
        placeholderBusca={`Buscar em ${secao.titulo}`}
        visualizacao={secao.blocos ? `projeto-${categoria}` : undefined}
        selecao={{
          selecionados, onChange: setSelecionados, acoes: acoesSelecao,
          // Atalhos: Delete/Backspace pedem a exclusão (com confirmação) e F2 renomeia, só para quem tem permissão.
          onExcluir: podeExcluir ? ids => setExcluir(doId(ids)) : undefined,
          onRenomear: podeEnviar ? id => { const a = arquivos.find(x => x.id === id); if (a) abrirRenomear(a) } : undefined,
        }}
        onAbrir={abrir}
        acoesTopo={podeEnviar && (
          <GlassButton variant="primary" type="button" onClick={() => seletor.current?.click()} className="inline-flex h-10 items-center gap-1.5 px-4 text-sm">
            <Upload className="h-4 w-4" aria-hidden="true" />Enviar
          </GlassButton>
        )}
      />
      </ZonaSoltarArquivos>

      <PainelEnvios envios={envios} onCancelar={cancelarEnvio} onCancelarTodos={cancelarTodos} onFechar={() => setEnvios([])} />

      {visualizar && (
        <VisualizadorMidia itens={visualizar.itens} indice={visualizar.indice}
          onIndice={i => setVisualizar(v => (v ? { ...v, indice: i } : v))} onClose={() => setVisualizar(null)} />
      )}

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
