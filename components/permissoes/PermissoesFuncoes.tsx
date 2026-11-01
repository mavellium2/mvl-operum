'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { useEffect, useState, useTransition } from 'react'
import { listarPermissoesFuncoesAction, salvarPermissoesFuncaoAction, restaurarPadraoFuncaoAction } from '@/app/actions/permissoes'
import { PERMISSOES, type Permissao } from '@/lib/permissoes'
import type { FuncaoComPermissoes } from '@/services/permissoesService'

export default function PermissoesFuncoes() {
  const [funcoes, setFuncoes] = useState<FuncaoComPermissoes[] | null>(null)
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
  if (!funcoes) return <section className="rounded-xl border bg-white p-5" aria-label="Permissões por função">
    {erro ? <><p role="alert">{erro}</p><OperumButton variant="default" type="button" onClick={() => setTentativa(t => t + 1)}>Tentar novamente</OperumButton></> : <p role="status">Carregando permissões…</p>}
  </section>
  return <section className="space-y-3" aria-label="Permissões por função">
    <h2 className="text-lg font-semibold text-gray-900">Permissões por função</h2>
    <p className="text-sm text-gray-600">A base Membro do projeto vale para todos os membros. As funções acrescentam permissões; os ajustes do usuário podem conceder ou negar acesso. O administrador sempre tem acesso completo.</p>
    {funcoes.map(f => <EditorFuncao key={f.tipo === 'base' ? 'base' : f.id} funcao={f} onSaved={setFuncoes} />)}
  </section>
}

function EditorFuncao({ funcao, onSaved }: { funcao: FuncaoComPermissoes; onSaved: (f: FuncaoComPermissoes[]) => void }) {
  const [selecionadas, setSelecionadas] = useState<Permissao[]>(funcao.permissoes)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [pending, startTransition] = useTransition()
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
        onSaved(r.funcoes)
        setMensagem('Permissões salvas.')
      } catch { setErro('Não foi possível salvar. Suas escolhas foram preservadas; tente novamente.') }
    })
  }
  return <details className="rounded-xl border border-gray-200 bg-white p-4">
    <summary className="cursor-pointer font-medium text-gray-900">{funcao.nome} — {funcao.definidasEm ? 'Personalizadas' : 'Padrão'}</summary>
    <fieldset disabled={pending} className="mt-4 space-y-4">
      <legend className="sr-only">Permissões de {funcao.nome}</legend>
      {[...new Set(PERMISSOES.map(p => p.grupo))].map(grupo => <div key={grupo}>
        <h3 className="mb-2 text-sm font-semibold">{grupo}</h3>
        {PERMISSOES.filter(p => p.grupo === grupo).map(p => <label key={p.chave} className="flex items-center gap-2 py-1 text-sm text-gray-700">
          <input type="checkbox" checked={selecionadas.includes(p.chave)} onChange={e => setSelecionadas(prev => e.target.checked ? [...prev, p.chave] : prev.filter(k => k !== p.chave))} />
          {p.rotulo}
        </label>)}
      </div>)}
      <FormActions className="flex gap-3">
        <OperumButton variant="primary" type="button" onClick={() => salvar()} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">{pending ? 'Salvando…' : 'Salvar permissões'}</OperumButton>
        {funcao.definidasEm && <OperumButton variant="default" type="button" onClick={() => salvar(true)} className="rounded-lg border px-3 py-2 text-sm">Restaurar padrão</OperumButton>}
      </FormActions>
    </fieldset>
    {erro && <p role="alert" className="mt-2 text-sm text-red-700">{erro}</p>}
    {mensagem && <p role="status" className="mt-2 text-sm text-green-700">{mensagem}</p>}
  </details>
}
