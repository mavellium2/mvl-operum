'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import OperumCloseButton from '@/components/ui/GlassCloseButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useState } from 'react'
import { updateSprintMetaAction } from '@/app/actions/sprintBoard'
import DateInput from '@/components/ui/DateInput'

interface Sprint {
  id: string
  name: string
  startDate?: string | Date | null
  endDate?: string | Date | null
}

interface Props {
  sprint: Sprint
  onClose: () => void
  onUpdated: (sprint: { name: string; startDate: string | null; endDate: string | null }) => void
}

function toDateInputValue(d: string | Date | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toISOString().slice(0, 10)
}

export default function EditSprintModal({ sprint, onClose, onUpdated }: Props) {
  const [name, setName] = useState(sprint.name)
  const [startDate, setStartDate] = useState(toDateInputValue(sprint.startDate))
  const [endDate, setEndDate] = useState(toDateInputValue(sprint.endDate))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('O nome da sprint é obrigatório.')
      return
    }
    setLoading(true)
    const result = await updateSprintMetaAction(sprint.id, {
      name: name.trim(),
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
    })
    setLoading(false)
    if ('error' in result) {
      setError(result.error ?? 'Erro desconhecido')
      return
    }
    onUpdated({
      name: name.trim(),
      startDate: startDate || null,
      endDate: endDate || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Background overlay para clicar fora e fechar (opcional) */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Container Principal do Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Configurações da Sprint</h2>
          <OperumCloseButton onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
            label="Fechar" />
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 min-h-0">
          
          {/* Campo Nome */}
          <div>
            <label htmlFor="sprint-name" className="block text-sm font-medium text-gray-700 mb-1.5">
              Nome da Sprint <span className="text-red-500">*</span>
            </label>
            <OperumInput
              id="sprint-name"
              type="text"
              value={name}
              placeholder="Ex: Sprint 1 - Autenticação"
              onChange={e => { setName(e.target.value); setError('') }}
              className={`w-full px-4 py-2.5 border rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all ${
                error ? 'border-red-300 focus:border-red-500 bg-red-50/30' : 'border-gray-200 focus:border-blue-500 bg-white'
              }`}
            />
            {error && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{error}</p>}
          </div>

          {/* Campos de Data (Grid lado a lado) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sprint-start" className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Início
              </label>
              <DateInput
                id="sprint-start"
                value={startDate}
                onChange={setStartDate}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
              />
            </div>

            <div>
              <label htmlFor="sprint-end" className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Fim
              </label>
              <DateInput
                id="sprint-end"
                value={endDate}
                onChange={setEndDate}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white"
              />
            </div>
          </div>

          {/* Rodapé de Ações */}
          <FormActions className="flex items-center justify-end gap-3 pt-6 mt-2 border-t border-gray-100">
            <OperumButton variant="default"
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 text-sm transition-colors focus:outline-none"
            >
              Cancelar
            </OperumButton>
            <OperumButton variant="primary"
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-70 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </OperumButton>
          </FormActions>
        </form>
      </div>
    </div>
  )
}