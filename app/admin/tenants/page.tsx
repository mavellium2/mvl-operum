import { verifySession } from '@/lib/dal'
import { listTenants } from '@/services/tenantService'
import { getMyTenantsAction } from '@/app/actions/auth'
import AdminTenantsClient from '@/components/admin/AdminTenantsClient'
import { redirect } from 'next/navigation'
import { ehOperadorDaPlataforma } from '@/lib/platformOperator'
import Link from 'next/link'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Instituições' }

export default async function AdminTenantsPage() {
  const { userId } = await verifySession()

  // Instituições é do operador da plataforma (ADR-060), não do admin de uma instituição.
  if (!(await ehOperadorDaPlataforma(userId))) {
    redirect('/projetos')
  }

  const [tenants, myTenants] = await Promise.all([
    listTenants(userId),
    getMyTenantsAction(),
  ])
  
  const myTenantIds = myTenants.map(t => t.tenantId)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/admin" 
              className="p-2 -ml-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
              aria-label="Voltar para configuração"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Instituições</h1>
              <p className="text-sm text-gray-500 mt-0.5">Gerencie as empresas e o isolamento de dados da plataforma</p>
            </div>
          </div>
          
          {/* O slot da direita fica disponível para ações globais */}
          <div className="flex items-center gap-3">
             {/* Ações de header entram aqui */}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AdminTenantsClient
          initialTenants={tenants as Parameters<typeof AdminTenantsClient>[0]['initialTenants']}
          myTenantIds={myTenantIds}
        />
      </main>
    </div>
  )
}