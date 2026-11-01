'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import Select from '@/components/ui/Select'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useState, useRef, useEffect } from 'react'
import { sprintDashboardPath } from '@/lib/sprintPath'
import { FILTROS_PADRAO, filtrosAtivos, type CardFilters, type FiltroPrazo } from '@/lib/cardFilters'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updateSprintMetaAction } from '@/app/actions/sprintBoard'
import BoardActionMenu from '@/components/board/BoardActionMenu'
import Modal from '@/components/ui/Modal'
import { CsvImportModal } from '@/components/csv/CsvImportModal'
import { TagManager } from '@/components/tag/TagManager'
import EditSprintModal from './EditSprintModal'

interface CurrentUser {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
}

interface Tag {
  id: string
  name: string
  color: string
}

interface SprintHeaderProps {
  sprint: {
    id: string
    name: string
    status: 'PLANNED' | 'ACTIVE' | 'COMPLETED'
    startDate: Date | string | null
    endDate: Date | string | null
    description?: string | null
    qualidade?: number | null
    dificuldade?: number | null
  }
  currentUser?: CurrentUser | null
  tags?: Tag[]
  // NOVA PROP: Para avisar a tela principal que o fundo mudou
  onChangeBackground?: (bg: string) => void
  /** Projeto da sprint: o dashboard abre dentro do projeto (menu do projeto). */
  projectId?: string | null
  /** Filtros do quadro (aplicados na hora; sem eles o botão Filtros fica oculto). */
  filters?: CardFilters
  onFiltersChange?: (filters: CardFilters) => void
}

const STATUS_LABELS: Record<string, string> = {
  PLANNED: 'Planejada',
  ACTIVE: 'Ativa',
  COMPLETED: 'Concluída',
}

const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-600 border-gray-200',
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

// PRESETS PARA O LAYOUT DO BOARD
const PRESET_COLORS = [
  'bg-slate-100', 'bg-blue-50', 'bg-indigo-50', 'bg-emerald-50', 'bg-rose-50',
  'bg-amber-50', 'bg-purple-50', 'bg-gray-900', 'bg-blue-900', 'bg-emerald-900'
]

const PRESET_IMAGES = [
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80', // Praia
  'https://images.unsplash.com/photo-1518655048521-f130df041f66?auto=format&fit=crop&w=1000&q=80', // Abstrato
  'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=1000&q=80', // Escuro
  'https://images.unsplash.com/photo-1557682250-33bd709cbe85?auto=format&fit=crop&w=1000&q=80'  // Gradiente
]

