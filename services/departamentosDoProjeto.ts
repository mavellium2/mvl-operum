import prisma from '@/lib/prisma'

/**
 * Departamentos do projeto com o nome atual do cadastro (card "Documentos:
 * refletir a atualização do departamento").
 *
 * `Project.departamentos` guarda só os nomes; ao renomear um departamento no
 * cadastro, a lista ficava com o nome antigo e os documentos também. A fonte é a
 * associação `ProjetoDepartamento` (gravada ao salvar o projeto), que aponta para
 * o registro do cadastro. Projetos antigos sem associação usam a lista gravada.
 */
export async function departamentosDoProjeto(
  projectId: string,
  tenantId: string,
  gravados: string[] | null | undefined,
): Promise<string[]> {
  try {
    const assoc = await prisma.projetoDepartamento.findMany({
      where: { projetoId: projectId, department: { tenantId, deletedAt: null } },
      select: { department: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const nomes = assoc.map(a => a.department.name.trim()).filter(Boolean)
    if (nomes.length) return ordenarComoGravado([...new Set(nomes)], gravados ?? [])
  } catch {
    // sem a associação, mantém a lista gravada
  }
  return (gravados ?? []).map(d => d.trim()).filter(Boolean)
}

/**
 * Mantém a ordem escolhida em Editar projeto: nomes que continuam iguais ficam na
 * posição gravada; os renomeados entram na posição do nome que sumiu.
 */
function ordenarComoGravado(atuais: string[], gravados: string[]): string[] {
  const chave = (s: string) => s.trim().toLocaleLowerCase('pt-BR')
  const restantes = atuais.filter(n => !gravados.some(g => chave(g) === chave(n)))
  const resultado: string[] = []
  for (const g of gravados) {
    const igual = atuais.find(n => chave(n) === chave(g))
    if (igual) resultado.push(igual)
    else if (restantes.length) resultado.push(restantes.shift()!)
  }
  return [...resultado, ...restantes]
}

/**
 * Ao renomear um departamento do cadastro, troca o nome antigo pelo novo na lista
 * gravada dos projetos do tenant (MCP, exportação e telas que leem a lista).
 */
export async function renomearDepartamentoNosProjetos(tenantId: string, antigo: string, novo: string): Promise<void> {
  const de = antigo.trim(), para = novo.trim()
  if (!de || !para || de === para) return
  const chave = (s: string) => s.trim().toLocaleLowerCase('pt-BR')
  const projetos = await prisma.project.findMany({
    where: { tenantId, deletedAt: null, departamentos: { has: de } },
    select: { id: true, departamentos: true },
  })
  for (const p of projetos) {
    const lista = p.departamentos.map(d => (chave(d) === chave(de) ? para : d))
    await prisma.project.update({ where: { id: p.id }, data: { departamentos: [...new Set(lista)] } })
  }
}
