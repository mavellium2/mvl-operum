import type { Metadata } from 'next'
import ConfiguracoesNav from '@/components/configuracoes/ConfiguracoesNav'
import SettingsContent from '@/components/configuracoes/SettingsContent'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import './settings.css'

export const metadata: Metadata = { title: { default: 'Configurações', template: '%s · Configurações | Operum' } }

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProjectAppearance enabled>
      <div className="settings-shell min-h-screen">
        <div className="settings-frame mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
          <header className="settings-heading mb-5 flex items-center">
            <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
          </header>
          <div className="settings-body flex flex-col items-start gap-4 md:flex-row md:gap-5">
            <ConfiguracoesNav />
            <SettingsContent>{children}</SettingsContent>
          </div>
        </div>
      </div>
    </ProjectAppearance>
  )
}
