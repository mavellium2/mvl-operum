'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BookOpen, ChevronDown, ChevronUp, CircleHelp, Eraser, FileCheck2, FileText, FileType2, History, ListPlus,
  Maximize2, Printer, Redo2, Save, Search, Undo2, ZoomIn, ZoomOut, ArrowDownToLine,
} from 'lucide-react'
import Tooltip from '@/components/ui/Tooltip'
import Modal from '@/components/ui/Modal'
import { EditorFolhaProvider, SELETOR_FOCO, type CampoEmFoco } from './folha'
import { useGuardaSaida, type SaidaDocumento } from './GuardaSaida'

/**
 * Tela de edição de documento (Penpot, "Tela — Edição de documento"):
 * barra de ferramentas por grupos (Versão, Documento, Edição, Navegar ou
 * Páginas, Download, Outros e indicador de salvamento), folha A4 editável no
 * centro e ajuda do campo em foco ao lado da folha.
 */

export type StatusSalvamento = 'salvo' | 'pendente' | 'salvando' | 'erro' | 'leitura'

export interface OpcaoVersao { id: string; rotulo: string; detalhe?: string }

export interface EditorDocumentoProps {
  children: ReactNode
  /** Nome do documento (manual, rótulos de acessibilidade). */
  documento: string
  paisagem?: boolean
  editavel: boolean
  status: StatusSalvamento
  mensagemStatus?: string
  versao?: { rotulo: string; opcoes: OpcaoVersao[]; selecionada: string | null; onSelecionar: (id: string | null) => void; rotuloAtual?: string }
  onSalvar?: () => void
  podeSalvar?: boolean
  onHistorico?: () => void
  pendentes?: { total: number; onRevisar: () => void }
  onImprimir?: () => void
  onPdf?: () => void
  onWord?: () => void
  desfazer?: { desfazer: () => void; refazer: () => void; podeDesfazer: boolean; podeRefazer: boolean }
  onAdicionarLinha?: () => void
  /** Botões extras no grupo Edição (ex.: abrir a EAP/WBS). */
  extrasEdicao?: ReactNode
  /** Documento em páginas fixas (EAP): mostra "Páginas" no lugar de "Navegar". */
  paginas?: { total: number; seletor: string }
  /** Avisos acima da folha (rascunho recuperado, erros…). */
  avisos?: ReactNode
  /** Aviso ao sair com alterações não salvas (salvar, salvar mais tarde ou descartar). */
  saida?: SaidaDocumento
}

function Botao({ rotulo, onClick, disabled, children, contador, ativo }: { rotulo: string; onClick?: () => void; disabled?: boolean; children: ReactNode; contador?: number; ativo?: boolean }) {
  return (
    <Tooltip label={rotulo}>
      <button
        type="button"
        aria-label={rotulo}
        onClick={onClick}
        disabled={disabled || !onClick}
        className={`relative flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-slate-700 transition-colors hover:border-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-transparent disabled:hover:bg-transparent ${ativo ? 'bg-slate-100' : ''}`}
      >
        {children}
        {!!contador && contador > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-amber-500 px-0.5 text-[9px] font-bold leading-none text-white">
            {contador > 99 ? '99+' : contador}
          </span>
        )}
      </button>
    </Tooltip>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={titulo} className="shrink-0 rounded-lg border border-slate-200 bg-white px-1 pb-1 pt-0.5">
      <p className="px-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</p>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  )
}

const ICONE = 'h-4 w-4'
const ZOOMS = [50, 67, 75, 90, 100, 110, 125, 150, 175, 200]

const STATUS: Record<StatusSalvamento, { cor: string; texto: string }> = {
  salvo: { cor: 'bg-emerald-500', texto: 'Rascunho salvo' },
  pendente: { cor: 'bg-amber-400', texto: 'Alterações pendentes' },
  salvando: { cor: 'bg-amber-400 animate-pulse', texto: 'Salvando…' },
  erro: { cor: 'bg-red-500', texto: 'Falha ao salvar o rascunho. Seu texto foi preservado.' },
  leitura: { cor: 'bg-slate-300', texto: 'Somente leitura' },
}

