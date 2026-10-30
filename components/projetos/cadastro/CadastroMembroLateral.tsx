'use client'

import { useEffect, useState } from 'react'
import ProjetoStakeholdersClient, { type StakeholderUnificado } from '@/components/projetos/ProjetoStakeholdersClient'
import { carregarCadastroStakeholdersAction } from '@/app/actions/cadastroStakeholders'
import Drawer from '@/components/ui/Drawer'

type Dados = NonNullable<Awaited<ReturnType<typeof carregarCadastroStakeholdersAction>>['dados']>

/** Abre o MESMO cadastro interno de Stakeholders e devolve a pessoa ao campo que o abriu. */
export default function CadastroMembroLateral({ projetoId, onClose, onSelecionado }: {
  projetoId: string
  onClose: () => void
  onSelecionado: (pessoa: StakeholderUnificado) => void
}) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let ativo = true
    void carregarCadastroStakeholdersAction(projetoId).then(result => {
      if (!ativo) return
      if (result.dados) setDados(result.dados)
      else setErro(result.error ?? 'Não foi possível carregar os membros')
    }).catch(() => { if (ativo) setErro('Não foi possível carregar os membros. Tente novamente.') })
    return () => { ativo = false }
  }, [projetoId, tentativa])

  if (dados) return <ProjetoStakeholdersClient
    projetoId={projetoId}
    {...dados}
    painel={{ modo: 'interno', iniciarCriacao: dados.userRole === 'admin', onFechar: onClose, onAlterado: () => {}, onSelecionado }}
  />

  return <Drawer isOpen onClose={onClose} title="Adicionar membro da equipe" width="w-[448px]">
    <div className="p-5">
      {erro ? <><p role="alert" className="text-sm text-red-700">{erro}</p><button type="button" className="mt-3 text-sm font-medium text-blue-700" onClick={() => { setErro(''); setTentativa(n => n + 1) }}>Tentar novamente</button></> : <p role="status" className="text-sm text-slate-500">Carregando cadastro de membros…</p>}
    </div>
  </Drawer>
}
