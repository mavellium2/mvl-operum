import prisma from '@/lib/prisma'
import { linhaInstitucional } from '@/lib/linhaInstitucional'
import { departamentosDoProjeto } from '@/services/departamentosDoProjeto'
import { CriarAtaSchema, AtualizarAtaSchema } from '@/lib/validation/ataSchemas'
import type { CriarAtaInput, AtualizarAtaInput } from '@/lib/validation/ataSchemas'
import { NotFoundError, ConflictError } from '@/services/projetoCadastroService'

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export async function listarAtasPorProjeto(projetoId: string) {
  return prisma.ata.findMany({
    where: { projetoId, deletedAt: null },
    orderBy: [{ numero: 'desc' }],
    include: {
      presentes: { include: { user: { select: { id: true, name: true, signatureUrl: true } } } },
      acoes: { include: { responsavelUser: { select: { id: true, name: true, signatureUrl: true } } } },
      anexos: true,
    },
  })
}

export async function buscarAta(tenantId: string, ataId: string) {
  return prisma.ata.findFirst({
    where: { id: ataId, tenantId, deletedAt: null },
    include: {
      presentes: { include: { user: { select: { id: true, name: true, signatureUrl: true } } } },
      acoes: { include: { responsavelUser: { select: { id: true, name: true, signatureUrl: true } } } },
      anexos: true,
    },
  })
}

async function proximoNumero(projetoId: string): Promise<number> {
  const last = await prisma.ata.findFirst({
    where: { projetoId },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  })
  return (last?.numero ?? 0) + 1
}

export async function criarAta(tenantId: string, input: CriarAtaInput) {
  const parsed = CriarAtaSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)

  const d = parsed.data
  const projeto = await prisma.project.findFirst({
    where: { id: d.projetoId, tenantId },
    select: { id: true, name: true },
  })
  if (!projeto) throw new NotFoundError('Projeto não encontrado')

  return prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(d.projetoId)
    try {
      return await tx.ata.create({
        data: {
          tenantId,
          projetoId: d.projetoId,
          numero,
          nomeProjeto: projeto.name,
          instituicao: d.instituicao ?? undefined,
          local: d.local ?? undefined,
          data: dateOnly(new Date(d.data)),
          elaboradoPor: d.elaboradoPor,
          elaboradoPorUserId: d.elaboradoPorUserId ?? undefined,
          aprovadoPor: d.aprovadoPor ?? undefined,
          aprovadoPorUserId: d.aprovadoPorUserId ?? undefined,
          assuntosTratados: d.assuntosTratados ?? undefined,
          decisoesTomadas: d.decisoesTomadas ?? undefined,
          observacoes: d.observacoes ?? undefined,
          copiasPara: d.copiasPara,
          presentes: {
            create: d.presentes.map(p => ({
              nome: p.nome,
              setorEmpresa: p.setorEmpresa ?? undefined,
              userId: p.userId ?? undefined,
            })),
          },
          acoes: {
            create: d.acoes.map(a => ({
              acao: a.acao,
              prazo: a.prazo ? dateOnly(new Date(a.prazo)) : undefined,
              responsavel: a.responsavel ?? undefined,
              responsavelUserId: a.responsavelUserId ?? undefined,
            })),
          },
          anexos: {
            create: d.anexos.map(a => ({ nome: a.nome, url: a.url ?? undefined })),
          },
        },
        include: {
          presentes: { include: { user: { select: { id: true, name: true, signatureUrl: true } } } },
          acoes: { include: { responsavelUser: { select: { id: true, name: true, signatureUrl: true } } } },
          anexos: true,
        },
      })
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'P2002') throw new ConflictError('Número de ata conflitante. Tente novamente.')
      throw err
    }
  })
}

export async function atualizarAta(tenantId: string, ataId: string, input: AtualizarAtaInput) {
  const parsed = AtualizarAtaSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0].message)

  const d = parsed.data
  const existing = await prisma.ata.findFirst({ where: { id: ataId, tenantId, deletedAt: null } })
  if (!existing) throw new NotFoundError('Ata não encontrada')

  return prisma.$transaction(async (tx) => {
    await tx.ataPresente.deleteMany({ where: { ataId } })
    await tx.ataAcao.deleteMany({ where: { ataId } })
    await tx.ataAnexo.deleteMany({ where: { ataId } })

    return tx.ata.update({
      where: { id: ataId },
      data: {
        instituicao: d.instituicao ?? undefined,
          local: d.local ?? undefined,
        data: dateOnly(new Date(d.data)),
        elaboradoPor: d.elaboradoPor,
        elaboradoPorUserId: d.elaboradoPorUserId ?? undefined,
        aprovadoPor: d.aprovadoPor ?? undefined,
        aprovadoPorUserId: d.aprovadoPorUserId ?? undefined,
        assuntosTratados: d.assuntosTratados ?? undefined,
        decisoesTomadas: d.decisoesTomadas ?? undefined,
        observacoes: d.observacoes ?? undefined,
        copiasPara: d.copiasPara,
        presentes: {
          create: d.presentes.map(p => ({
            nome: p.nome,
            setorEmpresa: p.setorEmpresa ?? undefined,
            userId: p.userId ?? undefined,
          })),
        },
        acoes: {
          create: d.acoes.map(a => ({
            acao: a.acao,
            prazo: a.prazo ? dateOnly(new Date(a.prazo)) : undefined,
            responsavel: a.responsavel ?? undefined,
            responsavelUserId: a.responsavelUserId ?? undefined,
          })),
        },
        anexos: {
          create: d.anexos.map(a => ({ nome: a.nome, url: a.url ?? undefined })),
        },
      },
      include: {
        presentes: { include: { user: { select: { id: true, name: true, signatureUrl: true } } } },
        acoes: { include: { responsavelUser: { select: { id: true, name: true, signatureUrl: true } } } },
        anexos: true,
      },
    })
  })
}

export async function removerAta(tenantId: string, ataId: string) {
  const existing = await prisma.ata.findFirst({ where: { id: ataId, tenantId, deletedAt: null } })
  if (!existing) throw new NotFoundError('Ata não encontrada')
  return prisma.ata.update({ where: { id: ataId }, data: { deletedAt: new Date() } })
}

/** Cabeçalho da Ata a partir do projeto: linha institucional (Editar projeto > Informações iniciais) e logo. */
export async function cabecalhoDaAta(tenantId: string, projectId: string): Promise<{ instituicao: string; logoUrl: string | null }> {
  const p = await prisma.project.findFirst({
    where: { id: projectId, tenantId, deletedAt: null },
    select: { location: true, departamentos: true, semestre: true, termo: true, turno: true, ano: true, logoUrl: true },
  })
  if (!p) return { instituicao: '', logoUrl: null }
  const departamentos = await departamentosDoProjeto(projectId, tenantId, p.departamentos)
  return { instituicao: linhaInstitucional({ ...p, departamentos }), logoUrl: p.logoUrl ?? null }
}

/** Função (primeiro cargo do cadastro no projeto, ou departamento) de cada membro, para "nome e função". */
export async function funcoesNoProjeto(projectId: string, userIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((v): v is string => !!v))]
  if (!ids.length) return new Map()
  const ups = await prisma.userProject.findMany({
    where: { projectId, userId: { in: ids } },
    select: { userId: true, role: true, department: { select: { name: true } } },
  })
  return new Map(ups.flatMap(up => {
    const funcao = up.role?.split(',').map(s => s.trim()).find(Boolean) ?? up.department?.name ?? ''
    return funcao ? [[up.userId, funcao] as const] : []
  }))
}
