import type { ReactNode } from 'react'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import CadastrosNavigation from '@/components/admin/CadastrosNavigation'
import './cadastros.css'

export default function CadastrosLayout({ children }: { children: ReactNode }) {
  return <ProjectAppearance enabled><div className="catalog-shell mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6"><CadastrosNavigation />{children}</div></ProjectAppearance>
}
