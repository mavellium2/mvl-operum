import prisma from '@/lib/prisma'

/**
 * Dependências que impedem excluir um projeto (card "Exclusão de projeto: impedir
 * quando houver dependências para o usuário").
 *
 * Regra: o projeto só pode ser excluído quando nada ficaria órfão. Contam como
 * dependência os dados ainda ativos vinculados a ele — sprints, cards (do backlog
 * ou de sprints), lançamentos de tempo, atas, documentos versionados e outros
 * membros ativos além de quem está excluindo. Itens já excluídos não contam.
 */
export interface DependenciaProjeto {
  tipo: 'sprints' | 'cards' | 'tempo' | 'atas' | 'documentos' | 'membros'
  quantidade: number
  rotulo: string
}

const ROTULOS: Record<DependenciaProjeto['tipo'], [string, string]> = {
  sprints: ['sprint', 'sprints'],
  cards: ['card', 'cards'],
  tempo: ['lançamento de tempo', 'lançamentos de tempo'],
  atas: ['ata', 'atas'],
  documentos: ['versão de documento', 'versões de documentos'],
  membros: ['outro membro ativo', 'outros membros ativos'],
}

function rotulo(tipo: DependenciaProjeto['tipo'], n: number): string {
  const [um, varios] = ROTULOS[tipo]
  return `${n} ${n === 1 ? um : varios}`
}

export async function dependenciasDoProjeto(projectId: string, tenantId: string, userId: string): Promise<DependenciaProjeto[]> {
  const projeto = { id: projectId, tenantId }
  const [sprints, cards, tempo, atas, documentos, membros] = await Promise.all([
    prisma.sprint.count({ where: { projectId, deletedAt: null, project: projeto } }),
    prisma.card.count({ where: { projectId, deletedAt: null, project: projeto } }),
    prisma.timeEntry.count({ where: { deletedAt: null, card: { projectId, deletedAt: null, project: projeto } } }),
    prisma.ata.count({ where: { projetoId: projectId, deletedAt: null, project: projeto } }),
    prisma.documentVersion.count({ where: { projectId, project: projeto } }),
    prisma.userProject.count({ where: { projectId, active: true, userId: { not: userId }, project: projeto } }),
  ])
  const contagem: [DependenciaProjeto['tipo'], number][] = [
    ['sprints', sprints], ['cards', cards], ['tempo', tempo], ['atas', atas], ['documentos', documentos], ['membros', membros],
  ]
  return contagem
    .filter(([, n]) => n > 0)
    .map(([tipo, quantidade]) => ({ tipo, quantidade, rotulo: rotulo(tipo, quantidade) }))
}

/** "O projeto tem 2 sprints e 5 cards. Exclua ou mova esses itens antes de excluir o projeto." */
export function mensagemDeBloqueio(deps: DependenciaProjeto[]): string {
  const itens = deps.map(d => d.rotulo)
  const lista = itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}` : itens[0]
  return `O projeto ainda tem ${lista}. Exclua, mova ou desvincule esses itens antes de excluir o projeto.`
}

