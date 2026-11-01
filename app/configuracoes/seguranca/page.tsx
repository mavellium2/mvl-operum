import SettingsCard from '@/components/configuracoes/SettingsCard'
import type { Metadata } from 'next'
import ChangePasswordForm from '@/components/profile/ChangePasswordForm'

export const metadata: Metadata = { title: 'Segurança' }

export default function SegurancaPage() {
  return (
    <SettingsCard>
      <h2 className="text-base font-semibold text-gray-900 mb-4">Alterar senha</h2>
      <ChangePasswordForm />
    </SettingsCard>
  )
}
