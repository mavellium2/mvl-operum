import type { WbsNodeClient } from '@/types/wbs'

/**
 * Recuperação de edições da EAP em conflito de salvamento (card "EAP: preservar
 * rascunho e permitir recuperar edições em conflitos de salvamento").
 *
 * Mescla em três vias: `base` (a versão do servidor sobre a qual a pessoa editou),
 * `local` (a edição dela) e `servidor` (a versão atual). Por nó e por aspecto
 * (conteúdo: título, layout, estilo, propriedades; posição: pai e ordem):
 * - só a pessoa mudou → aplica a mudança dela;
 * - só o servidor mudou, ou os dois mudaram igual → fica o servidor;
 * - os dois mudaram diferente → conflito: fica o servidor (não sobrescreve o
 *   trabalho de outra pessoa) e a alteração aparece na lista para refazer à mão.
 * Nós criados pela pessoa entram se o pai existir; nós que ela removeu saem se o
 * servidor não os alterou e não ganharam filhos.
 */

export interface ArvoreEap { rootId: string | null; nodes: Record<string, WbsNodeClient> }

export type TipoAlteracao = 'criado' | 'removido' | 'alterado' | 'movido'
export interface Alteracao { nodeId: string; titulo: string; tipo: TipoAlteracao; motivo?: string }

export interface ResultadoMescla {
  arvore: ArvoreEap
  aplicadas: Alteracao[]
  conflitos: Alteracao[]
}

const conteudo = (n: WbsNodeClient) => JSON.stringify([n.title, n.layout, n.style, n.properties ?? {}])
const posicao = (n: WbsNodeClient) => JSON.stringify([n.parentId, n.order])

/** O que a pessoa mudou em relação à base (para mostrar o que ficou pendente). */
export function alteracoesLocais(base: ArvoreEap, local: ArvoreEap): Alteracao[] {
  const lista: Alteracao[] = []
  for (const [id, n] of Object.entries(local.nodes)) {
    const b = base.nodes[id]
    if (!b) lista.push({ nodeId: id, titulo: n.title, tipo: 'criado' })
    else if (conteudo(b) !== conteudo(n)) lista.push({ nodeId: id, titulo: n.title, tipo: 'alterado' })
    else if (posicao(b) !== posicao(n)) lista.push({ nodeId: id, titulo: n.title, tipo: 'movido' })
  }
  for (const [id, b] of Object.entries(base.nodes)) {
    if (!local.nodes[id]) lista.push({ nodeId: id, titulo: b.title, tipo: 'removido' })
  }
  return lista
}

export function mesclarRascunho(base: ArvoreEap, local: ArvoreEap, servidor: ArvoreEap): ResultadoMescla {
  const nodes: Record<string, WbsNodeClient> = {}
  for (const [id, n] of Object.entries(servidor.nodes)) nodes[id] = { ...n }
  const aplicadas: Alteracao[] = []
  const conflitos: Alteracao[] = []

  // Nós criados pela pessoa (na ordem em que aparecem; pais antes dos filhos).
  const criados = Object.values(local.nodes).filter(n => !base.nodes[n.id] && !servidor.nodes[n.id])
  let pendentes = criados
  for (let volta = 0; volta < criados.length + 1 && pendentes.length; volta++) {
    const proximos: WbsNodeClient[] = []
    for (const n of pendentes) {
      if (n.parentId && nodes[n.parentId]) {
        nodes[n.id] = { ...n, childrenIds: [] }
        aplicadas.push({ nodeId: n.id, titulo: n.title, tipo: 'criado' })
      } else proximos.push(n)
    }
    if (proximos.length === pendentes.length) break
    pendentes = proximos
  }
  for (const n of pendentes) conflitos.push({ nodeId: n.id, titulo: n.title, tipo: 'criado', motivo: 'o item pai foi excluído no servidor' })

  // Alterações e movimentos de nós que existem nas três versões.
  for (const [id, l] of Object.entries(local.nodes)) {
    const b = base.nodes[id]
    if (!b) continue
    const s = servidor.nodes[id]
    const mudouConteudo = conteudo(l) !== conteudo(b)
    const mudouPosicao = posicao(l) !== posicao(b)
    if (!mudouConteudo && !mudouPosicao) continue
    if (!s) {
      conflitos.push({ nodeId: id, titulo: l.title, tipo: mudouConteudo ? 'alterado' : 'movido', motivo: 'foi excluído no servidor' })
      continue
    }
    if (mudouConteudo) {
      if (conteudo(s) === conteudo(b)) {
        nodes[id] = { ...nodes[id], title: l.title, layout: l.layout, style: l.style, properties: l.properties }
        aplicadas.push({ nodeId: id, titulo: l.title, tipo: 'alterado' })
      } else if (conteudo(s) !== conteudo(l)) {
        conflitos.push({ nodeId: id, titulo: l.title, tipo: 'alterado', motivo: `também foi alterado no servidor (agora "${s.title}")` })
      }
    }
    if (mudouPosicao) {
      if (posicao(s) === posicao(b)) {
        if (l.parentId && !nodes[l.parentId]) {
          conflitos.push({ nodeId: id, titulo: l.title, tipo: 'movido', motivo: 'o novo pai não existe mais' })
        } else {
          nodes[id] = { ...nodes[id], parentId: l.parentId, order: l.order }
          aplicadas.push({ nodeId: id, titulo: l.title, tipo: 'movido' })
        }
      } else if (posicao(s) !== posicao(l)) {
        conflitos.push({ nodeId: id, titulo: l.title, tipo: 'movido', motivo: 'também foi movido no servidor' })
      }
    }
  }

  // Nós removidos pela pessoa: saem se o servidor não os mudou.
  const remover = new Set<string>()
  for (const [id, b] of Object.entries(base.nodes)) {
    if (local.nodes[id] || !servidor.nodes[id]) continue
    const s = servidor.nodes[id]
    if (conteudo(s) === conteudo(b) && posicao(s) === posicao(b)) remover.add(id)
    else conflitos.push({ nodeId: id, titulo: b.title, tipo: 'removido', motivo: 'foi alterado no servidor depois' })
  }
  // Não remove pai de quem continua na árvore (ex.: filho criado por outra pessoa).
  let mudou = true
  while (mudou) {
    mudou = false
    for (const id of [...remover]) {
      const temFilhoQueFica = Object.values(nodes).some(n => n.parentId === id && !remover.has(n.id))
      if (temFilhoQueFica) {
        remover.delete(id)
        conflitos.push({ nodeId: id, titulo: base.nodes[id].title, tipo: 'removido', motivo: 'tem itens que continuam na EAP' })
        mudou = true
      }
    }
  }
  for (const id of remover) {
    delete nodes[id]
    aplicadas.push({ nodeId: id, titulo: base.nodes[id].title, tipo: 'removido' })
  }

  // Refaz a lista de filhos e normaliza a ordem entre irmãos.
  for (const n of Object.values(nodes)) n.childrenIds = []
  const porPai = new Map<string, WbsNodeClient[]>()
  for (const n of Object.values(nodes)) {
    if (!n.parentId || !nodes[n.parentId]) continue
    porPai.set(n.parentId, [...(porPai.get(n.parentId) ?? []), n])
  }
  for (const [pai, filhos] of porPai) {
    filhos.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    filhos.forEach((f, i) => { nodes[f.id] = { ...nodes[f.id], order: i } })
    nodes[pai].childrenIds = filhos.map(f => f.id)
  }

  return { arvore: { rootId: servidor.rootId, nodes }, aplicadas, conflitos }
}
