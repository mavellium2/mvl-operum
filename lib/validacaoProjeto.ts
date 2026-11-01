import { LIMITES_TEXTO_PROJETO, LIMITE_NOME_FASE } from '@/lib/projetoLimites'
import { ROTULOS_PROJETO } from '@/lib/alteracoesProjeto'
import { erroMoeda } from '@/lib/dinheiro'

export interface ErroCampoProjeto { campo: string; mensagem: string }
export function dataProjetoValida(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false
  if (value.length > 10 && Number.isNaN(Date.parse(value))) return false
  const day = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const date = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day
}

/** Mesmas verificações antes do envio e na Server Action, antes das gravações. */
export function validarProjeto(dados: {
  name?: string; startDate?: string; endDate?: string
  justificativa?: string; objetivos?: string; metodologia?: string; descricaoProduto?: string; premissas?: string; restricoes?: string; limitesAutoridade?: string; slogan?: string; location?: string; logoUrl?: string; initialMemberId?: string; semestre?: string; termo?: string; turno?: string; ano?: string | number; anoAms?: string | null
  macroFases?: { fase: string; dataLimite?: string; custo?: string }[]
}): ErroCampoProjeto[] {
  const erros: ErroCampoProjeto[] = []
  for (const [campo, limite] of Object.entries(LIMITES_TEXTO_PROJETO)) {
    const texto = dados[campo as keyof typeof LIMITES_TEXTO_PROJETO]
    if (typeof texto === 'string' && texto.length > limite) erros.push({ campo, mensagem: `${ROTULOS_PROJETO[campo as keyof typeof ROTULOS_PROJETO]} aceita até ${limite.toLocaleString('pt-BR')} caracteres. Remova ${(texto.length - limite).toLocaleString('pt-BR')} para continuar.` })
  }
  if (dados.name !== undefined && !dados.name.trim()) erros.push({ campo: 'name', mensagem: 'Informe o nome do projeto.' })
  for (const [campo, rotulo] of [['startDate', 'início'], ['endDate', 'fim previsto']] as const) {
    if (dados[campo] && !dataProjetoValida(dados[campo])) erros.push({ campo, mensagem: `A data de ${rotulo} não existe. Confira dia, mês e ano.` })
  }
  if (dados.startDate && dados.endDate && dataProjetoValida(dados.startDate) && dataProjetoValida(dados.endDate) && dados.endDate.slice(0, 10) < dados.startDate.slice(0, 10)) erros.push({ campo: 'endDate', mensagem: 'O fim previsto deve ser igual ou posterior ao início do projeto.' })
  const grupos = new Map<string, number[]>()
  dados.macroFases?.forEach((f, i) => {
    const numero = `1.${i + 1}`, campo = `fase:${i}`
    if (f.fase.length > LIMITE_NOME_FASE) erros.push({ campo, mensagem: `O nome da fase ${numero} aceita até ${LIMITE_NOME_FASE} caracteres. Remova ${f.fase.length - LIMITE_NOME_FASE} para continuar.` })
    if (!f.fase.trim() && (f.dataLimite || f.custo)) erros.push({ campo, mensagem: `Informe o nome da fase ${numero}, que já possui prazo ou custo.` })
    if (f.fase.trim()) {
      const chave = f.fase.trim().toLowerCase()
      grupos.set(chave, [...(grupos.get(chave) ?? []), i])
    }
    if (f.dataLimite && !dataProjetoValida(f.dataLimite)) erros.push({ campo: `dataFase:${i}`, mensagem: `A data limite da fase ${numero} não existe. Confira dia, mês e ano.` })
    const custo = erroMoeda(f.custo ?? '', { rotulo: 'Custo' })
    if (custo) erros.push({ campo: `custoFase:${i}`, mensagem: `Confira o custo da fase ${numero}: ${custo}` })
  })
  grupos.forEach(indices => { if (indices.length > 1) indices.forEach(i => erros.push({ campo: `fase:${i}`, mensagem: `Nome repetido nas fases ${indices.filter(n => n !== i).map(n => `1.${n + 1}`).join(', ')}.` })) })
  return erros
}
