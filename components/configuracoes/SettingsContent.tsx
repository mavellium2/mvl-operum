'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

/** Reinicia a entrada dos cards ao mudar de seção, mantendo a navegação estável. */
export default function SettingsContent({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return <div key={pathname} id="settings-content" className="settings-content min-w-0 w-full flex-1 space-y-5">{children}</div>
}
