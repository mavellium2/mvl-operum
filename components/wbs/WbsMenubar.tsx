'use client'

import { type Dispatch, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import {
  Undo2, Redo2, CornerDownRight, Plus, Trash2, Palette, Save, Printer,
  ZoomIn, ZoomOut, Maximize2, Search,
  FolderOpen, Scissors, Copy, ClipboardPaste, CopyPlus, Paintbrush, PaintRoller, Eraser,
  PencilLine, ChevronsUpDown, Network, Table2, Coins, ChartGantt,
  FileImage, ImageDown, FileCode2, FileJson, HelpCircle, BookOpen,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Tooltip from '@/components/ui/Tooltip'
import ToolbarSelect from './ToolbarSelect'
import { IconeOrganizar, OPCOES_FASE, OPCOES_ORGANIZAR } from './OrganizarIcons'
import { formatoDaEap, formatoDaFase } from '@/lib/wbsLayout'
import { exportMspdi } from '@/lib/wbsExportMspdi'
import { exportWbsSvg, exportWbsPng } from '@/lib/wbsExportSvg'
import { importWbsAction, getWbsTreeAction } from '@/app/actions/wbs'
import type { WbsAction } from '@/lib/wbsReducer'
import type { WbsNodeClient, WbsViewMode } from '@/types/wbs'

export interface WbsMenubarProps {
  viewMode?: WbsViewMode
  onChangeView?: (mode: WbsViewMode) => void
  canViewCosts?: boolean
  syncStatus: 'IDLE' | 'DIRTY' | 'SAVING' | 'ERROR' | 'CONFLICT'
  lastSavedAt: number | null
  zoom: number
  panX: number
  panY: number
  canUndo: boolean
  canRedo: boolean
  canEdit: boolean
  nodes: Record<string, WbsNodeClient>
  rootId: string | null
  selectedNodeIds: string[]
  projetoId: string
  dispatch: Dispatch<WbsAction>
  hasCopiedStyle: boolean
  hasClipboardNodes: boolean
  onFitScreen: () => void
  onManualSave: () => void
  onRequestDelete: () => void
  onPasteStyle: () => void
  showStylePanel: boolean
  onToggleStylePanel: () => void
}

// ── Botão de ícone com tooltip, usado na faixa de ações rápidas ───────────────

function IconButton({
  label, onClick, disabled, active, children,
}: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`h-7 w-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none ${
          active
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  )
}

const SYNC = {
  IDLE:     { label: 'Salvo',     color: '#16a34a', icon: '●' },
  DIRTY:    { label: 'Não salvo', color: '#d97706', icon: '●' },
  SAVING:   { label: 'Salvando…', color: '#3b82f6', icon: '●' },
  ERROR:    { label: 'Erro',      color: '#dc2626', icon: '⚠' },
  CONFLICT: { label: 'Conflito!', color: '#7c3aed', icon: '⚠' },
}

// ── Shortcuts table (shared by Quick Help + Manual section 3) ─────────────────

function ShortcutsTable() {
  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: 'Navegação',
      rows: [
        ['↑ ↓ ← →', 'Navegar entre elementos'],
        ['Tab', 'Inserir elemento filho (desce nível)'],
        ['Shift+Tab', 'Voltar ao nível pai'],
        ['Enter', 'Inserir elemento irmão'],
        ['F2 / Duplo clique', 'Renomear elemento'],
        ['[ / ]', 'Recolher / expandir elemento'],
        ['Digitar', 'Clicar e digitar já troca o texto'],
      ],
    },
    {
      title: 'Edição',
      rows: [
        ['Ctrl+Z', 'Desfazer'],
        ['Ctrl+Shift+Z', 'Refazer'],
        ['Ctrl+X', 'Recortar'],
        ['Ctrl+C', 'Copiar'],
        ['Ctrl+V', 'Colar'],
        ['Ctrl+D', 'Duplicar elemento(s) (Ctrl+Alt+D se o navegador reservar Ctrl+D)'],
        ['Ctrl+A', 'Selecionar tudo'],
        ['Ctrl+Shift+C', 'Copiar estilo'],
        ['Ctrl+Shift+V', 'Colar estilo'],
        ['Ctrl+Shift+X', 'Limpar estilo'],
        ['Delete', 'Remover elemento'],
      ],
    },
    {
      title: 'Arquivo',
      rows: [
        ['Ctrl+S', 'Salvar'],
        ['Ctrl+O', 'Abrir documento'],
        ['Ctrl+P', 'Imprimir'],
      ],
    },
    {
      title: 'Visualização',
      rows: [
        ['+ / −', 'Zoom in / out'],
        ['Ctrl+0', 'Zoom 100%'],
        ['Esc', 'Cancelar / limpar seleção'],
      ],
    },
  ]

  return (
    <div className="space-y-5">
      {sections.map(s => (
        <div key={s.title}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{s.title}</p>
          <table className="w-full text-sm">
            <tbody>
              {s.rows.map(([k, v]) => (
                <tr key={k} className="border-b border-gray-50 last:border-0">
                  <td className="py-1 pr-6 font-mono text-xs text-gray-600 whitespace-nowrap">{k}</td>
                  <td className="py-1 text-gray-700">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ── Manual modal content ──────────────────────────────────────────────────────

function ManualContent() {
  const [tab, setTab] = useState(0)
  const tabs = ['O que é uma EAP?', 'Como criar sua EAP', 'Referência de atalhos']

  return (
    <div className="flex gap-6" style={{ minHeight: 400 }}>
      {/* Sidebar */}
      <nav className="w-44 shrink-0 border-r border-gray-100 space-y-1 pr-4">
        {tabs.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              tab === i ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto text-sm text-gray-700 space-y-4 pr-1">
        {tab === 0 && (
          <>
            <p>
              A <strong>Estrutura Analítica do Projeto (EAP)</strong>, também conhecida como WBS
              (Work Breakdown Structure), é uma decomposição hierárquica do escopo total do
              trabalho do projeto em componentes menores e mais gerenciáveis.
            </p>
            <p>
              Ela serve para decompor o escopo em <strong>pacotes de trabalho</strong>: entregáveis
              concretos, mensuráveis e atribuíveis a uma equipe. Cada pacote deve poder ser
              estimado em custo e prazo de forma independente.
            </p>
            <p>
              Os <strong>códigos hierárquicos</strong> (1, 1.1, 1.1.2…) identificam univocamente
              cada elemento. O código indica a posição do elemento na hierarquia: &ldquo;1.2.3&rdquo; é o
              terceiro filho do segundo filho do elemento raiz.
            </p>
            <p>
              O menu <em>Organizar</em> define o formato da EAP inteira. Em <em>Padrão</em>, os filhos de
              cada item ficam lado a lado embaixo dele, em todos os níveis. Em
              <em> Esquerda</em> ou <em>Direita</em>, as fases ficam lado a lado e o restante fica
              empilhado à esquerda ou à direita de cada fase, o que economiza espaço em árvores
              profundas. Em <em>Horizontal</em>, a EAP é lida da esquerda para a direita, com a raiz
              em pé. Sem nada selecionado, a escolha vale para a EAP inteira e todas as fases passam a
              segui-la. Com uma ou mais fases selecionadas, o menu vira <em>Organizar fase</em> e deixa
              só essas fases em Esquerda ou Direita.
            </p>
          </>
        )}

        {tab === 1 && (
          <ol className="space-y-5">
            {[
              ['O elemento raiz', 'Ao abrir a ferramenta, um elemento raiz já existe com o código 1. Clique nele para selecioná-lo e pressione F2 para renomear com o nome do seu projeto.'],
              ['Criar o primeiro nível', 'Com o elemento raiz selecionado, pressione Tab para criar um filho (código 1.1). Repita para cada entrega principal do projeto.'],
              ['Decompor em pacotes de trabalho', 'Selecione qualquer elemento e pressione Tab para adicionar um filho, ou Enter para adicionar um irmão no mesmo nível. Continue até que cada folha represente um pacote de trabalho mensurável.'],
              ['Definir custos e duração', 'Selecione um elemento folha (sem filhos) e abra Elemento → Propriedades. Informe custo e duração em dias. Os elementos pai calculam automaticamente o total dos filhos.'],
              ['Ajustar o visual', 'Selecione um ou mais elementos e acesse Elemento → Estilo para personalizar cores, bordas e fonte. Use Ctrl+Shift+C para copiar o estilo a outros elementos.'],
              ['Exportar', 'Use Download → Figura para exportar como imagem (.svg ou .png). Use Download → MS Project XML para importar no Microsoft Project ou ferramentas compatíveis com o formato MSPDI.'],
            ].map(([title, body], i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <strong className="block mb-1">{title}</strong>
                  {body}
                </div>
              </li>
            ))}
          </ol>
        )}

        {tab === 2 && <ShortcutsTable />}
      </div>
    </div>
  )
}

// ── Dropdown item types ───────────────────────────────────────────────────────

interface ToolbarItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
}

function ToolbarCard({ title, items }: { title: string; items: ToolbarItem[] }) {
  return (
    <div className="flex flex-col gap-0.5 border border-gray-200 rounded-md bg-white p-1 shadow-sm shrink-0">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 px-0.5">{title}</span>
      <div className="flex items-center gap-0.5">
        {items.map(it => (
          <IconButton key={it.label} label={it.label} onClick={it.onClick} disabled={it.disabled} active={it.active}>
            {it.icon}
          </IconButton>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WbsMenubar({
  viewMode = 'chart', onChangeView, canViewCosts = false,
  syncStatus, zoom, panX, panY,
  canUndo, canRedo, canEdit,
  nodes, rootId, selectedNodeIds, projetoId,
  hasCopiedStyle, hasClipboardNodes,
  dispatch, onFitScreen, onManualSave, onRequestDelete, onPasteStyle,
  showStylePanel, onToggleStylePanel,
}: WbsMenubarProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showHelp, setShowHelp] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [filePickerTrigger, setFilePickerTrigger] = useState(0)

  useEffect(() => {
    if (filePickerTrigger > 0) fileInputRef.current?.click()
  }, [filePickerTrigger])

  // Ctrl+O → open file picker, Ctrl+P → print
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      if (isInput) return
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'o') { e.preventDefault(); fileInputRef.current?.click() }
      if (ctrl && e.key === 'p') { e.preventDefault(); window.print() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const firstSelected = selectedNodeIds[0]
  const selectedNode = firstSelected ? nodes[firstSelected] : null
  // Organizar (ADR-047): só com fases selecionadas muda o formato delas; em qualquer outro caso
  // (nada selecionado, raiz ou itens mais fundos) muda a EAP inteira e todas as fases voltam a segui-la.
  const root = rootId ? nodes[rootId] : null
  const formatoEap = formatoDaEap(root?.layout)
  const fasesSelecionadas = selectedNodeIds.map(id => nodes[id]).filter((n): n is WbsNodeClient => !!n && !!rootId && n.parentId === rootId)
  const modoFase = formatoEap !== 'HORIZONTAL' && selectedNodeIds.length > 0 && fasesSelecionadas.length === selectedNodeIds.length
  const formatosFases = new Set(fasesSelecionadas.map(f => formatoDaFase(f.layout, formatoEap) ?? 'LADO_A_LADO'))
  const formatoFases = formatosFases.size === 1 ? [...formatosFases][0] : null
  const canDelete = selectedNodeIds.some(id => nodes[id]?.parentId)

  // File import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      toast('Importando projeto...', 'success')
      const res = await importWbsAction(projetoId, data)
      if (res.ok) {
        // Recarrega a árvore que o servidor acabou de gravar (códigos recalculados
        // e serverVersion novo) e sincroniza o cliente — sem isso o próximo
        // autosave envia a versão antiga e entra em conflito de edição.
        const fresh = await getWbsTreeAction(projetoId)
        if (fresh.ok) {
          dispatch({ type: 'SET_TREE', payload: { nodes: fresh.nodes, rootId: fresh.rootId, serverVersion: fresh.serverVersion } })
        }
        toast('Projeto importado com sucesso!', 'success')
        router.refresh()
      } else {
        toast(res.error || 'Erro ao importar projeto', 'error')
      }
    } catch {
      toast('Arquivo inválido', 'error')
    }
    e.target.value = ''
  }

  const sync = SYNC[syncStatus] ?? SYNC.IDLE
  const zoomPercent = Math.round(zoom * 100)

  const downloadMspdi = () => {
    const xml = exportMspdi(nodes, rootId, { projectName: projetoId })
    if (!xml) {
      toast('Erro ao gerar arquivo', 'error')
      return
    }
    toast('Exportando projeto...', 'success')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml;charset=utf-8' }))
    a.download = `eap-${projetoId}.xml`
    a.click()
    toast('Arquivo exportado com sucesso!', 'success')
    URL.revokeObjectURL(a.href)
  }
  const downloadWbs = () => {
    toast('Exportando projeto...', 'success')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, rootId, nodes }, null, 2)], { type: 'application/json' })
    )
    a.download = `eap-${projetoId}.wbs`
    a.click()
    toast('Arquivo exportado com sucesso!', 'success')
    URL.revokeObjectURL(a.href)
  }

  // ── Cards da toolbar: título + ações como ícones (texto só no tooltip) ─────
  const cards: { title: string; items: ToolbarItem[] }[] = [
    {
      title: 'Documentos',
      items: [
        { label: 'Abrir documento (.wbs)', icon: <FolderOpen className="w-4 h-4" />, onClick: () => setFilePickerTrigger(t => t + 1) },
        { label: 'Salvar (Ctrl+S)', icon: <Save className="w-4 h-4" />, onClick: onManualSave, disabled: !canEdit },
        { label: 'Imprimir (Ctrl+P)', icon: <Printer className="w-4 h-4" />, onClick: () => window.print() },
      ],
    },
    {
      title: 'Editar',
      items: [
        { label: 'Desfazer (Ctrl+Z)', icon: <Undo2 className="w-4 h-4" />, onClick: () => dispatch({ type: 'UNDO' }), disabled: !canUndo },
        { label: 'Refazer (Ctrl+Shift+Z)', icon: <Redo2 className="w-4 h-4" />, onClick: () => dispatch({ type: 'REDO' }), disabled: !canRedo },
        { label: 'Recortar (Ctrl+X)', icon: <Scissors className="w-4 h-4" />, onClick: () => dispatch({ type: 'CUT', payload: { nodeIds: selectedNodeIds } }), disabled: !canDelete || !canEdit },
        { label: 'Copiar (Ctrl+C)', icon: <Copy className="w-4 h-4" />, onClick: () => dispatch({ type: 'COPY', payload: { nodeIds: selectedNodeIds } }), disabled: !firstSelected },
        { label: 'Colar (Ctrl+V)', icon: <ClipboardPaste className="w-4 h-4" />, onClick: () => { if (firstSelected) dispatch({ type: 'PASTE', payload: { parentId: firstSelected } }) }, disabled: !firstSelected || !canEdit || !hasClipboardNodes },
        { label: 'Duplicar (Ctrl+D)', icon: <CopyPlus className="w-4 h-4" />, onClick: () => dispatch({ type: 'DUPLICATE', payload: { nodeIds: selectedNodeIds } }), disabled: !canDelete || !canEdit },
        { label: 'Copiar Estilo (Ctrl+Shift+C)', icon: <Paintbrush className="w-4 h-4" />, onClick: () => { if (firstSelected) dispatch({ type: 'COPY_STYLE', payload: { nodeId: firstSelected } }) }, disabled: !firstSelected },
        { label: 'Colar Estilo (Ctrl+Shift+V)', icon: <PaintRoller className="w-4 h-4" />, onClick: onPasteStyle, disabled: !hasCopiedStyle || !firstSelected || !canEdit },
        { label: 'Limpar Estilo (Ctrl+Shift+X)', icon: <Eraser className="w-4 h-4" />, onClick: () => dispatch({ type: 'CLEAR_STYLE' }), disabled: selectedNodeIds.length === 0 || !canEdit },
      ],
    },
    {
      title: 'Elemento',
      items: [
        { label: 'Inserir Filho (Tab)', icon: <CornerDownRight className="w-4 h-4" />, onClick: () => { if (firstSelected) dispatch({ type: 'INSERT_CHILD', payload: { parentId: firstSelected } }) }, disabled: !firstSelected || !canEdit },
        { label: 'Inserir Irmão (Enter)', icon: <Plus className="w-4 h-4" />, onClick: () => { if (firstSelected && selectedNode?.parentId) dispatch({ type: 'INSERT_SIBLING', payload: { siblingId: firstSelected } }) }, disabled: !firstSelected || !selectedNode?.parentId || !canEdit },
        { label: 'Renomear (F2)', icon: <PencilLine className="w-4 h-4" />, onClick: () => { if (firstSelected) dispatch({ type: 'SET_EDITING', payload: { nodeId: firstSelected } }) }, disabled: !firstSelected },
        { label: 'Recolher/Expandir ([ / ])', icon: <ChevronsUpDown className="w-4 h-4" />, onClick: () => { if (firstSelected && selectedNode) dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: firstSelected, collapsed: !selectedNode.collapsed } }) }, disabled: !selectedNode?.childrenIds.length || !canEdit },
        { label: 'Remover (Delete)', icon: <Trash2 className="w-4 h-4" />, onClick: onRequestDelete, disabled: !canDelete || !canEdit },
      ],
    },
    // Organizar é um select de ícones (ver ORGANIZAR abaixo), renderizado nesta posição.
    { title: 'Organizar', items: [] },
    {
      title: 'Download',
      items: [
        { label: 'Figura SVG (.svg)', icon: <FileImage className="w-4 h-4" />, onClick: () => exportWbsSvg(nodes, rootId, `eap-${projetoId}.svg`) },
        { label: 'Figura PNG (.png)', icon: <ImageDown className="w-4 h-4" />, onClick: () => exportWbsPng(nodes, rootId, `eap-${projetoId}.png`) },
        { label: 'MS Project XML (MSPDI)', icon: <FileCode2 className="w-4 h-4" />, onClick: downloadMspdi },
        { label: 'Arquivo WBS (.wbs)', icon: <FileJson className="w-4 h-4" />, onClick: downloadWbs },
      ],
    },
    {
      title: 'Outros',
      items: [
        { label: 'Estilo e propriedades', icon: <Palette className="w-4 h-4" />, onClick: onToggleStylePanel, disabled: !firstSelected && !showStylePanel, active: showStylePanel },
        { label: 'Ajustar à tela', icon: <Maximize2 className="w-4 h-4" />, onClick: onFitScreen },
        { label: 'Diminuir zoom', icon: <ZoomOut className="w-4 h-4" />, onClick: () => dispatch({ type: 'SET_VIEWPORT', payload: { zoom: Math.max(0.1, zoom / 1.2), panX, panY } }) },
        { label: `Zoom: ${zoomPercent}% (clique = 100%)`, icon: <Search className="w-4 h-4" />, onClick: () => dispatch({ type: 'SET_VIEWPORT', payload: { zoom: 1, panX, panY } }) },
        { label: 'Aumentar zoom', icon: <ZoomIn className="w-4 h-4" />, onClick: () => dispatch({ type: 'SET_VIEWPORT', payload: { zoom: Math.min(3, zoom * 1.2), panX, panY } }) },
        { label: 'Ajuda Rápida', icon: <HelpCircle className="w-4 h-4" />, onClick: () => setShowHelp(true) },
        { label: 'Manual', icon: <BookOpen className="w-4 h-4" />, onClick: () => setShowManual(true) },
      ],
    },
  ]

  return (
    <>
      <div className="flex items-center gap-1.5 px-1.5 py-1 border-b border-gray-200 bg-white select-none overflow-x-auto">
        {onChangeView && (
          <ToolbarSelect<WbsViewMode>
            title="Visualização"
            value={viewMode}
            onChange={onChangeView}
            options={[
              { value: 'chart', label: 'EAP (gráfico)', icon: <Network className="w-5 h-5" /> },
              { value: 'details', label: 'EAP com detalhes', icon: <Table2 className="w-5 h-5" /> },
              { value: 'costs', label: 'Horas e custos', icon: <Coins className="w-5 h-5" />, disabled: !canViewCosts, hint: 'Sem permissão para ver custos' },
              { value: 'gantt', label: 'Gantt', icon: <ChartGantt className="w-5 h-5" /> },
            ]}
          />
        )}

        {cards.map(card => card.title === 'Organizar' ? (
          <ToolbarSelect
            key={card.title}
            title={modoFase ? 'Organizar fase' : 'Organizar'}
            value={modoFase ? formatoFases : formatoEap}
            disabled={!root || !canEdit}
            onChange={layout => {
              if (modoFase) for (const f of fasesSelecionadas) dispatch({ type: 'SET_LAYOUT', payload: { nodeId: f.id, layout } })
              else dispatch({ type: 'SET_EAP_FORMAT', payload: { layout } })
            }}
            options={(modoFase ? OPCOES_FASE : OPCOES_ORGANIZAR).map(o => ({
              ...o, icon: <IconeOrganizar layout={modoFase && o.value === 'LADO_A_LADO' ? formatoEap : o.value} size={28} />,
            }))}
          />
        ) : (
          <ToolbarCard key={card.title} title={card.title} items={card.items} />
        ))}
        {/* Sync indicator */}
        <div className="flex items-center pl-1">
          <Tooltip label={sync.label}>
            <span
              className="flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 bg-white shadow-sm text-xs cursor-default"
              aria-label={sync.label}
            >
              <span style={{ color: sync.color }}>{sync.icon}</span>
            </span>
          </Tooltip>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".wbs,.json"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Quick help modal */}
      <Modal isOpen={showHelp} onClose={() => setShowHelp(false)} title="Atalhos de teclado" maxWidth="max-w-lg">
        <ShortcutsTable />
      </Modal>

      {/* Manual modal */}
      <Modal isOpen={showManual} onClose={() => setShowManual(false)} title="Manual — EAP" maxWidth="max-w-3xl">
        <ManualContent />
      </Modal>
    </>
  )
}
