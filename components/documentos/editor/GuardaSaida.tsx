'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GlassButton from '@/components/ui/GlassButton'
import { FileClock, Save, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'

/**
 * Aviso ao sair de um documento com alterações não salvas (comum a todos os
 * documentos; o EditorDocumento já o inclui). Pergunta se a pessoa quer
 * salvar, salvar mais tarde (rascunho só dela) ou descartar as alterações.
 *
 * Cobre: links internos (menu, voltar às atas…), troca de documento pelo
 * menu (navegarComGuarda) e fechar/recarregar a aba (aviso do navegador).
 */

export interface SaidaDocumento {
  contexto?: 'projeto' | 'documento'
  /** Há alterações que ainda não viraram versão. */
  pendente: boolean
  /** Abre o fluxo de salvar versão; a saída continua quando não houver mais pendência. */
  salvar: () => void
  /** Guarda as alterações como rascunho para continuar depois. Omitido: a opção não aparece. */
  salvarDepois?: () => Promise<boolean>
  /** Descarta as alterações (inclusive o rascunho guardado). */
  descartar: () => Promise<void> | void
}

type Guarda = (destino: () => void) => boolean
let guardaAtual: Guarda | null = null

/**
 * Navegação feita por código (ex.: trocar de documento no menu): passa pelo
 * aviso quando o documento aberto tem alterações não salvas.
 */
export function navegarComGuarda(destino: () => void) {
  if (guardaAtual?.(destino)) return
  destino()
}

export function useGuardaSaida(saida: SaidaDocumento | undefined) {
  const router = useRouter()
  const [destino, setDestino] = useState<(() => void) | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  /** Escolheu "Salvar": segue para o destino quando a versão for salva. */
  const aposSalvar = useRef<(() => void) | null>(null)
  const pendente = !!saida?.pendente
  const saidaRef = useRef(saida)
  useEffect(() => { saidaRef.current = saida })

  // Registra a guarda deste documento para a navegação por código.
  useEffect(() => {
    if (!pendente) return
    const guarda: Guarda = d => { setErro(''); setDestino(() => d); return true }
    guardaAtual = guarda
    return () => { if (guardaAtual === guarda) guardaAtual = null }
  }, [pendente])

  // Fechar ou recarregar a aba: o navegador mostra o aviso padrão dele.
  useEffect(() => {
    if (!pendente) return
    const antes = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', antes)
    return () => window.removeEventListener('beforeunload', antes)
  }, [pendente])

  // Links internos: segura o clique e pergunta antes de sair.
  useEffect(() => {
    if (!pendente) return
    const clique = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const a = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin) return
      if (url.pathname === location.pathname && url.search === location.search) return
      event.preventDefault()
      event.stopPropagation()
      setErro('')
      setDestino(() => () => router.push(`${url.pathname}${url.search}${url.hash}`))
    }
    document.addEventListener('click', clique, true)
    return () => document.removeEventListener('click', clique, true)
  }, [pendente, router])

  // Depois de "Salvar": quando não houver mais pendência, segue para onde ia.
  useEffect(() => {
    if (!pendente && aposSalvar.current) {
      const d = aposSalvar.current
      aposSalvar.current = null
      d()
    }
  }, [pendente])

  const fechar = useCallback(() => { if (!ocupado) setDestino(null) }, [ocupado])

  async function escolher(opcao: 'salvar' | 'depois' | 'descartar') {
    const s = saidaRef.current
    const d = destino
    if (!s || !d) return
    setErro('')
    if (opcao === 'salvar') {
      aposSalvar.current = d
      setDestino(null)
      s.salvar()
      return
    }
    setOcupado(true)
    try {
      if (opcao === 'depois') {
        if (!(await s.salvarDepois?.())) { setErro('Não foi possível guardar o rascunho. Tente de novo ou salve a versão.'); return }
      } else {
        await s.descartar()
      }
      aposSalvar.current = null
      setDestino(null)
      d()
    } catch {
      setErro('Não foi possível concluir. Tente de novo.')
    } finally {
      setOcupado(false)
    }
  }

  const projeto = saida?.contexto === 'projeto'
  const dialogo = (
    <Modal isOpen={destino !== null} onClose={fechar} title="Alterações não salvas" maxWidth="max-w-lg" className="phase-delete-dialog" hideHeader>
      <div className="px-6 py-6 sm:px-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="phase-delete-muted mb-2 text-xs">Antes de sair</p><h2 className="phase-delete-heading text-2xl font-semibold tracking-tight">Alterações não salvas</h2></div>
          <GlassCloseButton label="Fechar aviso" disabled={ocupado} onClick={fechar} />
        </div>
        <p className="phase-delete-muted mb-5 mt-3 text-sm leading-relaxed">{projeto ? 'Suas alterações no projeto ainda não foram salvas.' : 'Você alterou este documento e ainda não salvou uma versão.'} Escolha como deseja continuar.</p>
        {erro && <p role="alert" className="mb-4 text-sm text-rose-400">{erro}</p>}
        <div className="flex flex-col gap-3">
          <GlassButton className="unsaved-choice" disabled={ocupado} onClick={() => void escolher('salvar')}>
            <Save className="h-4 w-4 shrink-0" /><span><span className="block font-semibold">Salvar e sair</span><span className="mt-1 block text-xs font-normal opacity-75">{projeto ? 'Salva o projeto e registra uma nova versão no histórico.' : 'Salva uma versão para aprovação e depois sai.'}</span></span>
          </GlassButton>
          {saida?.salvarDepois && <GlassButton className="unsaved-choice" disabled={ocupado} onClick={() => void escolher('depois')}><FileClock className="h-4 w-4 shrink-0" /><span><span className="block font-semibold">Guardar para depois</span><span className="mt-1 block text-xs font-normal opacity-75">Guarda um rascunho só seu para continuar quando voltar.</span></span></GlassButton>}
          <GlassButton className="unsaved-choice unsaved-discard" disabled={ocupado} onClick={() => void escolher('descartar')}><Trash2 className="h-4 w-4 shrink-0" /><span><span className="block font-semibold">Sair sem salvar</span><span className="mt-1 block text-xs font-normal opacity-75">Descarta as edições pendentes. O conteúdo já salvo é preservado.</span></span></GlassButton>
        </div>
        <div className="mt-5 flex justify-end border-t border-white/10 pt-5"><GlassButton variant="primary" autoFocus disabled={ocupado} onClick={fechar}>Continuar editando</GlassButton></div>
      </div>
    </Modal>
  )

  return { dialogo }
}
