'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { Suspense, useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams, useParams } from 'next/navigation'
import { createSprintAction } from '@/app/actions/sprints'
import { getProjetosAction } from '@/app/actions/projetos'
import Link from 'next/link'
import DateInput from '@/components/ui/DateInput'
import { sprintPath } from '@/lib/sprintPath'

interface Projeto {
  id: string
  name: string
}

export default function NovaSprintPage() {
  return (
    <Suspense>
      <NovaSprintForm />
    </Suspense>
  )
}

function NovaSprintForm() {
  const permissions = useProjectPermissions()
  const canCreate = permissions.has('quadro:sprints')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { projetoId: projetoIdFromPath } = useParams<{ projetoId?: string }>()
  const presetProjetoId = projetoIdFromPath ?? searchParams.get('projetoId') ?? ''

  const [isPending, startTransition] = useTransition()
  const [_projetos, setProjetos] = useState<Projeto[]>([])
  const [form, setForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    projectId: presetProjetoId,
  })
  const [error, setError] = useState('')

  useEffect(() => {
    getProjetosAction().then(result => {
      if (Array.isArray(result)) {
        setProjetos(result.map(p => ({ id: p.id, name: p.name })))
      }
    })
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canCreate) return
    setError('')
    const name = form.name.trim()
    if (!name) {
      setError('Nome é obrigatório.')
      return
    }
    startTransition(async () => {
      const result = await createSprintAction(undefined, {
        name,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        projectId: form.projectId || undefined,
      })
      if ('error' in result) {
        setError(result.error ?? 'Erro ao criar sprint')
        return
      }
      router.push(sprintPath(result.sprint.id, form.projectId))
    })
  }

  const backHref = presetProjetoId ? `/projetos/${presetProjetoId}/sprints` : '/projetos'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href={backHref} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Nova Sprint</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <OperumInput
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Sprint 1 — Módulo de Autenticação"
                autoFocus
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data início</label>
                <DateInput
                  value={form.startDate}
                  onChange={v => setForm(f => ({ ...f, startDate: v }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
                <DateInput
                  value={form.endDate}
                  onChange={v => setForm(f => ({ ...f, endDate: v }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3 pt-2">
              <Link
                href={backHref}
                className="flex-1 text-center px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50"
              >
                Cancelar
              </Link>
              <OperumButton variant="primary"
                type="submit"
                disabled={isPending || !canCreate}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? 'Criando…' : 'Criar Sprint'}
              </OperumButton>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
