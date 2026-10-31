/**
 * "Alterações não salvas" do Editar projeto: compara o projeto salvo com o
 * formulário e lista cada mudança com o valor antes e depois.
 */

export interface FormProjeto {
  name: string
  slogan: string
  startDate: string
  endDate: string
  location: string
  logoUrl: string
  initialMemberId: string
  justificativa: string
  objetivos: string
  metodologia: string
  descricaoProduto: string
  premissas: string
  restricoes: string
  limitesAutoridade: string
  semestre: string
  termo: string
  turno: string
  ano: string
  anoAms: string
  departamentos: string[]
}

/** Macro fase do formulário; `chave` identifica a linha (não vai para o servidor). */
export interface FaseForm { chave: string; fase: string; dataLimite: string; custo: string; /** Item da EAP, quando a fase já existe. */ nodeId?: string }

export type CampoTextoTermo = 'justificativa' | 'objetivos' | 'descricaoProduto' | 'metodologia' | 'premissas' | 'restricoes' | 'limitesAutoridade'

/** Nomes dos campos (iguais aos do formulário e do Termo). */
export const ROTULOS_PROJETO: Record<keyof FormProjeto, string> = {
  name: 'Nome do projeto',
  slogan: 'Slogan / visão',
  startDate: 'Início',
  endDate: 'Fim previsto',
  location: 'Local',
  logoUrl: 'Logo',
  initialMemberId: 'Gerente do projeto',
  justificativa: 'Justificativa do Projeto',
  objetivos: 'Objetivo(s) Principal(is)',
  descricaoProduto: 'Descrição do Produto/Serviço',
  metodologia: 'Metodologia / Abordagem',
  premissas: 'Premissas',
  restricoes: 'Restrições',
  limitesAutoridade: 'Limites de Autoridade do Gerente',
  semestre: 'Período',
  termo: 'Termo',
  turno: 'Turno',
  ano: 'Ano',
  anoAms: 'Ano do AMS',
  departamentos: 'Departamentos',
}

const TEXTOS = new Set<keyof FormProjeto>(['slogan', 'justificativa', 'objetivos', 'descricaoProduto', 'metodologia', 'premissas', 'restricoes', 'limitesAutoridade'])

export interface Alteracao {
  /** Campo (`name`, `endDate`…) ou `fase:<chave>` para uma macro fase. */
  chave: string
  rotulo: string
  antes: string
  depois: string
  /** Texto longo: mostrado com as palavras removidas e incluídas. */
  texto: boolean
}

const dataBR = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
const PERIODOS: Record<string, string> = { '1': '1º Semestre', '2': '2º Semestre', ano: 'Ano' }

function legivel(campo: keyof FormProjeto, f: FormProjeto, nomeDoUsuario: (id: string) => string): string {
  switch (campo) {
    case 'startDate': case 'endDate': return dataBR(f[campo])
    case 'initialMemberId': return f.initialMemberId ? nomeDoUsuario(f.initialMemberId) : ''
    case 'semestre': return PERIODOS[f.semestre] ?? f.semestre
    case 'anoAms': return f.anoAms ? `${f.anoAms}º` : ''
    case 'departamentos': return f.departamentos.join(', ')
    case 'logoUrl': return f.logoUrl ? 'Com logo' : 'Sem logo'
    default: return String(f[campo] ?? '')
  }
}

const descreverFase = (f: FaseForm) => [f.fase.trim() || 'Sem nome', dataBR(f.dataLimite) || 'sem prazo', f.custo ? `R$ ${f.custo}` : 'sem custo'].join(' · ')

