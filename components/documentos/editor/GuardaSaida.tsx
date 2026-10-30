'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

  const dialogo = (
    <Modal isOpen={destino !== null} onClose={fechar} title="Alterações não salvas" maxWidth="max-w-md">
      <div className="flex flex-col gap-4 py-2">
        <p className="text-sm text-slate-600">
          Você alterou este documento e ainda não salvou uma versão. O que deseja fazer antes de sair?
        </p>
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        <div className="flex flex-col gap-2">
          <button type="button" disabled={ocupado} onClick={() => void escolher('salvar')} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-left text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            Salvar
            <span className="block text-xs font-normal text-emerald-50">Salva uma versão (enviada para aprovação) e depois sai.</span>
          </button>
          {saida?.salvarDepois && (
            <button type="button" disabled={ocupado} onClick={() => void escolher('depois')} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
              Salvar mais tarde
              <span className="block text-xs font-normal text-slate-500">Guarda como rascunho só seu; continua de onde parou quando voltar.</span>
            </button>
          )}
          <button type="button" disabled={ocupado} onClick={() => void escolher('descartar')} className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-left text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">
            Descartar alterações
            <span className="block text-xs font-normal text-red-600">Volta ao documento salvo; o que foi alterado se perde.</span>
          </button>
          <button type="button" disabled={ocupado} onClick={fechar} className="px-4 py-2 text-sm text-slate-600 hover:underline disabled:opacity-50">
            Continuar editando
          </button>
        </div>
      </div>
    </Modal>
  )

  return { dialogo }
}
