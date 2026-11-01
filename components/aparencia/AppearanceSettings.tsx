'use client'

import { useState } from 'react'
import { Sunrise, Sun, Sunset, Moon, Monitor } from 'lucide-react'
import { useAppearance } from '@/hooks/useAppearance'
import type { AppearanceMode } from '@/lib/appearance'

const options = [
  { value: 'automatic', title: 'Ao longo do dia', description: 'O Operum acompanha seu horário, da manhã à noite.', Icon: Sunrise, gradient: 'from-sky-200 via-orange-100 to-slate-800' },
  { value: 'light', title: 'Sempre claro', description: 'Luz suave e tons claros em qualquer horário.', Icon: Sun, gradient: 'from-sky-100 to-white' },
  { value: 'afternoon', title: 'Sempre tarde', description: 'Vidro em tons quentes da tarde em qualquer horário.', Icon: Sunset, gradient: 'from-[#d8ddef] via-[#eadbd6] to-[#f4d6b4]' },
  { value: 'dark', title: 'Sempre escuro', description: 'Superfícies escuras e brilho visual reduzido.', Icon: Moon, gradient: 'from-[#0a1234] via-[#192554] to-[#45256c]' },
  { value: 'system', title: 'Seguir o sistema', description: 'Usa a preferência clara ou escura do dispositivo.', Icon: Monitor, gradient: 'from-slate-100 via-slate-400 to-slate-900' },
] as const

export default function AppearanceSettings() {
  const { mode, period, save } = useAppearance()
  const [error, setError] = useState('')
  const change = (value: AppearanceMode) => {
    setError(save(value) ? '' : 'Não foi possível salvar. Verifique se o navegador permite armazenamento local.')
  }
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Aparência</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Um ambiente que acompanha o seu dia. Por enquanto, esta preferência se aplica à tela Editar Projeto.</p>
    <fieldset className="mt-6 grid gap-3 sm:grid-cols-2">
      <legend className="mb-3 text-sm font-medium text-slate-700">Escolha como você quer ver o Operum</legend>
      {options.map(({ value, title, description, Icon, gradient }) => <label key={value}
        className={`relative cursor-pointer rounded-2xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-blue-500 ${mode === value ? 'border-blue-500 bg-blue-50/60' : 'border-slate-200 hover:bg-slate-50'}`}>
        <div aria-hidden="true" className={`mb-3 h-20 rounded-xl bg-gradient-to-br ${gradient} p-3`}>
          <div className="h-full w-3/4 rounded-lg border border-white/40 bg-white/20 p-2 backdrop-blur-sm"><div className="mb-2 h-1.5 w-2/3 rounded bg-white/60" /><div className="h-1.5 w-1/2 rounded bg-white/40" /></div>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon size={16} /><span className="flex-1">{title}</span><input type="radio" name="appearance" value={value} checked={mode === value} onChange={() => change(value)} disabled={!period} className="accent-blue-600" /></div>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
      </label>)}
    </fieldset>
    <p role="status" className="mt-5 text-sm text-slate-600">{period ? `Agora: ${period === 'morning' ? 'manhã' : period === 'afternoon' ? 'tarde' : 'noite'}. Preferência salva automaticamente neste navegador.` : 'Carregando preferência…'}</p>
    <p className="mt-2 text-xs leading-relaxed text-slate-500">Automático: manhã das 6h às 12h · tarde das 12h às 18h · noite das 18h às 6h. Usa o horário do dispositivo. Não sincroniza entre dispositivos.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>
}
