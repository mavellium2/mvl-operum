/**
 * Linha institucional do quadro dos documentos (Ata, EAP), no formato do modelo
 * do professor: "Localização - Departamentos - termo - Período Ano"
 * (ex.: "Fatec Garça - Gestão Empresarial - 5° termo Noturno - 1° Semestre 2025").
 * Todos os campos vêm de Editar projeto > Informações iniciais.
 */

/** Texto exibido enquanto o termo/turno de um projeto semestral não foi preenchido. */
export const TERMO_A_DEFINIR = 'Termo a definir em Editar projeto (ex.: 5° termo Noturno)'

/**
 * Linha do cabeçalho dos documentos quando o projeto ainda não tem nenhum desses
 * dados: diz onde preencher, em vez de deixar a faixa vazia ou só com o termo.
 */
export const LINHA_A_DEFINIR = 'Preencha instituição, curso, termo e período em Editar projeto'

/** Turnos oferecidos em Editar projeto. */
export const TURNOS = ['Matutino', 'Vespertino', 'Noturno', 'Integral'] as const

export interface ProjetoInstitucional {
  location?: string | null
  departamentos?: string[] | null
  semestre?: string | null
  /** Ano da turma do AMS (1º/2º), distinto de termo e ano calendário. */
  anoAms?: string | null
  termo?: string | null
  turno?: string | null
  ano?: number | null
}

/** Período anual (ou não informado) não usa termo/turno. */
export function periodoEhSemestral(semestre?: string | null): boolean {
  const s = (semestre ?? '').trim()
  return s !== '' && s !== 'ano'
}

/** Período + ano: "1° Semestre 2025"; período anual vira só o ano. */
export function periodoDoProjeto(semestre?: string | null, ano?: number | null): string {
  const periodo = semestre === '1' ? '1° Semestre' : semestre === '2' ? '2° Semestre' : semestre === 'ano' ? '' : (semestre ?? '').trim()
  return [periodo, ano ? String(ano) : ''].filter(Boolean).join(' ')
}

/** "5° termo Noturno"; aceita termo já escrito por extenso ("5° termo"). */
export function termoTurno(termo?: string | null, turno?: string | null): string {
  const t = (termo ?? '').trim()
  const termoTxt = !t ? '' : /^\d+$/.test(t) ? `${t}° termo` : t
  return [termoTxt, (turno ?? '').trim()].filter(Boolean).join(' ')
}

/**
 * Segmento do termo na linha: o valor cadastrado; sem valor, o aviso "A definir"
 * (projetos semestrais ou sem período). Projeto anual sem termo omite o segmento.
 */
function segmentoTermo(p: ProjetoInstitucional): string {
  if (p.semestre === 'ano') return p.anoAms === '1' || p.anoAms === '2' ? `${p.anoAms}° Ano` : ''
  const valor = termoTurno(p.termo, p.turno)
  if (valor) return valor
  return TERMO_A_DEFINIR
}

export function linhaInstitucional(p: ProjetoInstitucional): string {
  const departamentos = (p.departamentos ?? []).map(d => d.trim()).filter(Boolean).join(' / ')
  return [p.location?.trim(), departamentos, segmentoTermo(p), periodoDoProjeto(p.semestre, p.ano)].filter(Boolean).join(' - ')
}

/**
 * Linha do cabeçalho de todos os documentos (Termo, Partes interessadas, EAP, Ata).
 * Sem nenhum dado do projeto, devolve o aviso para preencher em Editar projeto;
 * a faixa nunca fica vazia.
 */
export function linhaDoCabecalho(p: ProjetoInstitucional): string {
  const temDados = !!p.location?.trim() || (p.departamentos ?? []).some(d => d.trim())
    || !!periodoDoProjeto(p.semestre, p.ano) || !!termoTurno(p.termo, p.turno)
    || (p.semestre === 'ano' && (p.anoAms === '1' || p.anoAms === '2'))
  return temDados ? linhaInstitucional(p) : LINHA_A_DEFINIR
}

/** Valor salvo/recebido ou, vazio, o aviso: a linha do cabeçalho sempre aparece. */
export const linhaOuAviso = (valor?: string | null) => valor?.trim() || LINHA_A_DEFINIR
