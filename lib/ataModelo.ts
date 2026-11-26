/**
 * Regras e dados do modelo de ata, sem a biblioteca `docx`: a prévia no navegador
 * (components/atas) importa daqui, e só a exportação para Word carrega o `docx`.
 */

/** assinaturaUrl: assinatura cadastrada no perfil do presente (membro), quando houver. */
export type Presente = { nome: string; setorEmpresa: string | null; assinaturaUrl?: string | null }
export type Acao = { acao: string; prazo: Date | null; responsavel: string | null }
export type Anexo = { nome: string; url: string | null }

export interface AtaExportData {
  instituicao?: string | null
  numero: number
  nomeProjeto: string
  local: string | null
  data: Date | null
  elaboradoPor: string | null
  /** Função de quem elaborou ("nome e função" no modelo). */
  elaboradoPorFuncao?: string | null
  aprovadoPor: string | null
  /** Função de quem aprovou ("nome do gerente - função" no modelo). */
  aprovadoPorFuncao?: string | null
  assuntosTratados: string | null
  decisoesTomadas: string | null
  observacoes: string | null
  copiasPara: string[]
  presentes: Presente[]
  acoes: Acao[]
  anexos: Anexo[]
  logoUrl?: string | null
  gerenteProjeto?: string | null
  assinaturaGerenteUrl?: string | null
}

// ── Regras do modelo (compartilhadas com a prévia em components/atas/AtaDocument.tsx) ──

export const ATA_PLANO_DO_PROJETO = 'Plano do Projeto'
/**
 * Linhas das tabelas de presentes e ações: as preenchidas e só UMA vazia no fim
 * (card "Exportar ata": reduzir linhas vazias extras). Antes eram 7 e 6 fixas.
 */
export const ATA_MIN_PRESENTES = 1
export const ATA_MIN_ACOES = 1
/** Espaço entre os blocos da ata (prévia, em mm; Word, em twips). */
export const ATA_ESPACO_MM = 3
/** Largura da coluna da logo; a coluna da direita tem a mesma largura para o nº ficar no centro da página. */
export const ATA_LOGO_MM = 33
/** Assinaturas: presentes com nome, em grade de 3 por linha. */
export const ATA_ASSINATURAS_POR_LINHA = 3
export const ataAssinantes = (presentes: Presente[]) => presentes.filter(p => p.nome?.trim())

export const ataNumero = (n: number | null | undefined) => (n ? String(n).padStart(2, '0') : '__')
export const ataData = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '__/__/____')
/** "Nome - função" (ou só o nome), como no modelo ("Karoline … - Gerente"). */
export const ataPessoa = (nome: string | null | undefined, funcao?: string | null) =>
  [nome?.trim(), funcao?.trim()].filter(Boolean).join(' - ')
/** Completa a lista com linhas vazias até o mínimo do modelo. */
export function ataPreencher<T>(itens: T[], minimo: number, vazio: T): T[] {
  return itens.length >= minimo ? itens : [...itens, ...Array.from({ length: minimo - itens.length }, () => vazio)]
}
/** Linhas preenchidas + uma linha vazia no fim (para completar à mão). */
export function ataComUmaLinhaVazia<T>(itens: T[], preenchido: (item: T) => boolean, vazio: T): T[] {
  return [...itens.filter(preenchido), vazio]
}
/**
 * Caixas de "Enviar cópias para", como no modelo: grade de 4 colunas em que a 1ª célula
 * é o rótulo; destinatários marcados, caixas vazias e "Plano do Projeto" na última.
 * Retorna só as caixas (sem a célula do rótulo).
 */
export function ataCopias(copias: string[]): Array<{ texto: string; marcado: boolean }> {
  const nomes = copias.map(c => c.trim()).filter(c => c && c.toLowerCase() !== ATA_PLANO_DO_PROJETO.toLowerCase())
  const plano = copias.some(c => c.trim().toLowerCase() === ATA_PLANO_DO_PROJETO.toLowerCase())
  const total = Math.max(12, Math.ceil((nomes.length + 2) / 4) * 4) - 1
  const caixas = nomes.map(texto => ({ texto, marcado: true }))
  while (caixas.length < total - 1) caixas.push({ texto: '', marcado: false })
  caixas.push({ texto: ATA_PLANO_DO_PROJETO, marcado: plano })
  return caixas
}
