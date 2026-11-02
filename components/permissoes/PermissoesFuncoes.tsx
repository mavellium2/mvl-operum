'use client'

import { CheckCircle2, ChevronUp, Undo2 } from 'lucide-react'
import ChangesPanel from '@/components/ui/ChangesPanel'
import Switch from '@/components/ui/Switch'
import GlassCard from '@/components/ui/GlassCard'
import Select from '@/components/ui/Select'
import FormActions, { FormBody } from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { listarPermissoesFuncoesAction, salvarPermissoesFuncaoAction, restaurarPadraoFuncaoAction } from '@/app/actions/permissoes'
import { PERMISSOES, type Permissao } from '@/lib/permissoes'
import type { FuncaoComPermissoes } from '@/services/permissoesService'

export default function PermissoesFuncoes({ selectedRole, onRoleChange }: { selectedRole?: string; onRoleChange?: (id: string) => void } = {}) {
  const [funcoes, setFuncoes] = useState<FuncaoComPermissoes[] | null>(null)
  const [localSelected, setLocalSelected] = useState('base')
  const selected = selectedRole ?? localSelected
  const setSelected = onRoleChange ?? setLocalSelected
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let ativo = true
    listarPermissoesFuncoesAction().then(r => {
      if (!ativo) return
      if ('error' in r) setErro(r.error)
      else { setFuncoes(r.funcoes); setErro('') }
    }).catch(() => { if (ativo) setErro('Não foi possível carregar as permissões.') })
    return () => { ativo = false }
  }, [tentativa])
  if (!funcoes) return <GlassCard className="p-5" aria-label="Acessos da equipe">
    {erro ? <><p role="alert">{erro}</p><OperumButton variant="default" type="button" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</OperumButton></> : <p role="status">Carregando permissões…</p>}
  </GlassCard>
  const current = funcoes.some(f => (f.id ?? 'base') === selected) ? selected : 'base'
  return <GlassCard className="catalog-permissions permission-container p-4" aria-label="Acessos da equipe">
    {funcoes.map(f => <div className="permission-panel" key={f.id ?? 'base'} hidden={(f.id ?? 'base') !== current}><EditorFuncao active={(f.id ?? 'base') === current} funcao={f} onSaved={setFuncoes} toolbar={<Select ariaLabel="Função ou acesso base" value={current} onChange={setSelected} options={funcoes.map(item => ({ value: item.id ?? 'base', label: item.nome }))} />} /></div>)}
  </GlassCard>

}

