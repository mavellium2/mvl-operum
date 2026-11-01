import SettingsCard from '@/components/configuracoes/SettingsCard'
import type { Metadata } from 'next'
import { verifySession } from '@/lib/dal'
import UserTenantsList from '@/components/UserTenantsList'

export const metadata: Metadata = { title: 'Instituições' }

export default async function InstituicoesPage() {
  const session = await verifySession()
  return (
    <SettingsCard>
      <h2 className="text-base font-semibold text-gray-900 mb-4">Minhas instituições</h2>
      <p className="mb-5 text-sm text-gray-500">Gerencie a instituição ativa ou acesse outra conta vinculada a você.</p>
      <UserTenantsList canEditCurrent={session.role === 'admin'} />
    </SettingsCard>
  )
}
