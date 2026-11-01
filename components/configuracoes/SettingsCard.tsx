import GlassCard from '@/components/ui/GlassCard'
import type { ComponentProps } from 'react'

/** Mesmo material do editor, compartilhado pelas seções de configurações. */
export default function SettingsCard({ className = '', ...props }: ComponentProps<typeof GlassCard>) {
  return <GlassCard interactive {...props} className={`settings-card p-6 sm:p-7 ${className}`} />
}
