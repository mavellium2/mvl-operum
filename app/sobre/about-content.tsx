'use client'

import { useId, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import CopyConnectionValue from '@/components/integracoes/CopyConnectionValue'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'

type Area = 'overview' | 'updates'

export default function AboutContent({ version, overview, history }: { version?: string; overview: ReactNode; history: ReactNode }) {
  const [area, setArea] = useState<Area>('overview')
  const uid = useId()
  return <div className="about-shell min-h-screen">
    <div className="about-frame mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-7">
      <header className="about-heading mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><Image src="/icons/operum.svg" width={44} height={44} alt="" className="rounded-[14px]" /><div><h1 className="text-xl font-semibold tracking-tight">Sobre o Operum</h1><p className="mt-0.5 text-xs text-gray-500">Projetos, equipe e evolução do produto.</p></div></div>
        {version && <CopyConnectionValue value={`v${version}`} label="Versão do Operum" compact />}
      </header>
      <GlassSegmentedControl<Area> label="Áreas da página Sobre" value={area} onChange={setArea} options={[
        { value: 'overview', label: 'Visão geral', id: `${uid}-overview`, panelId: `${uid}-overview-panel` },
        { value: 'updates', label: 'Atualizações', id: `${uid}-updates`, panelId: `${uid}-updates-panel` },
      ]} className="about-tabs" />
      <div className="about-panel" role="tabpanel" id={`${uid}-overview-panel`} aria-labelledby={`${uid}-overview`} hidden={area !== 'overview'} tabIndex={0}>{overview}</div>
      <div className="about-panel" role="tabpanel" id={`${uid}-updates-panel`} aria-labelledby={`${uid}-updates`} hidden={area !== 'updates'} tabIndex={0}>{history}</div>
      <nav aria-label="Informações legais" className="about-legal mt-4 flex shrink-0 gap-5 text-xs"><Link className="about-link" href="/privacidade">Privacidade</Link><Link className="about-link" href="/termos">Termos de uso</Link></nav>
    </div>
  </div>
}