function formatDate(d: Date | string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function SprintHeader({ sprint, tags = [], onChangeBackground, projectId, filters, onFiltersChange, currentUser }: SprintHeaderProps) {
  const permissions = useProjectPermissions()
  const canManage = permissions.has('quadro:sprints')
  const router = useRouter()

  const [saving, setSaving] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [editSprintOpen, setEditSprintOpen] = useState(false)

  // NOVOS ESTADOS PARA FILTRO E LAYOUT
  const [filterOpen, setFilterOpen] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [layoutTab, setLayoutTab] = useState<'color' | 'image'>('color')
  const [customImageUrl, setCustomImageUrl] = useState('')

  const [sprintDates, setSprintDates] = useState({
    startDate: sprint.startDate,
    endDate: sprint.endDate,
  })

  const [editingName, setEditingName] = useState(false)
  const [sprintName, setSprintName] = useState(sprint.name)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Fechar popover de filtros ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (editingName) nameInputRef.current?.select()
  }, [editingName])

  async function handleSaveName() {
    const trimmed = sprintName.trim()
    if (!trimmed || trimmed === sprint.name) {
      setSprintName(sprint.name)
      setEditingName(false)
      return
    }
    setSaving(true)
    await updateSprintMetaAction(sprint.id, { name: trimmed })
    setSaving(false)
    setEditingName(false)
  }

  function applyBackground(bg: string) {
    if (onChangeBackground) onChangeBackground(bg)
  }

  return (
    <>
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 h-16">

          {/* LADO ESQUERDO: Voltar, Título e Meta */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <OperumButton variant="custom" type="button"
              onClick={() => router.back()}
              className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Voltar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
            </OperumButton>

            <div className="h-6 w-px bg-gray-200 hidden sm:block mx-1"></div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 min-w-0">
              {editingName ? (
                <div className="relative flex items-center min-w-0">
                  <OperumInput
                    ref={nameInputRef}
                    value={sprintName}
                    onChange={e => setSprintName(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveName()
                      if (e.key === 'Escape') { setSprintName(sprint.name); setEditingName(false) }
                    }}
                    className="text-lg sm:text-xl font-bold text-gray-900 bg-blue-50/50 border border-blue-200 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px] w-full transition-all"
                  />
                  <div className="absolute right-2 flex items-center">
                    {saving && <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0 group cursor-pointer" onClick={() => { if (canManage) setEditingName(true) }}>
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                    {sprintName}
                  </h1>
                  <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              )}

              <div className="flex items-center gap-2 mt-1 sm:mt-0">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border uppercase tracking-wider shrink-0 ${STATUS_COLORS[sprint.status]}`}>
                  {STATUS_LABELS[sprint.status]}
                </span>

                {(sprintDates.startDate || sprintDates.endDate) && (
                  <>
                    <span className="text-gray-300 text-xs hidden sm:block">•</span>
                    <div className="flex items-center text-xs font-medium text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 shrink-0">
                      <svg className="w-3 h-3 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {formatDate(sprintDates.startDate)} <span className="mx-1 text-gray-400">→</span> {formatDate(sprintDates.endDate)}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* LADO DIREITO: Ações */}
          <div className="flex items-center gap-2 shrink-0 ml-4">

            {/* Filtros do quadro */}
            {filters && onFiltersChange && (
            <div className="relative" ref={filterRef}>
              <OperumButton variant="custom" type="button"
                onClick={() => setFilterOpen(!filterOpen)}
                aria-expanded={filterOpen}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${filterOpen || filtrosAtivos(filters) ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 hover:bg-gray-50 border-gray-200'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                Filtros
                {filtrosAtivos(filters) && <span className="w-1.5 h-1.5 rounded-full bg-blue-600" aria-label="filtros ativos" />}
              </OperumButton>

              {filterOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50 animate-in fade-in slide-in-from-top-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Filtrar cards</h4>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="filtro-responsavel" className="text-sm font-medium text-gray-700 mb-1.5 block">Responsável</label>
                      <Select
                        id="filtro-responsavel"
                        searchable={false}
                        value={filters.responsavel}
                        onChange={v => onFiltersChange({ ...filters, responsavel: v as CardFilters['responsavel'] })}
                        options={[{ value: 'todos', label: 'Qualquer um' }, { value: 'meus', label: 'Atribuídos a mim', disabled: !currentUser }]}
                      />
                    </div>
                    <div>
                      <label htmlFor="filtro-tag" className="text-sm font-medium text-gray-700 mb-1.5 block">Etiqueta</label>
                      <Select
                        id="filtro-tag"
                        value={filters.tagId ?? ''}
                        onChange={v => onFiltersChange({ ...filters, tagId: v || null })}
                        placeholder="Qualquer etiqueta"
                        options={[{ value: '', label: 'Qualquer etiqueta' }, ...tags.map(t => ({ value: t.id, label: t.name }))]}
                      />
                    </div>
                    <div>
                      <label htmlFor="filtro-prazo" className="text-sm font-medium text-gray-700 mb-1.5 block">Prazo</label>
                      <Select
                        id="filtro-prazo"
                        searchable={false}
                        value={filters.prazo}
                        onChange={v => onFiltersChange({ ...filters, prazo: v as FiltroPrazo })}
                        options={[{ value: 'todos', label: 'Qualquer prazo' }, { value: 'semana', label: 'Vence esta semana' }, { value: 'atrasados', label: 'Atrasados' }, { value: 'sem_prazo', label: 'Sem prazo' }]}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={filters.ordenarPorPrazo}
                        onChange={e => onFiltersChange({ ...filters, ordenarPorPrazo: e.target.checked })}
                        className="rounded border-gray-300"
                      />
                      Ordenar por prazo
                    </label>
                    {filtrosAtivos(filters) && (
                      <>
                        <p className="text-[11px] text-gray-400">Com filtros ativos, arrastar cards fica desativado.</p>
                        <OperumButton variant="default"
                          type="button"
                          onClick={() => onFiltersChange(FILTROS_PADRAO)}
                          className="w-full py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          Limpar filtros
                        </OperumButton>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            )}

            <Link
              href={sprintDashboardPath(sprint.id, projectId)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 rounded-lg text-sm font-medium transition-colors border border-indigo-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              Dashboard
            </Link>

            <OperumButton variant="custom" type="button"
              disabled={!canManage}
              onClick={() => setEditSprintOpen(true)}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none"
              title="Configurações da Sprint"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </OperumButton>

            <div className="h-6 w-px bg-gray-200 mx-1"></div>

            {/* AÇÃO DO LAYOUT PASSADA VIA PROP PARA O MENU */}
            <BoardActionMenu
              onImportCsv={permissions.has('quadro:cards') ? () => setCsvOpen(true) : undefined}
              onCreateSprint={() => {}}
              onManageTags={permissions.has('quadro:cards') ? () => setTagOpen(true) : undefined}
              onChangeLayout={() => setLayoutOpen(true)} // <--- AQUI
            />
          </div>
        </div>
      </header>

      {/* MODAL DE ALTERAR LAYOUT */}
      <Modal isOpen={layoutOpen} onClose={() => setLayoutOpen(false)} title="Personalizar Layout">
        <div className="space-y-6">
          <div className="flex border-b border-gray-200">
            <OperumButton variant="default" type="button"
              onClick={() => setLayoutTab('color')}
              className={`pb-2 px-4 text-sm font-medium ${layoutTab === 'color' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Cores Sólidas
            </OperumButton>
            <OperumButton variant="default" type="button"
              onClick={() => setLayoutTab('image')}
              className={`pb-2 px-4 text-sm font-medium ${layoutTab === 'image' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Imagens
            </OperumButton>
          </div>

          {layoutTab === 'color' && (
            <div className="grid grid-cols-5 gap-3">
              {PRESET_COLORS.map(color => (
                <OperumButton variant="custom" type="button"
                  key={color}
                  onClick={() => applyBackground(color)}
                  className={`w-full aspect-square rounded-xl shadow-sm border border-black/5 hover:scale-105 transition-transform ${color}`}
                  aria-label={`Mudar para cor ${color}`}
                />
              ))}
            </div>
          )}

          {layoutTab === 'image' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {PRESET_IMAGES.map((img, i) => (
                  <OperumButton variant="default" type="button"
                    key={i}
                    onClick={() => applyBackground(`url(${img})`)}
                    className="w-full h-24 rounded-xl shadow-sm overflow-hidden border border-black/5 hover:scale-[1.02] transition-transform relative"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={`Fundo ${i}`} className="w-full h-full object-cover" />
                  </OperumButton>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">Ou cole a URL de uma imagem:</label>
                <div className="flex gap-2">
                  <OperumInput
                    type="url"
                    value={customImageUrl}
                    onChange={e => setCustomImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 text-sm border-gray-200 rounded-lg p-2"
                  />
                  <OperumButton variant="primary" type="button"
                    onClick={() => { if(customImageUrl) applyBackground(`url(${customImageUrl})`) }}
                    className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    Aplicar
                  </OperumButton>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <CsvImportModal isOpen={csvOpen} onClose={() => setCsvOpen(false)} sprintId={sprint.id} />

      {editSprintOpen && (
        <EditSprintModal
          sprint={{ ...sprint, ...sprintDates, name: sprintName }}
          onClose={() => setEditSprintOpen(false)}
          onUpdated={data => {
            setSprintName(data.name)
            setSprintDates({ startDate: data.startDate, endDate: data.endDate })
          }}
        />
      )}

      <Modal isOpen={tagOpen} onClose={() => setTagOpen(false)} title="Gerenciar Tags">
        <TagManager tags={tags} />
      </Modal>
    </>
  )
}