export function listarAlteracoes(
  salvo: { form: FormProjeto; fases: FaseForm[] },
  atual: { form: FormProjeto; fases: FaseForm[] },
  nomeDoUsuario: (id: string) => string = id => id,
): Alteracao[] {
  const lista: Alteracao[] = []
  for (const campo of Object.keys(ROTULOS_PROJETO) as (keyof FormProjeto)[]) {
    const antes = legivel(campo, salvo.form, nomeDoUsuario)
    const depois = legivel(campo, atual.form, nomeDoUsuario)
    const mudou = campo === 'logoUrl' ? salvo.form.logoUrl !== atual.form.logoUrl : antes !== depois
    if (mudou) lista.push({ chave: campo, rotulo: ROTULOS_PROJETO[campo], antes, depois, texto: TEXTOS.has(campo) })
  }
  const salvas = new Map(salvo.fases.map(f => [f.chave, f]))
  atual.fases.forEach((f, i) => {
    const o = salvas.get(f.chave)
    if (!o) { if (f.fase.trim() || f.custo || f.dataLimite) lista.push({ chave: `fase:${f.chave}`, rotulo: `Fase 1.${i + 1} incluída`, antes: '', depois: descreverFase(f), texto: false }) }
    else if (descreverFase(o) !== descreverFase(f)) lista.push({ chave: `fase:${f.chave}`, rotulo: `Fase 1.${i + 1}`, antes: descreverFase(o), depois: descreverFase(f), texto: false })
  })
  const atuais = new Set(atual.fases.map(f => f.chave))
  salvo.fases.forEach((o, i) => {
    if (!atuais.has(o.chave)) lista.push({ chave: `fase:${o.chave}`, rotulo: `Fase 1.${i + 1} removida`, antes: descreverFase(o), depois: '', texto: false })
  })
  return lista
}

/** Desfaz uma alteração: volta o campo (ou a fase) ao valor salvo. */
export function desfazerAlteracao(
  chave: string,
  salvo: { form: FormProjeto; fases: FaseForm[] },
  atual: { form: FormProjeto; fases: FaseForm[] },
): { form: FormProjeto; fases: FaseForm[] } {
  if (!chave.startsWith('fase:')) {
    const campo = chave as keyof FormProjeto
    return { form: { ...atual.form, [campo]: salvo.form[campo] }, fases: atual.fases }
  }
  const k = chave.slice(5)
  const original = salvo.fases.find(f => f.chave === k)
  if (!original) return { form: atual.form, fases: atual.fases.filter(f => f.chave !== k) }
  if (atual.fases.some(f => f.chave === k)) return { form: atual.form, fases: atual.fases.map(f => (f.chave === k ? { ...original } : f)) }
  // Fase removida: volta na posição em que estava.
  const posicao = salvo.fases.findIndex(f => f.chave === k)
  const fases = [...atual.fases]
  fases.splice(Math.min(posicao, fases.length), 0, { ...original })
  return { form: atual.form, fases }
}

/** Conteúdo gravado no histórico (sem as chaves de tela). */
export function conteudoDaVersao(form: FormProjeto, fases: FaseForm[]) {
  return { form, fases: fases.map(({ fase, dataLimite, custo }) => ({ fase, dataLimite, custo })) }
}

/**
 * Formulário a partir de uma versão do histórico. As fases são casadas pelo nome com
 * as atuais (mantêm o item da EAP). Fases atuais que a versão não tem continuam:
 * excluir fase só pela confirmação, que mostra o impacto na EAP, sprints e custos.
 */
export function formDaVersao(
  versao: { form: FormProjeto; fases: { fase: string; dataLimite: string; custo: string }[] },
  atuais: FaseForm[],
  novaChave: () => string,
): { form: FormProjeto; fases: FaseForm[]; fasesMantidas: string[] } {
  const norm = (t: string) => t.trim().toLowerCase()
  const porNome = new Map(atuais.map(f => [norm(f.fase), f]))
  const usadas = new Set<string>()
  const fases: FaseForm[] = versao.fases.map(v => {
    const atual = porNome.get(norm(v.fase))
    if (atual && !usadas.has(atual.chave)) { usadas.add(atual.chave); return { ...atual, fase: v.fase, dataLimite: v.dataLimite, custo: v.custo } }
    return { chave: novaChave(), fase: v.fase, dataLimite: v.dataLimite, custo: v.custo }
  })
  const mantidas = atuais.filter(f => !usadas.has(f.chave) && f.nodeId)
  return { form: { ...versao.form }, fases: [...fases, ...mantidas], fasesMantidas: mantidas.map(f => f.fase) }
}