function EditorFuncao({ funcao, onSaved, toolbar, active }: { active: boolean; funcao: FuncaoComPermissoes; onSaved: (f: FuncaoComPermissoes[]) => void; toolbar: ReactNode }) {
  const [selecionadas, setSelecionadas] = useState<Permissao[]>(funcao.permissoes)
  const [changesAnchor, setChangesAnchor] = useState<{ left: number; bottom: number; width: number }>()
  const [changesVisited, setChangesVisited] = useState(false)
  const [verAlteracoes, setVerAlteracoes] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [pending, startTransition] = useTransition()
  const quantidadeAlteracoes = PERMISSOES.filter(p => selecionadas.includes(p.chave) !== funcao.permissoes.includes(p.chave)).length
  const alteradas = selecionadas.length !== funcao.permissoes.length || selecionadas.some(p => !funcao.permissoes.includes(p))
  function salvar(restaurar = false) {
    setErro(''); setMensagem('')
    startTransition(async () => {
      try {
        const r = restaurar && funcao.id
          ? await restaurarPadraoFuncaoAction(funcao.id)
          : await salvarPermissoesFuncaoAction({ roleId: funcao.id, permissoes: selecionadas })
        if ('error' in r) { setErro(r.error); return }
        const atualizada = r.funcoes.find(f => funcao.tipo === 'base' ? f.tipo === 'base' : f.id === funcao.id)
        if (atualizada) setSelecionadas(atualizada.permissoes)
        setVerAlteracoes(false); setChangesVisited(false)
        onSaved(r.funcoes)
        setMensagem('Permissões salvas.')
      } catch { setErro('Não foi possível salvar. Suas escolhas foram preservadas; tente novamente.') }
    })
  }
  return <div className="permission-editor">
    {alteradas && <ChangesPanel context={{ type: 'permissions', id: funcao.id ?? 'base', label: funcao.nome }} floating visited={changesVisited} anchor={changesAnchor} open={active && verAlteracoes} changes={PERMISSOES.filter(p => selecionadas.includes(p.chave) !== funcao.permissoes.includes(p.chave)).map(p => ({ chave: p.chave, rotulo: p.rotulo, antes: funcao.permissoes.includes(p.chave) ? 'Ativado' : 'Desativado', depois: selecionadas.includes(p.chave) ? 'Ativado' : 'Desativado' }))} onClose={() => setVerAlteracoes(false)} onUndo={key => { const next = funcao.permissoes.includes(key as Permissao) ? [...new Set([...selecionadas, key as Permissao])] : selecionadas.filter(item => item !== key); setSelecionadas(next); if (next.length === funcao.permissoes.length && next.every(item => funcao.permissoes.includes(item))) { setVerAlteracoes(false); setChangesVisited(false) } setMensagem(''); setErro('') }} />}

    <div className="permission-toolbar mb-3 flex shrink-0 items-center gap-3"><div className="min-w-0 flex-1">{toolbar}</div><div className="permission-bulk-actions flex shrink-0 items-center gap-1"><OperumButton disabled={pending || selecionadas.length === PERMISSOES.length} onClick={() => { setSelecionadas(PERMISSOES.map(p => p.chave)); setMensagem(''); setErro('') }} className="permission-bulk-button text-xs">Selecionar todos</OperumButton>
        <OperumButton disabled={pending || selecionadas.length === 0} onClick={() => { setSelecionadas([]); setMensagem(''); setErro('') }} className="permission-bulk-button text-xs">Limpar seleção</OperumButton></div><span className="permission-count shrink-0 text-xs">{selecionadas.length} de {PERMISSOES.length} acessos</span></div>
    <div role="group" aria-label={`Permissões de ${funcao.nome}`} className="permission-fields mt-0">
      <FormBody className="permission-groups">
      <div className="permission-columns">{[...new Set(PERMISSOES.map(p => p.grupo))].map(grupo => {
        const permissoes = PERMISSOES.filter(p => p.grupo === grupo)
        const total = permissoes.filter(p => selecionadas.includes(p.chave)).length
        return <div key={grupo} className="permission-group">
          <div className="mb-2 flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">{grupo}</h3><p className="mt-0.5 text-[11px] text-gray-500">{total} de {permissoes.length} ativos</p></div><Switch compact label={`Todos de ${grupo}`} checked={total === permissoes.length} disabled={pending} onCheckedChange={checked => {
            if (!alteradas) { setVerAlteracoes(false); setChangesVisited(false) }
            const keys = permissoes.map(p => p.chave)
            if (!alteradas) { setVerAlteracoes(false); setChangesVisited(false) }
            setSelecionadas(prev => checked ? [...new Set([...prev, ...keys])] : prev.filter(key => !keys.includes(key)))
            setMensagem(''); setErro('')
          }} /></div>
          {permissoes.map(p => <Switch key={p.chave} label={p.rotulo} checked={selecionadas.includes(p.chave)} disabled={pending} onCheckedChange={checked => {
            if (!alteradas) { setVerAlteracoes(false); setChangesVisited(false) }
            setSelecionadas(prev => checked ? [...new Set([...prev, p.chave])] : prev.filter(key => key !== p.chave))
            setMensagem(''); setErro('')
          }} />)}
        </div>
      })}</div></FormBody>
      <FormActions surface="none" className="permission-actions flex flex-wrap gap-2">
        <OperumButton variant="custom" className="permission-save-status" aria-label={alteradas ? `${quantidadeAlteracoes} ${quantidadeAlteracoes === 1 ? 'alteração não salva' : 'alterações não salvas'}` : 'Tudo salvo'} data-pending={alteradas || undefined} disabled={!alteradas || pending} aria-expanded={verAlteracoes && alteradas} onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          const width = Math.min(680, window.innerWidth - 32)
          const left = Math.max(16, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 16))
          setChangesAnchor({ left, bottom: window.innerHeight - rect.top + 12, width })
          setChangesVisited(true)
          setVerAlteracoes(value => !value)
        }}>{alteradas ? <><span className="permission-status-dot" aria-hidden="true" /><span className="permission-status-count">{quantidadeAlteracoes}</span><span>{quantidadeAlteracoes === 1 ? 'alteração não salva' : 'alterações não salvas'}</span><ChevronUp size={13} aria-hidden="true" className={verAlteracoes ? 'rotate-180' : ''} /></> : <><CheckCircle2 size={15} aria-hidden="true" /><span>Tudo salvo</span></>}</OperumButton>
        {alteradas && <OperumButton variant="danger" disabled={pending} onClick={() => { setSelecionadas(funcao.permissoes); setVerAlteracoes(false); setChangesVisited(false); setMensagem(''); setErro('') }} className="permission-discard text-xs"><Undo2 size={13} aria-hidden="true" />Descartar</OperumButton>}
        <OperumButton variant="primary" type="button" onClick={() => salvar()} disabled={pending || !alteradas} className="rounded-lg px-3 py-2 text-sm">{pending ? 'Salvando…' : 'Salvar permissões'}</OperumButton>
        {funcao.definidasEm && <OperumButton variant="default" type="button" onClick={() => salvar(true)} disabled={pending} className="rounded-lg border px-3 py-2 text-sm">Restaurar padrão</OperumButton>}
      </FormActions>
    </div>
    {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
    {mensagem && <p role="status" className="mt-2 text-sm text-green-700">{mensagem}</p>}
  </div>
}
