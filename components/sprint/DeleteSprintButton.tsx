'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Textarea as OperumTextarea } from '@/components/ui/Field'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSprintAction, getSprintExclusaoInfoAction } from '@/app/actions/sprints'

const MOTIVO_MINIMO = 5
const horas = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`

interface Props {
  sprintId: string
  sprintName: string
  projectId: string
}

export default function DeleteSprintButton({ sprintId, sprintName, projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  const [info, setInfo] = useState<{ cards: number; segundosRegistrados: number; exigeMotivo: boolean } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  // Sprint com dados (cards ou horas): a exclusão exige justificar o motivo.
  useEffect(() => {
    if (!open) return
    let ativo = true
    getSprintExclusaoInfoAction(sprintId).then(r => {
      if (!ativo) return
      if ('error' in r) setErro(r.error ?? 'Erro ao consultar a sprint')
      else setInfo(r)
    })
    return () => { ativo = false }
  }, [open, sprintId])
  const faltaMotivo = !!info?.exigeMotivo && motivo.trim().length < MOTIVO_MINIMO

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteSprintAction(sprintId, projectId, motivo)
      if ('error' in result) { setErro(result.error ?? 'Erro ao excluir sprint'); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <OperumButton variant="custom" type="button"
        onClick={e => { e.preventDefault(); setInfo(null); setMotivo(''); setErro(null); setOpen(true) }}
        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover/sprint:opacity-100"
        title="Excluir sprint"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </OperumButton>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Excluir sprint</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Tem certeza que deseja excluir <span className="font-medium text-gray-700">&quot;{sprintName}&quot;</span>? Cards incompletos voltarão para o Backlog do projeto.
                </p>
              </div>
            </div>

            {info?.exigeMotivo && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Esta sprint tem dados: {info.cards} card{info.cards === 1 ? '' : 's'}{info.segundosRegistrados > 0 ? ` e ${horas(info.segundosRegistrados)} registradas` : ''}. A exclusão fica no histórico de alterações.
                </p>
                <label htmlFor={`motivo-${sprintId}`} className="text-sm font-medium text-gray-700">Motivo da exclusão *</label>
                <OperumTextarea
                  id={`motivo-${sprintId}`}
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Por que esta sprint está sendo excluída?"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
            )}
            {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}

            <div className="flex gap-3 justify-end">
              <OperumButton variant="danger" type="button"
                onClick={handleDelete}
                disabled={isPending || !info || faltaMotivo}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {isPending ? 'Excluindo…' : 'Sim, excluir'}
              </OperumButton>
              <OperumButton variant="primary" type="button"
                ref={cancelRef}
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Não, cancelar
              </OperumButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
