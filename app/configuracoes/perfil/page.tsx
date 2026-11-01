import SettingsCard from '@/components/configuracoes/SettingsCard'
import { getUserProfileAction } from '@/app/actions/profile'
import ProfileForm from '@/components/profile/ProfileForm'
import { formatTelefone } from '@/lib/contato'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Perfil' }

export default async function PerfilPage() {
  const result = await getUserProfileAction()
  const profile = 'profile' in result ? result.profile : null

  if (!profile) {
    return <p className="text-gray-500">Não foi possível carregar o perfil.</p>
  }

  return (
    <SettingsCard className="profile-settings-card">
      <ProfileForm
        name={profile.name}
        email={profile.email}
        phone={formatTelefone(profile.phone)}
        cep={profile.cep}
        logradouro={profile.logradouro}
        numero={profile.numero}
        complemento={profile.complemento}
        bairro={profile.bairro}
        cidade={profile.cidade}
        estado={profile.estado}
        notes={profile.notes}
        avatarUrl={profile.avatarUrl}
      />
    </SettingsCard>
  )
}
