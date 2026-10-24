import type { Metadata } from 'next'
import UserTenantsList from '@/components/UserTenantsList'

export const metadata: Metadata = { title: 'Instituições' }

export default function InstituicoesPage() {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Minhas instituições</h2>
      <UserTenantsList />
    </section>
  )
}
