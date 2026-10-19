import type { WbsNodeClient } from '@/types/wbs'

type Arvore = Record<string, WbsNodeClient>

const CAMPOS = ['parentId', 'order', 'title', 'layout', 'collapsed', 'style'] as const

const igual = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Valor que o cliente não mexeu desde a base fica com o do servidor; o resto fica com o do cliente. */
function escolher<T>(base: T | undefined, local: T, servidor: T, temBase: boolean): T {
  return temBase && igual(local, base) ? servidor : local
}

/**
 * Mescla em 3 vias a árvore editada no cliente com a do servidor, a partir da última
 * árvore que os dois tinham em comum (base). Usada quando o autosave é recusado por
 * conflito: a sincronização EAP ↔ sprint (ou outra aba) avança a versão enquanto o
 * usuário edita, e antes a edição era descartada.
 *
 * - Campo e propriedade que o cliente não mudou desde a base recebem o valor do servidor
 *   (ex.: `cardId` gravado pela sincronização); o que o cliente mudou prevalece.
 * - Nó novo de um dos lados entra; nó que existia na base e um lado excluiu sai.
 * - Nós sem pai na árvore final saem, e a ordem entre irmãos é renumerada.
 */
export function mesclarArvores(base: Arvore, local: Arvore, servidor: Arvore): Arvore {
  const out: Arvore = {}
  const ids = new Set([...Object.keys(local), ...Object.keys(servidor)])

  for (const id of ids) {
    const l = local[id]
    const s = servidor[id]
    const b = base[id]
    if (l && s) {
      const n = { ...l }
      for (const campo of CAMPOS) (n as Record<string, unknown>)[campo] = escolher(b?.[campo], l[campo], s[campo], !!b)
      const props: Record<string, unknown> = {}
      const lp = (l.properties ?? {}) as Record<string, unknown>
      const sp = (s.properties ?? {}) as Record<string, unknown>
      const bp = (b?.properties ?? {}) as Record<string, unknown>
      for (const k of new Set([...Object.keys(lp), ...Object.keys(sp)])) {
        const v = escolher(bp[k], lp[k], sp[k], !!b)
        if (v !== undefined) props[k] = v
      }
      n.properties = props as WbsNodeClient['properties']
      out[id] = n
    } else if (l && !b) {
      out[id] = { ...l }
    } else if (s && !b) {
      out[id] = { ...s }
    }
    // Existia na base e um dos lados excluiu: fica excluído.
  }

  // Tira nós cujo pai não ficou na árvore (ex.: filho novo de um item excluído do outro lado).
  for (let mudou = true; mudou;) {
    mudou = false
    for (const [id, n] of Object.entries(out)) {
      if (n.parentId !== null && !out[n.parentId]) { delete out[id]; mudou = true }
    }
  }

  // Filhos de cada pai: ordem do resultado, empate a favor do cliente; renumera 0..n-1.
  const filhos = new Map<string, WbsNodeClient[]>()
  for (const n of Object.values(out)) {
    n.childrenIds = []
    if (n.parentId !== null) filhos.set(n.parentId, [...(filhos.get(n.parentId) ?? []), n])
  }
  for (const [pai, lista] of filhos) {
    lista.sort((a, b) => a.order - b.order || Number(!local[a.id]) - Number(!local[b.id]))
    lista.forEach((n, i) => { n.order = i })
    out[pai].childrenIds = lista.map(n => n.id)
  }
  return out
}
