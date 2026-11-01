import SettingsCard from '@/components/configuracoes/SettingsCard'
import type { Metadata } from 'next'
import { getUserProfileAction } from '@/app/actions/profile'
import SignatureUpload from '@/components/profile/SignatureUpload'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Assinatura' }

/** Assinatura do usuário: seção própria nas configurações, como Integrações. */
export default async function AssinaturaPage() {
  const result = await getUserProfileAction()
  const profile = 'profile' in result ? result.profile : null
  if (!profile) return <p role="alert" className="text-sm text-gray-500">Não foi possível carregar a assinatura. Recarregue a página para tentar novamente.</p>

  return (
    <SettingsCard aria-labelledby="titulo-assinatura">
      <h2 id="titulo-assinatura" className="mb-4 text-base font-semibold text-gray-900">Assinatura manuscrita</h2>
      <SignatureUpload signatureUrl={profile.signatureUrl} />
    </SettingsCard>
  )
}
