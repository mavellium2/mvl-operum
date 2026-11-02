'use client'

import OperumButton from '@/components/ui/GlassButton'
import GlassCard from '@/components/ui/GlassCard'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'
import SearchInput from '@/components/ui/SearchInput'
import { matchesSearch } from '@/lib/search'
import { ChevronDown, ShieldCheck, LoaderCircle } from 'lucide-react'
import './PermissoesUsuario.css'
import { useEffect, useState, useTransition } from 'react'
import { listarAjustesUsuarioAction, salvarAjusteUsuarioAction } from '@/app/actions/permissoes'
import { PERMISSOES, type Permissao } from '@/lib/permissoes'
import type { AjustesDoUsuario, EfeitoAjuste } from '@/services/permissoesService'

export default function PermissoesUsuario({ userId, projectId }: { userId: string; projectId: string | null }) {
  // O pai deve remontar o editor ao trocar de pessoa/escopo (key).
  const [dados, setDados] = useState<AjustesDoUsuario | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['Projeto']))
  const [query, setQuery] = useState('')
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
    if (pending) return
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
  const visible = PERMISSOES.filter(permission => matchesSearch(`${permission.grupo} ${permission.rotulo}`, query))
  const groups = [...new Set(visible.map(permission => permission.grupo))]
  const changed = dados ? Object.keys(dados.ajustes).length : 0
  return <section aria-label="Permissões do usuário" className="user-permissions">
    <div className="user-permissions-top">
      <div className="user-permissions-scope"><ShieldCheck size={15} aria-hidden="true" /><span>{projectId ? 'Acessos neste projeto' : 'Acessos nos projetos'}</span><span className="user-permissions-count">{changed} personalizados</span></div>
      <SearchInput label="Pesquisar permissões do usuário" placeholder="Pesquisar acesso…" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="user-permissions-status" role="status" aria-live="polite">{pending ? <><LoaderCircle size={12} className="animate-spin" aria-hidden="true" />Salvando ajuste…</> : mensagem || 'Alterações salvas automaticamente'}</div>
    </div>
    {erro && <p role="alert" className="user-permissions-error">{erro}</p>}
    {!dados ? erro ? <OperumButton onClick={() => setTentativa(t => t + 1)}>Tentar novamente</OperumButton> : <p role="status" className="user-permissions-loading">Carregando permissões…</p> : <>
      <p className="user-permissions-help">Herdar segue as funções da pessoa{projectId ? ' e os ajustes gerais' : ' em cada projeto'}. Permitir e negar criam uma exceção.</p>
      <fieldset disabled={pending} className="user-permissions-groups"><legend className="sr-only">Ajustes por permissão</legend>
        {groups.map(group => {
          const permissions = visible.filter(permission => permission.grupo === group)
          const custom = permissions.filter(permission => dados.ajustes[permission.chave]).length
          return <GlassCard key={group} className="user-permission-group"><details open={Boolean(query) || expanded.has(group)}>
            <summary onClick={event => { event.preventDefault(); setExpanded(previous => { const next = new Set(previous); if (next.has(group)) next.delete(group); else next.add(group); return next }) }}><span>{group}</span><span className="user-permission-group-count">{permissions.length} acessos{custom ? ` · ${custom} ajustados` : ''}</span><ChevronDown size={14} aria-hidden="true" /></summary>
            <div>{permissions.map(permission => {
              const effect = dados.ajustes[permission.chave] ?? ''
              const inherited = dados.herdadas === null ? 'Conforme o projeto' : dados.herdadas.includes(permission.chave) ? 'Permitido pelas funções' : 'Sem acesso pelas funções'
              return <div key={permission.chave} className="user-permission-item" data-effect={effect}>
                <div><h3>{permission.rotulo}</h3><span>{effect === 'GRANT' ? 'Exceção: acesso permitido' : effect === 'DENY' ? 'Exceção: acesso negado' : inherited}</span></div>
                <GlassSegmentedControl variant="compact" label={permission.rotulo} value={effect} onChange={value => alterar(permission.chave, (value || null) as EfeitoAjuste | null)} options={[{ value: '', label: 'Herdar' }, { value: 'GRANT', label: 'Permitir' }, { value: 'DENY', label: 'Negar' }]} />
              </div>
            })}</div>
          </details></GlassCard>
        })}
        {!visible.length && <p className="user-permissions-loading">Nenhum acesso encontrado. Tente outro termo.</p>}
      </fieldset>
    </>}
  </section>
}
