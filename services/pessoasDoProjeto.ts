import 'server-only'
import type { Prisma } from '@/lib/generated/prisma'
import prisma from '@/lib/prisma'
import { separarFuncoes } from '@/lib/funcoes'

/**
 * Uma pessoa, um cadastro: a conta do sistema (User) e o contato (Stakeholder)
 * da mesma pessoa ficam ligados por Stakeholder.userId. Em cada projeto a pessoa
 * é interna (membro da equipe, com acesso: UserProject ativo) ou externa (parte
 * interessada sem acesso: ProjectStakeholder) — nunca as duas no mesmo projeto.
 *
 * As funções daqui não conferem permissão: quem chama exige `projeto:equipe`.
 */

type Tx = Prisma.TransactionClient

export class PessoaError extends Error {}

/** Dados do projeto que valem para interno e externo. */
export interface DadosNoProjeto {
  remuneracao?: number | null
  horasDiarias?: number | null
  funcoes?: string[]
  departamentos?: string[]
}

// Mesma regra das funções do membro: "A | B" são duas, sem repetidas.
const nomes = (lista?: string[]) => separarFuncoes(lista ?? []).slice(0, 30)

/** Contato da conta (cria a partir dos dados da conta na primeira vez). */
export async function garantirContatoDoUsuario(tx: Tx, tenantId: string, userId: string) {
  const existente = await tx.stakeholder.findFirst({ where: { userId, tenantId } })
  if (existente) return existente
  const u = await tx.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null },
    select: { name: true, email: true, phone: true, avatarUrl: true, cep: true, logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, estado: true, notes: true },
  })
  if (!u) throw new PessoaError('Usuário não encontrado nesta instituição.')
  return tx.stakeholder.create({
    data: {
      tenantId, userId, name: u.name, email: u.email, phone: u.phone, logoUrl: u.avatarUrl,
      cep: u.cep, logradouro: u.logradouro, numero: u.numero, complemento: u.complemento,
      bairro: u.bairro, cidade: u.cidade, estado: u.estado, notes: u.notes,
    },
  })
}

async function proximaOrdem(tx: Tx, projectId: string) {
  const ultimo = await tx.projectStakeholder.findFirst({ where: { projectId }, orderBy: { order: 'desc' }, select: { order: true } })
  return (ultimo?.order ?? -1) + 1
}

async function membroAtivo(tx: Tx, projectId: string, userId: string) {
  return tx.userProject.findFirst({ where: { projectId, userId, active: true } })
}

/** Usa uma conta do sistema como parte interessada externa do projeto (sem dar acesso). */
export async function adicionarUsuarioComoExterno(tenantId: string, projectId: string, userId: string) {
  return prisma.$transaction(async tx => {
    if (await membroAtivo(tx, projectId, userId)) throw new PessoaError('Esta pessoa já é interna neste projeto. Use "Mudar para externo".')
    const contato = await garantirContatoDoUsuario(tx, tenantId, userId)
    await tx.projectStakeholder.upsert({
      where: { projectId_stakeholderId: { projectId, stakeholderId: contato.id } },
      create: { projectId, stakeholderId: contato.id, order: await proximaOrdem(tx, projectId) },
      update: {},
    })
    return contato
  })
}

/**
 * Interno → externo no projeto: a pessoa sai da equipe (perde o acesso a este
 * projeto) e entra nas partes interessadas, levando remuneração, horas, funções
 * e departamento. O gerente não pode ser trocado sem antes passar a gerência.
 */
export async function tornarExterno(tenantId: string, projectId: string, userId: string) {
  return prisma.$transaction(async tx => {
    const membro = await tx.userProject.findFirst({
      where: { projectId, userId, user: { tenantId, deletedAt: null } },
      include: { department: { select: { name: true } } },
    })
    if (!membro) throw new PessoaError('Esta pessoa não está na equipe deste projeto.')
    const gerente = await tx.userProjectRole.findFirst({ where: { userId, projectId, deletedAt: null, role: { is: { nameKey: 'gerente', scope: 'PROJETO' } } } })
    if (gerente) throw new PessoaError('O gerente do projeto não pode virar externo. Passe a gerência para outra pessoa antes.')
    const contato = await garantirContatoDoUsuario(tx, tenantId, userId)
    const dados = {
      remuneracao: membro.remuneracao, horasDiarias: membro.horasDiarias,
      funcoes: nomes((membro.role ?? '').split(',')), departamentos: nomes(membro.department?.name ? [membro.department.name] : []),
    }
    await tx.projectStakeholder.upsert({
      where: { projectId_stakeholderId: { projectId, stakeholderId: contato.id } },
      create: { projectId, stakeholderId: contato.id, order: await proximaOrdem(tx, projectId), ...dados },
      update: dados,
    })
    // Mesmo efeito do "desvincular": sem motivo, sai também da lista de membros.
    await tx.userProject.update({ where: { id: membro.id }, data: { active: false, inactiveReason: null, inactivatedAt: null } })
    return contato
  })
}

