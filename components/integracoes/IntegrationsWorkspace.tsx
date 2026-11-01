'use client'

import { useId, useState, type ReactNode } from 'react'
import { Link2, ShieldCheck, Plug, KeyRound } from 'lucide-react'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'
import GlassButton from '@/components/ui/GlassButton'
import SearchInput from '@/components/ui/SearchInput'
import { IntegrationSearchContext } from './IntegrationSearch'
import SettingsCard from '@/components/configuracoes/SettingsCard'

type Section = 'discover' | 'connected' | 'tokens'

/** Separa descoberta, gestão de conexões e acesso avançado sem descartar formulários. */
export default function IntegrationsWorkspace({ available, connections, tokens, connectionCount, tokenCount }: {
  available: ReactNode; connections: ReactNode; tokens: ReactNode; connectionCount: number; tokenCount: number
}) {
  const [section, setSection] = useState<Section>(connectionCount > 0 ? 'connected' : 'discover')
  const [query, setQuery] = useState('')
  const uid = useId()
  const options = [
    { value: 'discover' as const, label: 'Conectar aplicativos', description: 'Escolha seu assistente' },
    { value: 'connected' as const, label: 'Apps conectados', description: `${connectionCount} ${connectionCount === 1 ? 'conexão ativa' : 'conexões ativas'}` },
    { value: 'tokens' as const, label: 'Acesso por token', description: `${tokenCount} ${tokenCount === 1 ? 'token ativo' : 'tokens ativos'}` },
  ].map(option => ({ ...option, id: `${uid}-${option.value}-tab`, panelId: `${uid}-${option.value}-panel` }))
  return <IntegrationSearchContext.Provider value={{ query, setQuery }}><div className="integrations-workspace">
    <SettingsCard className="integration-workspace-header">
      <div className="flex items-center gap-3"><span className="integration-intro-icon" aria-hidden="true"><Link2 size={21} strokeWidth={1.6} /></span><div><h2 className="text-xl font-semibold tracking-tight text-gray-900">Integrações</h2><p className="mt-1 text-sm text-gray-500">Conecte suas ferramentas e gerencie o acesso ao Operum.</p></div></div>
      <div className="mt-4"><SearchInput value={query} onChange={event => setQuery(event.target.value)} label="Pesquisar integrações" placeholder={section === 'discover' ? 'Buscar aplicativos…' : section === 'connected' ? 'Buscar apps conectados…' : 'Buscar tokens pelo nome…'} /></div>
      <GlassSegmentedControl<Section> options={options} value={section} onChange={setSection} label="Áreas de integrações" className="integration-area-tabs mt-5" />
    </SettingsCard>
    <div id={`${uid}-discover-panel`} role="tabpanel" aria-labelledby={`${uid}-discover-tab`} hidden={section !== 'discover'} tabIndex={0} className="integration-area-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-600">Escolha um aplicativo para ver o guia de conexão.</p><span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><ShieldCheck size={14} aria-hidden="true" />Você controla as permissões</span></div>
      {available}
    </div>
    <div id={`${uid}-connected-panel`} role="tabpanel" aria-labelledby={`${uid}-connected-tab`} hidden={section !== 'connected'} tabIndex={0} className="integration-area-panel">
      <SettingsCard>
        <div className="mb-5 flex items-start gap-3"><span className="settings-nav-icon" aria-hidden="true"><Plug size={17} /></span><div><h3 className="text-base font-semibold text-gray-900">Apps conectados</h3><p className="mt-1 text-sm leading-6 text-gray-500">Revise os aplicativos autorizados. Desconectar encerra o acesso imediatamente.</p></div></div>
        {connections}
        {connectionCount === 0 && <GlassButton className="mt-5" variant="primary" onClick={() => setSection('discover')}>Conectar um aplicativo</GlassButton>}
      </SettingsCard>
    </div>
    <div id={`${uid}-tokens-panel`} role="tabpanel" aria-labelledby={`${uid}-tokens-tab`} hidden={section !== 'tokens'} tabIndex={0} className="integration-area-panel">
      <SettingsCard>
        <div className="mb-5 flex items-start gap-3"><span className="settings-nav-icon" aria-hidden="true"><KeyRound size={17} /></span><div><h3 className="text-base font-semibold text-gray-900">Tokens de acesso pessoal</h3><p className="mt-1 text-sm leading-6 text-gray-500">Para ferramentas que pedem um token. Defina as permissões e a validade de cada acesso.</p><p className="mt-2 text-xs leading-5 text-gray-500">Se o aplicativo permite entrar com sua conta Operum, use a área Conectar aplicativos.</p></div></div>
        {tokens}
      </SettingsCard>
    </div>
  </div></IntegrationSearchContext.Provider>
}
