'use client'

import AnimatedTrashButton from '@/components/ui/AnimatedTrashButton'
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
      <AnimatedTrashButton label={`Excluir projeto ${name}`} disabled={isPending} effect="button" onDelete={handleClick} />

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
