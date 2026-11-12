import 'server-only'
import { cache } from 'react'
import prisma from '@/lib/prisma'
import { funcaoKey } from '@/lib/utils/normalize'
import {
  BASE_MEMBRO_KEY,
  PERMISSOES,
  TODAS,
  isPermissao,
  resolverPermissoes,
  type Ajuste,
  type EntradaResolucao,
  type Permissao,
} from '@/lib/permissoes'

/**
 * Autorização por permissão (SDD 5.1). Substitui aos poucos o
 * `role === 'admin' || isProjectManager(...)` espalhado pelo app.
 *
 * As funções da pessoa no projeto são os vínculos dela com o cadastro de funções
 * (UserProjectFuncao, por id), mais o papel de
 * gerente (UserProjectRole), mais a função-base "Membro do projeto".
 */

export interface SessaoAuthz {
  userId: string
  tenantId: string
  role: string
}

type LinhaPermissao = { permission: { resource: string; action: string } }

function paraPermissoes(linhas: LinhaPermissao[]): Permissao[] {
  // Identifica por resource:action (único na tabela), não pelo nome.
  return linhas.map(l => `${l.permission.resource}:${l.permission.action}`).filter(isPermissao)
}

function paraAjustes(linhas: (LinhaPermissao & { effect: 'GRANT' | 'DENY' })[]): Ajuste[] {
  return linhas.flatMap(l => {
    const chave = `${l.permission.resource}:${l.permission.action}`
    return isPermissao(chave) ? [{ permissao: chave, efeito: l.effect }] : []
  })
}

/**
 * Entrada da resolução para um usuário (não admin) num projeto: base, funções
 * e ajustes, já lidos do banco. Memorizado por requisição (argumentos primitivos).
 */
export const entradaDoUsuario = cache(
  async (userId: string, tenantId: string, projectId: string): Promise<EntradaResolucao> => {
    const [projeto, vinculo, papelGerente, funcoes, ajustes] = await Promise.all([
      prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { id: true } }),
      prisma.userProject.findUnique({
        where: { userId_projectId: { userId, projectId } },
        select: { active: true, funcoes: { select: { roleId: true } } },
      }),
      prisma.userProjectRole.findFirst({ where: { userId, projectId, deletedAt: null }, select: { roleId: true } }),
      prisma.role.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          nameKey: true,
          scope: true,
          permissoesDefinidasEm: true,
          permissions: { select: { permission: { select: { resource: true, action: true } } } },
        },
      }),
      prisma.userPermission.findMany({
        where: { userId, OR: [{ projectId: null }, { projectId }] },
        select: { projectId: true, effect: true, permission: { select: { resource: true, action: true } } },
      }),
    ])

    const base = funcoes.find(f => f.nameKey === BASE_MEMBRO_KEY && f.scope === 'PROJETO')
    // Funções da pessoa: os vínculos com o cadastro (por id) e o papel de gerente.
    // Com várias, as permissões são somadas (resolverPermissoes).
    const ids = new Set(vinculo?.funcoes.map(f => f.roleId) ?? [])
    const minhas = funcoes.filter(
      f => f !== base && (ids.has(f.id) || f.id === papelGerente?.roleId),
    )

    return {
      admin: false,
      membro: Boolean(projeto && vinculo?.active),
      base: base?.permissoesDefinidasEm ? paraPermissoes(base.permissions) : null,
      funcoes: minhas.map(f => ({
        chave: f.nameKey === 'gerente' && f.scope === 'PROJETO' ? 'gerente' : funcaoKey(f.name),
        definidas: f.permissoesDefinidasEm ? paraPermissoes(f.permissions) : null,
      })),
      ajustesGlobais: paraAjustes(ajustes.filter(a => a.projectId === null)),
      ajustesProjeto: paraAjustes(ajustes.filter(a => a.projectId === projectId)),
    }
  },
)

/** Permissões do usuário no projeto. */
export async function permissoesNoProjeto(
  userId: string,
  tenantId: string,
  role: string,
  projectId: string,
): Promise<Set<Permissao>> {
  if (role === 'admin') {
    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { id: true } })
    return new Set(project ? TODAS : [])
  }
  return resolverPermissoes(await entradaDoUsuario(userId, tenantId, projectId))
}

export async function can(sessao: SessaoAuthz, projectId: string, permissao: Permissao): Promise<boolean> {
  return (await permissoesNoProjeto(sessao.userId, sessao.tenantId, sessao.role, projectId)).has(permissao)
}

export class SemPermissaoError extends Error {
  constructor(readonly permissao: Permissao) {
    const rotulo = PERMISSOES.find(p => p.chave === permissao)?.rotulo ?? permissao
    super(`Sem permissão: ${rotulo.charAt(0).toLowerCase()}${rotulo.slice(1)}.`)
    this.name = 'SemPermissaoError'
  }
}

/** Lança SemPermissaoError se faltar a permissão. */
export async function exigirPermissao(sessao: SessaoAuthz, projectId: string, permissao: Permissao): Promise<void> {
  if (!(await can(sessao, projectId, permissao))) throw new SemPermissaoError(permissao)
}

/** Escopo de consultas agregadas. Um conjunto vazio deve produzir zero resultados. */
export async function projetosAutorizados(sessao: SessaoAuthz, permissao: Permissao = 'projeto:ver'): Promise<string[]> {
  const projects = await prisma.project.findMany({
    where: { tenantId: sessao.tenantId, deletedAt: null, ...(sessao.role === 'admin' ? {} : { members: { some: { userId: sessao.userId, active: true } } }) },
    select: { id: true },
  })
  const flags = await Promise.all(projects.map(async p => {
    const permissions = await permissoesNoProjeto(sessao.userId, sessao.tenantId, sessao.role, p.id)
    return permissions.has('projeto:ver') && permissions.has(permissao)
  }))
  return projects.filter((_, i) => flags[i]).map(p => p.id)
}
