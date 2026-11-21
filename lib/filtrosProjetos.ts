/**
 * Filtros de "Meus projetos" (ajustes de 20/11/2026): Ano, Departamento, Turma,
 * Termo, Turno e Situação, cada um com várias opções. Filtro sem nada marcado
 * vale como "todas as opções". A escolha fica guardada por conta e instituição
 * num cookie, para a lista já abrir filtrada.
 */

import { TURNOS } from '@/lib/linhaInstitucional'

export interface FiltrosProjetos {
  anos: number[]
  departamentos: string[]
  /** Período do projeto (campo `semestre`): "1", "2" ou "ano". */
  turmas: string[]
  termos: string[]
  turnos: string[]
  situacoes: string[]
}

/** Valores que existem nos projetos que a pessoa vê (Ano, Departamento e Termo variam por instituição). */
export interface OpcoesFiltrosProjetos {
  anos: number[]
  departamentos: string[]
  termos: string[]
}

export const FILTROS_VAZIOS: FiltrosProjetos = { anos: [], departamentos: [], turmas: [], termos: [], turnos: [], situacoes: [] }

export const SITUACOES_PROJETO = [
  { value: 'ACTIVE', label: 'Em andamento' },
  { value: 'COMPLETED', label: 'Concluídos' },
  { value: 'ARCHIVED', label: 'Arquivados' },
  { value: 'INACTIVE', label: 'Inativos' },
] as const

export const TURMAS_PROJETO = [
  { value: '1', label: '1° Semestre' },
  { value: '2', label: '2° Semestre' },
  { value: 'ano', label: 'Anual' },
] as const

/** Os mesmos turnos oferecidos em Editar projeto. */
export const TURNOS_PROJETO = TURNOS

/** Limites de cada lista e de cada valor (o cookie e a URL vêm do navegador). */
export const MAX_OPCOES_FILTRO = 50
const MAX_TEXTO = 100

export function filtrosProjetosKey(userId: string, tenantId: string) {
  return `operum_project_filters_${encodeURIComponent(tenantId)}_${encodeURIComponent(userId)}`
}

function textos(valor: unknown, permitidos?: readonly string[]): string[] {
  if (!Array.isArray(valor)) return []
  const saida: string[] = []
  for (const item of valor) {
    if (typeof item !== 'string') continue
    const texto = item.replace(/[\u0000-\u001f\u007f]/g, '').trim()
    if (!texto || texto.length > MAX_TEXTO || saida.includes(texto)) continue
    if (permitidos && !permitidos.includes(texto)) continue
    saida.push(texto)
    if (saida.length >= MAX_OPCOES_FILTRO) break
  }
  return saida
}

/** Aceita qualquer entrada (cookie, server action) e devolve só valores válidos. */
export function normalizarFiltros(valor: unknown): FiltrosProjetos {
  if (!valor || typeof valor !== 'object') return { ...FILTROS_VAZIOS }
  const v = valor as Record<string, unknown>
  const anos = Array.isArray(v.anos)
    ? [...new Set(v.anos.map(Number).filter(a => Number.isInteger(a) && a >= 1900 && a <= 3000))].slice(0, MAX_OPCOES_FILTRO)
    : []
  return {
    anos,
    departamentos: textos(v.departamentos),
    turmas: textos(v.turmas, TURMAS_PROJETO.map(t => t.value)),
    termos: textos(v.termos),
    turnos: textos(v.turnos, TURNOS_PROJETO),
    situacoes: textos(v.situacoes, SITUACOES_PROJETO.map(s => s.value)),
  }
}

export function lerFiltrosDoCookie(valor?: string | null): FiltrosProjetos {
  if (!valor) return { ...FILTROS_VAZIOS }
  try { return normalizarFiltros(JSON.parse(decodeURIComponent(valor))) } catch { return { ...FILTROS_VAZIOS } }
}

export const gravarFiltrosNoCookie = (filtros: FiltrosProjetos) => encodeURIComponent(JSON.stringify(normalizarFiltros(filtros)))

/** Quantos filtros têm alguma opção marcada. */
export const filtrosAtivos = (f: FiltrosProjetos) =>
  [f.anos, f.departamentos, f.turmas, f.termos, f.turnos, f.situacoes].filter(lista => lista.length > 0).length

/** Parâmetros repetidos (`ano=2026&ano=2025`) para a listagem do project-service. */
export function filtrosNaQuery(f: FiltrosProjetos): string {
  const params = new URLSearchParams()
  f.anos.forEach(a => params.append('ano', String(a)))
  f.departamentos.forEach(d => params.append('departamento', d))
  f.turmas.forEach(t => params.append('turma', t))
  f.termos.forEach(t => params.append('termo', t))
  f.turnos.forEach(t => params.append('turno', t))
  f.situacoes.forEach(s => params.append('status', s))
  return params.toString()
}

/** "5" vira "5° termo"; termo já escrito por extenso fica como está. */
export const rotuloTermo = (termo: string) => /^\d+$/.test(termo) ? `${termo}° termo` : termo
