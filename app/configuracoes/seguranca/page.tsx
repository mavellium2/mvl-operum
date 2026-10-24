import type { Metadata } from 'next'
import ChangePasswordForm from '@/components/profile/ChangePasswordForm'

export const metadata: Metadata = { title: 'Segurança' }

export default function SegurancaPage() {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Alterar senha</h2>
      <ChangePasswordForm />
    </section>
  )
}
