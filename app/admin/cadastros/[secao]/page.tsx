import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import AdminCadastrosClient from '@/components/admin/AdminCadastrosClient'
import { notFound } from 'next/navigation'
import { SECOES_CADASTROS, type SecaoCadastros } from '@/lib/cadastrosSecoes'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Cadastros Globais' }

export default async function AdminCadastrosPage({ params }: { params: Promise<{ secao: string }> }) {
  const { secao } = await params
  if (!SECOES_CADASTROS.includes(secao as SecaoCadastros)) notFound()
  const { tenantId } = await verifySession()

  const [departments, roles] = await Promise.all([
    prisma.department.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    }),
    prisma.role.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, scope: true, description: true },
    }),
  ])

  return <AdminCadastrosClient departamentosIniciais={departments} funcoesIniciais={roles} section={secao as SecaoCadastros} />
}
