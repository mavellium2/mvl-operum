/**
 * Seções de arquivos do projeto: "Fotos e Vídeos", "Apresentação Final e Vídeos",
 * "Desenhos Técnicos" e "Pesquisas". Todas usam a mesma tela; o que muda é a
 * configuração.
 *
 * Padrão: um catálogo de formatos (`FORMATOS`) e seções declaradas só pela lista
 * de formatos que aceitam (`secao(...)`). Tipos aceitos, `accept` do seletor,
 * mensagem de erro, ícone e filtro de tipo saem dessa lista; criar uma seção
 * nova é declarar título, endereço e formatos (e o valor no enum do Prisma).
 */

import type { CategoriaVisual } from '@/components/arquivos/ListaArquivos'

/** SVG: só sem conteúdo ativo (validado no registro) e exibido pela origem do app com CSP sandbox (ADR-042). */
export const SVG = 'image/svg+xml'
/** SVG é lido inteiro para validar: limite bem menor que o geral. */
export const TAMANHO_MAXIMO_SVG = 5 * 1024 * 1024
/** 1 GB: vídeos de apresentação costumam ser grandes; o envio vai direto ao storage. */
export const TAMANHO_MAXIMO_ARQUIVO = 1024 * 1024 * 1024

interface Formato {
  /** Como o formato aparece na mensagem "Envie …". */
  rotulo: string
  /** Ícone e filtro "Tipo" da lista. */
  visual: CategoriaVisual
  /** Extensão → tipo MIME, na ordem de exibição; extensões com o mesmo tipo são sinônimos (jpg/jpeg). */
  extensoes: Record<string, string>
}

