'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useState, useTransition } from 'react'
import { repetirSincronizacaoAction } from '@/app/actions/sincronizacao'
import type { StatusSincronizacao as Status } from '@/services/sincronizacaoStatus'

interface Props {
  projectId: string
  inicial: Status | null
  podeSincronizar: boolean
  flutuante?: boolean
}

/** A atualização é automática; só interrompe a tela quando uma falha exige atenção. */
export default function StatusSincronizacao({ projectId, inicial, podeSincronizar, flutuante = false }: Props) {
  const [status, setStatus] = useState<Status | null>(inicial)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  if (status?.situacao !== 'FALHA' && !mensagem) return null

  function tentarNovamente() {
    setMensagem(null)
    startTransition(async () => {
      const result = await repetirSincronizacaoAction(projectId)
      if ('error' in result) {
        setMensagem(result.error)
        if (result.status) setStatus(result.status)
        return
      }
      setStatus(result.status)
    })
  }

  return (
    <section
      aria-label="Falha ao atualizar dados vinculados"
      className={`${flutuante ? 'fixed bottom-4 left-4 z-40 max-w-sm' : 'w-full'} rounded-xl border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-900 shadow-lg backdrop-blur-xl`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span role="alert" className="font-semibold">Não foi possível atualizar os dados vinculados.</span>
        {podeSincronizar && <OperumButton variant="custom" type="button" onClick={tentarNovamente} disabled={pendente} className="ml-auto text-xs font-semibold">
          {pendente ? 'Tentando…' : 'Tentar novamente'}
        </OperumButton>}
      </div>
      {(mensagem || status?.erro) && <p className="mt-1 text-xs opacity-85">{mensagem || status?.erro}</p>}
    </section>
  )
}
