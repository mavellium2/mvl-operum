import { getUserProfileAction } from '@/app/actions/profile'
import ProfileForm from '@/components/profile/ProfileForm'
import SignatureUpload from '@/components/profile/SignatureUpload'
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
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="flex-1 w-full">
            <h2 className="text-xl font-semibold text-gray-900">{profile.name}</h2>
            <p className="text-sm text-gray-500 mb-2">{profile.email}</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 mt-3">
              {profile.phone && (
                <p className="text-sm text-gray-700 flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  {formatTelefone(profile.phone)}
                </p>
              )}
              {(profile.logradouro || profile.cidade) && (
                <p className="text-sm text-gray-700 flex items-center gap-1.5 col-span-1 sm:col-span-2 mt-1">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <span className="truncate">
                    {[profile.logradouro, profile.numero, profile.bairro, profile.cidade, profile.estado].filter(Boolean).join(', ')}
                  </span>
                </p>
              )}
            </div>

            {profile.notes && (
              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Observações</p>
                <p className="text-sm text-slate-700 italic">&quot;{profile.notes}&quot;</p>
              </div>
            )}

            </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Dados pessoais</h2>
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
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Assinatura digital</h2>
        <SignatureUpload signatureUrl={profile.signatureUrl} />
      </div>
    </>
  )
}