/** Catálogo de formatos aceitos nas seções de arquivos. Nada de HTML, scripts ou executáveis. */
export const FORMATOS = {
  fotos: { rotulo: 'fotos', visual: 'imagem', extensoes: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: SVG } },
  videos: { rotulo: 'vídeos', visual: 'video', extensoes: { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' } },
  pdf: { rotulo: 'PDF', visual: 'pdf', extensoes: { pdf: 'application/pdf' } },
  apresentacoes: { rotulo: 'apresentações', visual: 'apresentacao', extensoes: {
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    odp: 'application/vnd.oasis.opendocument.presentation',
  } },
  textos: { rotulo: 'documentos', visual: 'documento', extensoes: {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    odt: 'application/vnd.oasis.opendocument.text',
    rtf: 'application/rtf',
  } },
  planilhas: { rotulo: 'planilhas', visual: 'planilha', extensoes: {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    csv: 'text/csv',
  } },
  /** Desenho técnico e modelos 3D (CAD). Tipos fixos pela extensão: o navegador costuma não informar. */
  cad: { rotulo: 'arquivos de CAD', visual: 'desenho', extensoes: {
    dwg: 'application/acad',
    dxf: 'application/dxf',
    step: 'model/step',
    stp: 'model/step',
    stl: 'model/stl',
  } },
} as const satisfies Record<string, Formato>

export type NomeFormato = keyof typeof FORMATOS

/** Extensão → tipo, de todos os formatos (para deduzir o tipo pelo nome). */
const TIPO_DA_EXTENSAO: Record<string, string> = Object.assign({}, ...Object.values(FORMATOS).map(f => f.extensoes))
/** Tipo → formato, para ícone, filtro e nome legível. */
const FORMATO_DO_TIPO = new Map<string, Formato>(Object.values(FORMATOS).flatMap(f => Object.values(f.extensoes).map(tipo => [tipo, f as Formato])))

/** Siglas sem sinônimos repetidos: jpg/jpeg viram só "JPG". */
function siglas(f: Formato): string[] {
  const porTipo = new Map<string, string>()
  for (const [ext, tipo] of Object.entries(f.extensoes)) if (!porTipo.has(tipo)) porTipo.set(tipo, ext.toUpperCase())
  return [...porTipo.values()]
}

/** "fotos (JPG, PNG), PDF ou vídeos (MP4)". */
function listaDeFormatos(formatos: readonly NomeFormato[]): string {
  const partes = formatos.map(nome => {
    const f: Formato = FORMATOS[nome]
    const s = siglas(f)
    return s.length === 1 && s[0] === f.rotulo ? f.rotulo : `${f.rotulo} (${s.join(', ')})`
  })
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} ou ${partes.at(-1)}` : partes[0]
}

interface DefinicaoSecao {
  titulo: string
  /** Trecho da URL: /projetos/:id/<slug> (também prefixo das chaves no storage). */
  slug: string
  descricao: string
  vazio: string
  formatos: readonly NomeFormato[]
  /** Oferece o modo Blocos (arte das fotos e vídeos), como no Finder. */
  blocos?: boolean
}

/** Monta a configuração completa de uma seção a partir dos formatos que ela aceita. */
function secao(def: DefinicaoSecao) {
  const formatos: Formato[] = def.formatos.map(nome => FORMATOS[nome])
  const tipos = [...new Set(formatos.flatMap(f => Object.values(f.extensoes)))]
  const extensoes = formatos.flatMap(f => Object.keys(f.extensoes).map(ext => `.${ext}`))
  return {
    ...def,
    blocos: def.blocos ?? false,
    tipos,
    /** `accept` do seletor de arquivos (tipos e extensões, pois o navegador às vezes não informa o tipo). */
    aceita: [...tipos, ...extensoes].join(','),
    /** Opções do filtro "Tipo" da lista. */
    tiposVisuais: [...new Set(formatos.map(f => f.visual))],
    mensagemTipo: `Envie ${listaDeFormatos(def.formatos)}.`,
  }
}

export const SECOES_ARQUIVOS = {
  FOTOS_VIDEOS: secao({
    titulo: 'Fotos e Vídeos', slug: 'fotos-videos', blocos: true,
    descricao: 'Fotos e vídeos do projeto.',
    vazio: 'Nenhuma foto ou vídeo enviado ainda.',
    formatos: ['fotos', 'videos'],
  }),
  APRESENTACAO: secao({
    titulo: 'Apresentação Final e Vídeos', slug: 'apresentacao',
    descricao: 'Apresentação final e vídeos da entrega do projeto.',
    vazio: 'Nenhuma apresentação ou vídeo enviado ainda.',
    formatos: ['apresentacoes', 'pdf', 'videos'],
  }),
  DESENHOS_TECNICOS: secao({
    titulo: 'Desenhos Técnicos', slug: 'desenhos-tecnicos', blocos: true,
    descricao: 'Desenhos técnicos do produto: vista explodida, corte técnico, renderização 3D, mockup técnico…',
    vazio: 'Nenhum desenho técnico enviado ainda.',
    formatos: ['fotos', 'pdf', 'cad'],
  }),
  PESQUISAS: secao({
    titulo: 'Pesquisas', slug: 'pesquisas',
    descricao: 'Documentos das pesquisas do projeto: formulários coletados e resultados tabulados.',
    vazio: 'Nenhum documento de pesquisa enviado ainda.',
    formatos: ['pdf', 'textos', 'planilhas', 'fotos'],
  }),
} satisfies Record<string, ReturnType<typeof secao>>

export type CategoriaArquivoProjeto = keyof typeof SECOES_ARQUIVOS
/** Para validar a categoria nas rotas (z.enum). */
export const CATEGORIAS_ARQUIVO = Object.keys(SECOES_ARQUIVOS) as [CategoriaArquivoProjeto, ...CategoriaArquivoProjeto[]]

export const categoriaDoSlug = (slug: string): CategoriaArquivoProjeto | null =>
  CATEGORIAS_ARQUIVO.find(c => SECOES_ARQUIVOS[c].slug === slug) ?? null

/**
 * Tipo do arquivo: pela extensão, quando ela é de um formato conhecido (o navegador
 * às vezes não informa ou informa outro nome para .pptx, .dwg, .csv…); senão, o do navegador.
 */
export function tipoDoArquivo(nome: string, tipo: string): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(nome)?.[1]?.toLowerCase()
  return (ext && TIPO_DA_EXTENSAO[ext]) || tipo.toLowerCase()
}

/** Ícone e filtro "Tipo" da lista para um tipo MIME. */
export const visualDoTipo = (tipo: string): CategoriaVisual => FORMATO_DO_TIPO.get(tipo)?.visual ?? 'outro'

/** Tipo legível para a coluna "Tipo": "Vídeo MP4", "Imagem PNG", "Planilha XLSX", "PDF"… */
export function tipoLegivel(tipo: string): string {
  const formato = FORMATO_DO_TIPO.get(tipo)
  if (!formato) return tipo
  const sigla = Object.entries(formato.extensoes).find(([, t]) => t === tipo)?.[0].toUpperCase() ?? ''
  const nome: Record<CategoriaVisual, string> = { imagem: 'Imagem', video: 'Vídeo', pdf: '', apresentacao: 'Apresentação', documento: 'Documento', planilha: 'Planilha', desenho: 'Desenho', link: '', outro: '' }
  return [nome[formato.visual], sigla].filter(Boolean).join(' ')
}

export function erroDoArquivo(categoria: CategoriaArquivoProjeto, tipo: string, tamanho: number): string | null {
  const secaoAtual = SECOES_ARQUIVOS[categoria]
  if (!secaoAtual.tipos.includes(tipo)) return secaoAtual.mensagemTipo
  if (!Number.isSafeInteger(tamanho) || tamanho <= 0) return 'Arquivo vazio.'
  if (tamanho > TAMANHO_MAXIMO_ARQUIVO) return 'O arquivo passa de 1 GB.'
  if (tipo === SVG && tamanho > TAMANHO_MAXIMO_SVG) return 'O SVG passa de 5 MB. Exporte como PNG.'
  return null
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const extensao = (nome: string) => /\.[A-Za-z0-9]{1,8}$/.exec(nome)?.[0] ?? ''

/**
 * Nome final ao renomear: sem espaços nas pontas e com até 255 caracteres.
 * Se o novo nome vier sem extensão, mantém a do arquivo (como no Finder).
 * Devolve null quando o nome fica vazio.
 */
export function nomeRenomeado(atual: string, novo: string): string | null {
  const limpo = novo.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!limpo || limpo === extensao(atual)) return null
  const ext = extensao(atual)
  const final = ext && !extensao(limpo) ? `${limpo}${ext}` : limpo
  return final.slice(0, 255)
}
