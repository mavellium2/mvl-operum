'use client'

import OperumButton from '@/components/ui/GlassButton'
import Select from '@/components/ui/Select'
import { useEffect, useState, useTransition } from 'react'
import { listarAjustesUsuarioAction, salvarAjusteUsuarioAction } from '@/app/actions/permissoes'
import { PERMISSOES, type Permissao } from '@/lib/permissoes'
import type { AjustesDoUsuario, EfeitoAjuste } from '@/services/permissoesService'

export default function PermissoesUsuario({ userId, projectId }: { userId: string; projectId: string | null }) {
  // O pai deve remontar o editor ao trocar de pessoa/escopo (key).
  const [dados, setDados] = useState<AjustesDoUsuario | null>(null)
  const [erro, setErro] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    let ativo = true
    listarAjustesUsuarioAction(userId, projectId).then(r => {
      if (!ativo) return
      if ('error' in r) setErro(r.error)
      else { setDados(r); setErro('') }
    }).catch(() => { if (ativo) setErro('Não foi possível carregar as permissões.') })
    return () => { ativo = false }
  }, [userId, projectId, tentativa])

  function alterar(permissao: Permissao, efeito: EfeitoAjuste | null) {
    setErro(''); setMensagem('')
    startTransition(async () => {
      try {
        const r = await salvarAjusteUsuarioAction({ userId, projectId, permissao, efeito })
        if ('error' in r) { setErro(r.error); return }
        setDados(prev => {
          if (!prev) return prev
          const ajustes = { ...prev.ajustes }
          if (efeito === null) delete ajustes[permissao]
          else ajustes[permissao] = efeito
          return { ...prev, ajustes }
        })
        setMensagem('Ajuste salvo.')
      } catch { setErro('Não foi possível salvar. O ajuste anterior foi mantido.') }
    })
  }
  return <section aria-label="Permissões do usuário" className="space-y-3 text-sm">
    <h3 className="font-semibold text-gray-900">Permissões {projectId ? 'neste projeto' : 'globais'}</h3>
    <p className="text-gray-600">{projectId ? 'Os ajustes deste projeto prevalecem sobre os globais. Herdar remove o ajuste neste projeto.' : 'Valem em todos os projetos dos quais a pessoa é membro ativo. A permissão herdada depende das funções em cada projeto.'} Administradores sempre têm acesso completo.</p>
    {erro && <p role="alert" className="text-red-700">{erro}</p>}
    {mensagem && <p role="status" className="text-green-700">{mensagem}</p>}
    {!dados ? erro ? <OperumButton variant="default" type="button" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</OperumButton> : <p role="status">Carregando permissões…</p> :
      <fieldset disabled={pending} className="space-y-2">
        <legend className="sr-only">Ajustes por permissão</legend>
        {PERMISSOES.map(p => <label key={p.chave} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-2">
          <span>{p.grupo} · {p.rotulo}<span className="block text-xs text-gray-500">Herdada: {dados.herdadas === null ? 'varia por projeto' : dados.herdadas.includes(p.chave) ? 'permitida' : 'negada'}</span></span>
          <Select ariaLabel={p.rotulo} className="w-40" searchable={false} disabled={pending} placeholder="Herdar" value={dados.ajustes[p.chave] ?? ''} onChange={v => alterar(p.chave, (v || null) as EfeitoAjuste | null)}
            options={[{ value: '', label: 'Herdar' }, { value: 'GRANT', label: 'Conceder' }, { value: 'DENY', label: 'Negar' }]} />
        </label>)}
      </fieldset>}
  </section>
}