/**
 * Contato → interno no projeto: precisa de uma conta do sistema. Sem conta ligada,
 * `novoUserId` é a conta recém-criada pelo administrador para essa pessoa.
 * Sai das partes interessadas externas deste projeto, levando remuneração e horas.
 */
export async function tornarInterno(tenantId: string, projectId: string, stakeholderId: string, novoUserId?: string) {
  return prisma.$transaction(async tx => {
    const contato = await tx.stakeholder.findFirst({ where: { id: stakeholderId, tenantId } })
    if (!contato) throw new PessoaError('Contato não encontrado.')
    let userId = contato.userId
    if (!userId) {
      if (!novoUserId) throw new PessoaError('SEM_CONTA')
      const conta = await tx.user.findFirst({ where: { id: novoUserId, tenantId, deletedAt: null }, select: { id: true } })
      if (!conta) throw new PessoaError('Conta não encontrada nesta instituição.')
      if (await tx.stakeholder.findFirst({ where: { userId: novoUserId, id: { not: contato.id } }, select: { id: true } })) {
        throw new PessoaError('Esta conta já está ligada a outro contato.')
      }
      await tx.stakeholder.update({ where: { id: contato.id }, data: { userId: novoUserId } })
      userId = novoUserId
    }
    const vinculo = await tx.projectStakeholder.findUnique({ where: { projectId_stakeholderId: { projectId, stakeholderId } } })
    const levar = vinculo
      ? {
        ...(vinculo.remuneracao != null ? { remuneracao: vinculo.remuneracao } : {}),
        ...(vinculo.horasDiarias != null ? { horasDiarias: vinculo.horasDiarias } : {}),
        ...(vinculo.remuneracao != null && vinculo.horasDiarias ? { hourlyRate: vinculo.remuneracao / 30 / vinculo.horasDiarias } : {}),
      }
      : {}
    await tx.userProject.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { userId, projectId, ...levar },
      update: { active: true, inactiveReason: null, inactivatedAt: null, endDate: null, ...levar },
    })
    if (vinculo) await tx.projectStakeholder.delete({ where: { id: vinculo.id } })
    return { userId }
  })
}

/** Remuneração, horas, funções e departamentos do externo neste projeto. */
export async function salvarDadosDoExterno(tenantId: string, projectId: string, stakeholderId: string, dados: DadosNoProjeto) {
  const vinculo = await prisma.projectStakeholder.findFirst({ where: { projectId, stakeholderId, stakeholder: { tenantId } } })
  if (!vinculo) throw new PessoaError('Esta pessoa não é parte interessada deste projeto.')
  return prisma.projectStakeholder.update({
    where: { id: vinculo.id },
    data: {
      ...(dados.remuneracao !== undefined ? { remuneracao: dados.remuneracao } : {}),
      ...(dados.horasDiarias !== undefined ? { horasDiarias: dados.horasDiarias } : {}),
      ...(dados.funcoes !== undefined ? { funcoes: nomes(dados.funcoes) } : {}),
      ...(dados.departamentos !== undefined ? { departamentos: nomes(dados.departamentos) } : {}),
    },
  })
}

/** Empresa e competência também para quem é interno (ficam no contato da pessoa). */
export async function salvarEmpresaDoUsuario(tenantId: string, userId: string, empresa: { company?: string | null; competence?: string | null }) {
  return prisma.$transaction(async tx => {
    const contato = await garantirContatoDoUsuario(tx, tenantId, userId)
    return tx.stakeholder.update({
      where: { id: contato.id },
      data: {
        ...(empresa.company !== undefined ? { company: empresa.company?.trim().slice(0, 200) || null } : {}),
        ...(empresa.competence !== undefined ? { competence: empresa.competence?.trim().slice(0, 200) || null } : {}),
      },
    })
  })
}
