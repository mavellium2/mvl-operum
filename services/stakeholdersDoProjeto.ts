import 'server-only'
import { getProjectRoleForMember } from '@/services/projectRoleService'
import { nomesUnicosDeFuncoes } from '@/lib/funcoesDedupe'
import prisma from '@/lib/prisma'
import { findById } from '@/services/projectAccess'
import type {
  StakeholderUnificado,
  UsuarioDisponivel,
  StakeholderExterno,
} from '@/components/projetos/ProjetoStakeholdersClient'

/**
 * Dados do cadastro de Stakeholders do projeto (lista, diretórios de internos e
 * externos, funções e departamentos). Usado pela tela Stakeholders e pelo
 * "Adicionar parte interessada" do documento, que reaproveita o mesmo cadastro.
 * Quem chama confere a permissão (projeto:equipe).
 */
export async function carregarStakeholdersDoProjeto(tenantId: string, projetoId: string) {
  const [project, projectStakeholders, allGlobalStakeholders, userProjects, allUsers, rolesDb, departmentsDb] =
    await Promise.all([
      findById(projetoId),
      prisma.projectStakeholder.findMany({
        where: { projectId: projetoId },
        include: { stakeholder: true },
        orderBy: { order: 'asc' },
      }),
      prisma.stakeholder.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.userProject.findMany({
        // Inativados com motivo continuam na lista (em vermelho); desvinculados não.
        where: { projectId: projetoId, OR: [{ active: true }, { inactiveReason: { not: null } }] },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              role: true,
              phone: true,
              cep: true,
              logradouro: true,
              numero: true,
              complemento: true,
              bairro: true,
              cidade: true,
              estado: true,
              notes: true,
              deletedAt: true,
              isActive: true,
              signatureUrl: true,
            },
          },
          department: { select: { name: true } },
        },
        orderBy: { order: 'asc' },
      }),
      prisma.user.findMany({
        where: { tenantId, deletedAt: null, isActive: true },
        select: { id: true, name: true, email: true, avatarUrl: true, role: true },
        orderBy: { name: 'asc' },
      }),
      prisma.role.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true, nameKey: true, scope: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
      prisma.department.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ])

  if (!project) return null

  // ── External stakeholders
  const linkedStakeholderIds = new Set(projectStakeholders.map(ps => ps.stakeholderId))

  const stakeholdersDisponiveis: StakeholderExterno[] = allGlobalStakeholders
    .filter(s => !linkedStakeholderIds.has(s.id))
    .map(s => ({
      id: s.id,
      tenantId: s.tenantId,
      name: s.name,
      logoUrl: s.logoUrl,
      company: s.company,
      competence: s.competence,
      email: s.email,
      phone: s.phone,
      cep: s.cep,
      logradouro: s.logradouro,
      numero: s.numero,
      complemento: s.complemento,
      bairro: s.bairro,
      cidade: s.cidade,
      estado: s.estado,
      notes: s.notes,
      isActive: s.isActive,
    }))

  // ── Internal members
  const memberUserIds = new Set(userProjects.map(up => up.userId))

  const usuariosDisponiveis: UsuarioDisponivel[] = allUsers
    .filter(u => !memberUserIds.has(u.id))
    .map(u => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: u.role }))

  // ── Build unified list — fetch gerente roles in parallel
  const membrosComRole = await Promise.all(
    userProjects
      .filter(up => up.user.deletedAt === null && up.user.isActive)
      .map(async (up): Promise<StakeholderUnificado> => {
        const projectRole = await getProjectRoleForMember(up.userId, projetoId)
        const cargos = up.role
          ? up.role.split(',').map((s: string) => s.trim()).filter(Boolean)
          : []

        return {
          id: up.userId,
          tipo: 'interno',
          userId: up.userId,
          name: up.user.name,
          email: up.user.email,
          avatarUrl: up.user.avatarUrl,
          phone: up.user.phone,
          cep: up.user.cep,
          logradouro: up.user.logradouro,
          numero: up.user.numero,
          complemento: up.user.complemento,
          bairro: up.user.bairro,
          cidade: up.user.cidade,
          estado: up.user.estado,
          notes: up.user.notes,
          cargos,
          departamento: up.department?.name ? [up.department.name] : [],
          isGerente: projectRole === 'gerente',
          hourlyRate: up.hourlyRate,
          remuneracao: up.remuneracao,
          horasDiarias: up.horasDiarias,
          startDate: up.startDate.toISOString(),
          userRole: up.user.role,
          signatureUrl: up.user.signatureUrl,
          isActive: up.active,
          inactiveReason: up.active ? null : up.inactiveReason,
          inactivatedAt: up.active ? null : up.inactivatedAt?.toISOString() ?? null,
        }
      }),
  )

  const stakeholdersExternos: StakeholderUnificado[] = projectStakeholders.map(ps => ({
    id: ps.stakeholder.id,
    tipo: 'externo',
    stakeholderId: ps.stakeholder.id,
    tenantId: ps.stakeholder.tenantId,
    name: ps.stakeholder.name,
    email: ps.stakeholder.email,
    avatarUrl: ps.stakeholder.logoUrl,
    phone: ps.stakeholder.phone,
    cep: ps.stakeholder.cep,
    logradouro: ps.stakeholder.logradouro,
    numero: ps.stakeholder.numero,
    complemento: ps.stakeholder.complemento,
    bairro: ps.stakeholder.bairro,
    cidade: ps.stakeholder.cidade,
    estado: ps.stakeholder.estado,
    notes: ps.stakeholder.notes,
    company: ps.stakeholder.company,
    competence: ps.stakeholder.competence,
    isActive: ps.stakeholder.isActive,
    inactiveReason: ps.stakeholder.inactiveReason,
    inactivatedAt: ps.stakeholder.inactivatedAt?.toISOString() ?? null,
  }))

  const todosStakeholders: StakeholderUnificado[] = [...membrosComRole, ...stakeholdersExternos]

  // Funções e departamentos são globais: todo o catálogo do tenant fica disponível em
  // qualquer projeto, sem precisar associar. Nomes equivalentes ("Gerente de Projeto(s)")
  // aparecem uma vez só.
  const funcoesDoProjeto = nomesUnicosDeFuncoes(rolesDb)
  const departamentosDoProjeto = departmentsDb.map(d => d.name)

  return {
    stakeholders: todosStakeholders,
    stakeholdersDisponiveis,
    usuariosDisponiveis,
    funcoesExistentes: funcoesDoProjeto,
    departamentosExistentes: departamentosDoProjeto,
  }
}