export default function EditorDocumento(props: EditorDocumentoProps) {
  const {
    children, documento, paisagem = false, editavel, status, mensagemStatus, versao, onSalvar, podeSalvar = true,
    onHistorico, pendentes, onImprimir, onPdf, onWord, desfazer, onAdicionarLinha, extrasEdicao, paginas, avisos, saida,
  } = props
  const { dialogo: dialogoSaida } = useGuardaSaida(saida)
  const raiz = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const conteudo = useRef<HTMLDivElement>(null)
  const folhas = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(100)
  const [foco, setFoco] = useState<CampoEmFoco | null>(null)
  const [posAjuda, setPosAjuda] = useState<{ top: number; left: number } | null>(null)
  const [vazios, setVazios] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [ajudaAberta, setAjudaAberta] = useState(false)
  const [manualAberto, setManualAberto] = useState(false)
  const [versaoAberta, setVersaoAberta] = useState(false)
  const limpadores = useRef(new Map<string, () => void>())
  const ultimoCampo = useRef<HTMLElement | null>(null)

  const registrarLimpar = useCallback((id: string, fn: (() => void) | null) => {
    if (fn) limpadores.current.set(id, fn)
    else limpadores.current.delete(id)
  }, [])
  const focar = useCallback((campo: CampoEmFoco | null) => {
    if (campo) ultimoCampo.current = campo.el
    setFoco(campo)
  }, [])
  const ctx = useMemo(() => ({ editavel, focar, registrarLimpar }), [editavel, focar, registrarLimpar])

  // Campos vazios (contador do "Próximo campo vazio"): recalculado a cada render da folha.
  useEffect(() => {
    const el = folhas.current
    if (!el) return
    const contar = () => setVazios(el.querySelectorAll('[data-campo][data-vazio="true"]').length)
    contar()
    const mo = new MutationObserver(contar)
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-vazio'], childList: true })
    return () => mo.disconnect()
  }, [])

  // Posição da ajuda: à direita da folha, na altura do campo em foco.
  useLayoutEffect(() => {
    if (!foco || !conteudo.current || !folhas.current) { setPosAjuda(null); return }
    const base = conteudo.current.getBoundingClientRect()
    const campo = foco.el.getBoundingClientRect()
    const folha = folhas.current.getBoundingClientRect()
    setPosAjuda({ top: campo.top - base.top, left: folha.right - base.left + 18 })
  }, [foco, zoom])

  const camposNavegaveis = useCallback(() => {
    const el = folhas.current
    if (!el) return [] as HTMLElement[]
    return [...el.querySelectorAll<HTMLElement>(SELETOR_FOCO)].filter(c => !(c as HTMLInputElement).disabled && !c.closest('[hidden]'))
  }, [])

  const navegar = useCallback((passo: 1 | -1, soVazios = false) => {
    const lista = camposNavegaveis()
    if (lista.length === 0) return
    const atual = lista.findIndex(c => c === document.activeElement || c.contains(document.activeElement))
    const ehVazio = (c: HTMLElement) => c.closest('[data-campo]')?.getAttribute('data-vazio') === 'true'
    for (let i = 1; i <= lista.length; i++) {
      const idx = ((atual < 0 ? (passo === 1 ? -1 : 0) : atual) + passo * i + lista.length * 2) % lista.length
      const alvo = lista[idx]
      if (!soVazios || ehVazio(alvo)) {
        alvo.focus()
        alvo.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
        return
      }
    }
  }, [camposNavegaveis])

  const limparCampo = useCallback(() => {
    const id = (document.activeElement as HTMLElement | null)?.closest('[data-campo]')?.getAttribute('data-campo')
      ?? ultimoCampo.current?.querySelector('[data-campo]')?.getAttribute('data-campo')
    if (id) limpadores.current.get(id)?.()
  }, [])

  const ajustarLargura = useCallback(() => {
    const largura = (area.current?.clientWidth ?? 0) - 64
    const folha = (paisagem ? 297 : 210) * 96 / 25.4
    if (largura > 0) setZoom(Math.max(50, Math.min(200, Math.floor((largura / folha) * 100))))
  }, [paisagem])
  const mudarZoom = (dir: 1 | -1) => setZoom(z => {
    const i = ZOOMS.findIndex(v => v >= z)
    if (dir === 1) return ZOOMS.find(v => v > z) ?? 200
    return [...ZOOMS].reverse().find(v => v < z) ?? (i <= 0 ? 50 : ZOOMS[i - 1])
  })

  // Páginas (EAP): a página atual acompanha a rolagem.
  useEffect(() => {
    if (!paginas || !area.current) return
    const el = area.current
    const ver = () => {
      const lista = [...(folhas.current?.querySelectorAll<HTMLElement>(paginas.seletor) ?? [])]
      const topo = el.getBoundingClientRect().top + 80
      let atual = 1
      lista.forEach((p, i) => { if (p.getBoundingClientRect().top <= topo) atual = i + 1 })
      setPagina(atual)
    }
    el.addEventListener('scroll', ver, { passive: true })
    return () => el.removeEventListener('scroll', ver)
  }, [paginas])
  const irParaPagina = (n: number) => {
    const lista = [...(folhas.current?.querySelectorAll<HTMLElement>(paginas?.seletor ?? '') ?? [])]
    const alvo = lista[Math.max(0, Math.min(lista.length - 1, n - 1))]
    alvo?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    setPagina(Math.max(1, Math.min(lista.length, n)))
  }

  // Atalhos: Ctrl+S, Ctrl+P, Ctrl+Z, Ctrl+Shift+Z/Ctrl+Y; Tab/Shift+Tab entre os campos da folha.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 's') { e.preventDefault(); if (onSalvar && podeSalvar) onSalvar(); return }
      if (mod && k === 'p') { if (onImprimir) { e.preventDefault(); onImprimir() } return }
      const naFolha = !!folhas.current?.contains(document.activeElement)
      if (!naFolha) return
      if (mod && desfazer && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); desfazer.refazer(); return }
      if (mod && desfazer && k === 'z') { e.preventDefault(); desfazer.desfazer(); return }
      if (e.key === 'Tab' && !mod && !e.altKey) { e.preventDefault(); navegar(e.shiftKey ? -1 : 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSalvar, podeSalvar, onImprimir, desfazer, navegar])

  const st = STATUS[status]
  const larguraFolha = paisagem ? '297mm' : '210mm'

  return (
    <EditorFolhaProvider value={ctx}>
      <div ref={raiz} data-testid="editor-documento" className="flex h-full min-h-0 flex-col bg-[#eef0f3]">
        {/* ── Barra de ferramentas ─────────────────────────────────────────── */}
        <div role="toolbar" aria-label={`Ferramentas do documento ${documento}`} className="sticky top-0 z-20 flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-[#f7f8fa] px-1.5 py-1">
          {versao && (
            <Grupo titulo="Versão">
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={versaoAberta}
                  onClick={() => setVersaoAberta(v => !v)}
                  className="flex h-7 items-center gap-1.5 rounded-md px-1 text-[12px] text-slate-700 hover:bg-slate-100"
                >
                  <FileText className={ICONE} />
                  <span className="max-w-[9rem] truncate">{versao.rotulo}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                </button>
                {versaoAberta && (
                  <ul role="listbox" aria-label="Versões" className="fixed z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg" onMouseLeave={() => setVersaoAberta(false)}>
                    <li>
                      <button type="button" role="option" aria-selected={versao.selecionada === null} onClick={() => { versao.onSelecionar(null); setVersaoAberta(false) }} className={`flex w-full flex-col px-3 py-1.5 text-left hover:bg-slate-50 ${versao.selecionada === null ? 'bg-blue-50 text-blue-700' : ''}`}>
                        <span>{versao.rotuloAtual ?? 'Rascunho atual (editável)'}</span>
                      </button>
                    </li>
                    {versao.opcoes.map(o => (
                      <li key={o.id}>
                        <button type="button" role="option" aria-selected={versao.selecionada === o.id} onClick={() => { versao.onSelecionar(o.id); setVersaoAberta(false) }} className={`flex w-full flex-col px-3 py-1.5 text-left hover:bg-slate-50 ${versao.selecionada === o.id ? 'bg-blue-50 text-blue-700' : ''}`}>
                          <span>{o.rotulo}</span>
                          {o.detalhe && <span className="text-xs text-slate-500">{o.detalhe}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Grupo>
          )}

          <Grupo titulo="Documento">
            <Botao rotulo="Salvar versão (Ctrl+S)" onClick={onSalvar} disabled={!podeSalvar}><Save className={ICONE} /></Botao>
            <Botao rotulo="Histórico de versões" onClick={onHistorico}><History className={ICONE} /></Botao>
            <Botao rotulo="Revisar proposta pendente" onClick={pendentes?.onRevisar} contador={pendentes?.total}><FileCheck2 className={ICONE} /></Botao>
            <Botao rotulo="Imprimir (Ctrl+P)" onClick={onImprimir}><Printer className={ICONE} /></Botao>
          </Grupo>

          <Grupo titulo="Edição">
            <Botao rotulo="Desfazer (Ctrl+Z)" onClick={desfazer?.desfazer} disabled={!editavel || !desfazer?.podeDesfazer}><Undo2 className={ICONE} /></Botao>
            <Botao rotulo="Refazer (Ctrl+Shift+Z)" onClick={desfazer?.refazer} disabled={!editavel || !desfazer?.podeRefazer}><Redo2 className={ICONE} /></Botao>
            {onAdicionarLinha && <Botao rotulo="Adicionar linha na tabela" onClick={onAdicionarLinha} disabled={!editavel}><ListPlus className={ICONE} /></Botao>}
            {extrasEdicao}
            {!paginas && <Botao rotulo="Limpar campo" onClick={limparCampo} disabled={!editavel}><Eraser className={ICONE} /></Botao>}
          </Grupo>

          {paginas ? (
            <Grupo titulo="Páginas">
              <Botao rotulo="Página anterior" onClick={() => irParaPagina(pagina - 1)} disabled={pagina <= 1}><ChevronUp className={ICONE} /></Botao>
              <span className="px-1 text-[12px] tabular-nums text-slate-700" aria-live="polite">{pagina} / {paginas.total}</span>
              <Botao rotulo="Próxima página" onClick={() => irParaPagina(pagina + 1)} disabled={pagina >= paginas.total}><ChevronDown className={ICONE} /></Botao>
            </Grupo>
          ) : (
            <Grupo titulo="Navegar">
              <Botao rotulo="Campo anterior (Shift+Tab)" onClick={() => navegar(-1)} disabled={!editavel}><ChevronUp className={ICONE} /></Botao>
              <Botao rotulo="Próximo campo (Tab)" onClick={() => navegar(1)} disabled={!editavel}><ChevronDown className={ICONE} /></Botao>
              <Botao rotulo="Próximo campo vazio" onClick={() => navegar(1, true)} disabled={!editavel || vazios === 0} contador={editavel ? vazios : 0}><ArrowDownToLine className={ICONE} /></Botao>
            </Grupo>
          )}

          <Grupo titulo="Download">
            <Botao rotulo="PDF (.pdf)" onClick={onPdf}><FileType2 className={ICONE} /></Botao>
            <Botao rotulo="Word (.docx)" onClick={onWord}><FileText className={ICONE} /></Botao>
          </Grupo>

          <Grupo titulo="Outros">
            <Botao rotulo="Ajustar à largura" onClick={ajustarLargura}><Maximize2 className={ICONE} /></Botao>
            <Botao rotulo="Diminuir zoom" onClick={() => mudarZoom(-1)} disabled={zoom <= 50}><ZoomOut className={ICONE} /></Botao>
            <Botao rotulo={`Zoom: ${zoom}% (clique = 100%)`} onClick={() => setZoom(100)}><Search className={ICONE} /></Botao>
            <Botao rotulo="Aumentar zoom" onClick={() => mudarZoom(1)} disabled={zoom >= 200}><ZoomIn className={ICONE} /></Botao>
            <Botao rotulo="Ajuda rápida" onClick={() => setAjudaAberta(true)}><CircleHelp className={ICONE} /></Botao>
            <Botao rotulo="Manual" onClick={() => setManualAberto(true)}><BookOpen className={ICONE} /></Botao>
          </Grupo>

          <Tooltip label={mensagemStatus ?? st.texto}>
            <span role="status" aria-label={mensagemStatus ?? st.texto} tabIndex={0} className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white">
              <span className={`h-2 w-2 rounded-full ${st.cor}`} />
            </span>
          </Tooltip>
        </div>

        {/* ── Área da folha ────────────────────────────────────────────────── */}
        <div ref={area} className="relative min-h-0 flex-1 overflow-auto">
          <div ref={conteudo} className="relative mx-auto flex w-max min-w-full flex-col items-center px-8 py-5">
            {avisos && <div className="mb-4 flex w-full flex-col gap-2" style={{ maxWidth: larguraFolha }}>{avisos}</div>}
            <div ref={folhas} data-folhas="" className="flex flex-col gap-5" style={{ zoom: zoom / 100 }}>
              {children}
            </div>
            {foco && posAjuda && (
              <>
                <div aria-hidden="true" className="absolute h-px w-[18px] bg-blue-300" style={{ top: posAjuda.top + 32, left: posAjuda.left - 18 }} />
                <aside aria-label={`Ajuda do campo ${foco.rotulo}`} className="absolute z-10 hidden w-44 rounded-lg border border-slate-200 bg-white p-3 shadow-sm xl:block" style={{ top: posAjuda.top, left: posAjuda.left }}>
                  <p className="text-sm font-semibold text-slate-900">{foco.rotulo}</p>
                  {foco.ajuda && <p className="mt-1 text-[13px] leading-snug text-slate-500">{foco.ajuda}</p>}
                  {foco.max !== undefined && (
                    <p className="mt-2 text-xs tabular-nums text-slate-400">{(foco.tamanho ?? 0).toLocaleString('pt-BR')} / {foco.max.toLocaleString('pt-BR')}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">Tab → próximo campo</p>
                </aside>
              </>
            )}
          </div>
        </div>
      </div>

      {dialogoSaida}

      <Modal isOpen={ajudaAberta} onClose={() => setAjudaAberta(false)} title="Ajuda rápida" maxWidth="max-w-md">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 py-2 text-sm">
          {[
            ['Clique na folha', 'Edita o campo direto no documento'],
            ['Tab / Shift+Tab', 'Próximo / campo anterior'],
            ['Ctrl+Z / Ctrl+Shift+Z', 'Desfazer / refazer'],
            ['Ctrl+S', 'Salvar versão (envia para aprovação)'],
            ['Ctrl+P', 'Imprimir'],
            ['Cadeado', 'Campo automático: vem do cadastro do projeto'],
          ].map(([k, v]) => (
            <div key={k} className="contents"><dt className="font-medium text-slate-800">{k}</dt><dd className="text-slate-600">{v}</dd></div>
          ))}
        </dl>
      </Modal>

      <Modal isOpen={manualAberto} onClose={() => setManualAberto(false)} title={`Manual — ${documento}`} maxWidth="max-w-lg">
        <div className="space-y-3 py-2 text-sm text-slate-700">
          <p>O documento é editado direto na folha, que já é o que sai no PDF. O rascunho é salvo sozinho (indicador no fim da barra) e só você o vê até salvar uma versão.</p>
          <p><strong>Tipos de campo:</strong></p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Automático</strong> (cadeado): vem do cadastro do projeto e não é editado aqui.</li>
            <li><strong>Texto</strong>: clique e digite; vazio mostra a pergunta que orienta o preenchimento.</li>
            <li><strong>Pessoa</strong>: escolha um membro da equipe; o aprovador é sempre o gerente.</li>
            <li><strong>Data</strong>: digite ou abra o calendário; sai como dd/mm/aaaa.</li>
            <li><strong>Lista / tabela</strong>: “+ Adicionar” no fim da tabela; o “×” ao lado da linha remove.</li>
          </ul>
          <p><strong>Versões:</strong> “Salvar versão” envia a proposta para aprovação do gerente; o documento vigente só muda quando ela é aprovada. Pelo seletor de versão você abre versões anteriores (somente leitura).</p>
        </div>
      </Modal>
    </EditorFolhaProvider>
  )
}
