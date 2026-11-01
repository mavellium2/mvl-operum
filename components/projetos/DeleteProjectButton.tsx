'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteProjetoAction, verificarExclusaoProjetoAction } from '@/app/actions/projetos'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

type Dependencia = { tipo: string; quantidade: number; rotulo: string }

export default function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bloqueio, setBloqueio] = useState<{ motivo: string; dependencias: Dependencia[] } | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  // Valida as dependências antes de perguntar: só confirma quando a exclusão é possível.
  const handleClick = () => {
    startTransition(async () => {
      const check = await verificarExclusaoProjetoAction(id)
      if ('error' in check) {
        toast(check.error || 'Erro ao verificar o projeto', 'error')
        return
      }
      if (!check.podeExcluir) {
        setBloqueio({ motivo: check.motivo ?? '', dependencias: check.dependencias ?? [] })
        return
      }
      setConfirmOpen(true)
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteProjetoAction(id)
      if ('error' in result) {
        if ('dependencias' in result && result.dependencias?.length) {
          setBloqueio({ motivo: result.error ?? '', dependencias: result.dependencias })
          return
        }
        toast(result.error || 'Erro ao excluir projeto', 'error')
        return
      }
      toast('Projeto excluído com sucesso', 'success')
      router.refresh()
    })
  }

  return (
    <>
      <OperumButton variant="danger"
        type="button"
        onClick={handleClick}
        disabled={isPending}
        title="Excluir projeto"
        aria-label={`Excluir projeto ${name}`}
        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors disabled:opacity-50"
      >
        {isPending ? (
          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        )}
      </OperumButton>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Excluir projeto"
        message={`Tem certeza que deseja excluir o projeto "${name}"? O projeto não tem dependências vinculadas.`}
      />

      <Modal isOpen={bloqueio !== null} onClose={() => setBloqueio(null)} title="Não é possível excluir o projeto">
        <p className="text-gray-600 mb-3">
          O projeto <strong>{name}</strong> ainda tem itens vinculados:
        </p>
        <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 space-y-1">
          {bloqueio?.dependencias.map(d => <li key={d.tipo}>{d.rotulo}</li>)}
        </ul>
        <p className="text-sm text-gray-500 mb-6">Exclua, mova ou desvincule esses itens e tente novamente.</p>
        <div className="flex justify-end">
          <Button variant="primary" autoFocus onClick={() => setBloqueio(null)}>Entendi</Button>
        </div>
      </Modal>
    </>
  )
}
