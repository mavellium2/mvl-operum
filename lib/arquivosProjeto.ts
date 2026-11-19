/**
 * Seções de arquivos do projeto (ajustes de 18/11/2026): "Fotos e Vídeos" e
 * "Apresentação e Vídeo" (entrega e apresentação do projeto final). Regras
 * comuns à tela e ao servidor: tipos aceitos, tamanho máximo e endereços.
 */

export type CategoriaArquivoProjeto = 'FOTOS_VIDEOS' | 'APRESENTACAO'

const IMAGENS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const VIDEOS = ['video/mp4', 'video/webm', 'video/quicktime']
const APRESENTACOES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.presentation',
]

/** 1 GB: vídeos de apresentação costumam ser grandes; o envio vai direto ao storage. */
export const TAMANHO_MAXIMO_ARQUIVO = 1024 * 1024 * 1024

export const SECOES_ARQUIVOS: Record<CategoriaArquivoProjeto, {
  titulo: string
  /** Trecho da URL: /projetos/:id/<slug>. */
  slug: string
  descricao: string
  tipos: string[]
  /** `accept` do seletor de arquivos. */
  aceita: string
  vazio: string
}> = {
  FOTOS_VIDEOS: {
    titulo: 'Fotos e Vídeos',
    slug: 'fotos-videos',
    descricao: 'Fotos e vídeos do projeto.',
    tipos: [...IMAGENS, ...VIDEOS],
    aceita: [...IMAGENS, ...VIDEOS].join(','),
    vazio: 'Nenhuma foto ou vídeo enviado ainda.',
  },
  APRESENTACAO: {
    titulo: 'Apresentação e Vídeo',
    slug: 'apresentacao',
    descricao: 'Apresentação e vídeo da entrega final do projeto.',
    tipos: [...APRESENTACOES, ...VIDEOS],
    aceita: [...APRESENTACOES, '.pptx', '.ppt', '.odp', ...VIDEOS].join(','),
    vazio: 'Nenhuma apresentação ou vídeo enviado ainda.',
  },
}

export const categoriaDoSlug = (slug: string): CategoriaArquivoProjeto | null =>
  (Object.entries(SECOES_ARQUIVOS).find(([, s]) => s.slug === slug)?.[0] as CategoriaArquivoProjeto | undefined) ?? null

/** O navegador às vezes não informa o tipo do .pptx/.odp: deduz pela extensão. */
export function tipoDoArquivo(nome: string, tipo: string): string {
  if (tipo) return tipo.toLowerCase()
  const ext = nome.toLowerCase().split('.').pop()
  return ({
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    odp: 'application/vnd.oasis.opendocument.presentation',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
  } as Record<string, string>)[ext ?? ''] ?? ''
}

export function erroDoArquivo(categoria: CategoriaArquivoProjeto, tipo: string, tamanho: number): string | null {
  if (!SECOES_ARQUIVOS[categoria].tipos.includes(tipo))
    return categoria === 'FOTOS_VIDEOS'
      ? 'Envie fotos (JPG, PNG, WEBP, GIF) ou vídeos (MP4, WEBM, MOV).'
      : 'Envie a apresentação (PDF, PPTX, PPT, ODP) ou o vídeo (MP4, WEBM, MOV).'
  if (!Number.isSafeInteger(tamanho) || tamanho <= 0) return 'Arquivo vazio.'
  if (tamanho > TAMANHO_MAXIMO_ARQUIVO) return 'O arquivo passa de 1 GB.'
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
