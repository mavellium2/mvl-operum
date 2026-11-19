'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
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

const botao = 'rounded-lg border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50'

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
  const [excluir, setExcluir] = useState<ArquivoDoProjeto | null>(null)

  const recarregar = useCallback(async () => {
    const r = await fetchWithSession(`/api/projects/${projetoId}/arquivos?categoria=${categoria}`)
    if (r.ok) setArquivos(await r.json())
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

  async function confirmarExclusao(arquivo: ArquivoDoProjeto) {
    const r = await fetchWithSession(`/api/projects/${projetoId}/arquivos/${arquivo.id}`, { method: 'DELETE' })
    if (!r.ok) { toast((await r.json().catch(() => ({})))?.error ?? 'Não foi possível excluir o arquivo.', 'error'); return }
    toast(`"${arquivo.nome}" excluído.`, 'success')
    await recarregar()
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
      acoes: <>
        <a href={href} target="_blank" rel="noopener noreferrer" className={botao}>Ver</a>
        <a href={`${href}?baixar=1`} className={botao}>Baixar</a>
        {podeExcluir && <GlassButton variant="custom" type="button" onClick={() => setExcluir(a)} className={`${botao} hover:!bg-red-50 hover:!text-red-600`}>Excluir</GlassButton>}
      </>,
    }
  })

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
        />
      </div>

      <ConfirmDialog
        isOpen={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={() => { if (excluir) void confirmarExclusao(excluir) }}
        title={excluir ? `Excluir "${excluir.nome}"?` : 'Excluir arquivo'}
        message="O arquivo sai do projeto e do armazenamento. A exclusão fica registrada na auditoria."
        confirmLabel="Excluir arquivo"
      />
    </div>
  )
}
