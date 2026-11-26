import 'server-only'
import { randomUUID } from 'node:crypto'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import prisma from '@/lib/prisma'
import { assinador, BUCKET, s3 } from '@/lib/minio'
import { motivoSvgInseguro } from '@/lib/svgSeguro'
import { erroDoArquivo, nomeRenomeado, SECOES_ARQUIVOS, SVG, type CategoriaArquivoProjeto } from '@/lib/arquivosProjeto'
import { exigirPermissao, type SessaoAuthz } from './authz'
import { registrarAcao } from './auditoriaService'

export class ArquivoProjetoError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const EXPIRA_ENVIO_S = 15 * 60
const EXPIRA_ACESSO_S = 5 * 60

const prefixo = (projetoId: string, categoria: CategoriaArquivoProjeto) => `projetos/${projetoId}/${SECOES_ARQUIVOS[categoria].slug}/`

/** Nome seguro para a chave do objeto (o nome original fica no registro). */
export const nomeNaChave = (nome: string) =>
  // Pontos repetidos ("v.f..png") viram um só: a chave nunca tem "..".
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[-.]+|-+$/g, '').slice(-120) || 'arquivo'

async function acesso(s: SessaoAuthz, projetoId: string, permissao: 'documentos:ver' | 'documentos:editar' | 'documentos:excluir') {
  await exigirPermissao(s, projetoId, 'projeto:ver')
  await exigirPermissao(s, projetoId, permissao)
  const projeto = await prisma.project.findFirst({ where: { id: projetoId, tenantId: s.tenantId, deletedAt: null }, select: { id: true } })
  if (!projeto) throw new ArquivoProjetoError('Projeto não encontrado', 404)
}

/** URL assinada para o navegador enviar o arquivo direto ao storage (PUT, 15 min). */
export async function urlDeEnvio(s: SessaoAuthz, projetoId: string, categoria: CategoriaArquivoProjeto, nome: string, tipo: string, tamanho: number) {
  await acesso(s, projetoId, 'documentos:editar')
  const erro = erroDoArquivo(categoria, tipo, tamanho)
  if (erro) throw new ArquivoProjetoError(erro)
  const chave = `${prefixo(projetoId, categoria)}${randomUUID()}/${nomeNaChave(nome)}`
  // Content-Type entra na assinatura: enviar outro tipo com esta URL é recusado pelo storage.
  // (O registro ainda confere o objeto; esta é a primeira barreira.)
  const url = await getSignedUrl(assinador, new PutObjectCommand({ Bucket: BUCKET, Key: chave, ContentType: tipo }), {
    expiresIn: EXPIRA_ENVIO_S,
    signableHeaders: new Set(['content-type']),
  })
  return { url, chave }
}

/**
 * Registra o arquivo depois do envio: a chave precisa ser deste projeto e
 * seção, e o objeto no storage precisa ter tipo e tamanho aceitos. Objeto
 * recusado é apagado.
 */
export async function registrarArquivo(s: SessaoAuthz, projetoId: string, categoria: CategoriaArquivoProjeto, chave: string, nome: string) {
  await acesso(s, projetoId, 'documentos:editar')
  // Só recusa segmentos de caminho "." e ".."; pontos dentro do nome do arquivo são válidos.
  if (!chave.startsWith(prefixo(projetoId, categoria)) || chave.split('/').some(p => p === '.' || p === '..'))
    throw new ArquivoProjetoError('Não foi possível confirmar o envio deste arquivo. Tente enviar de novo.')
  let tipo = ''
  let tamanho = 0
  try {
    const obj = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: chave }))
    tipo = (obj.ContentType ?? '').split(';')[0].trim().toLowerCase()
    tamanho = Number(obj.ContentLength ?? 0)
  } catch {
    throw new ArquivoProjetoError('O arquivo não chegou ao armazenamento. Tente enviar de novo.')
  }
  let erro = erroDoArquivo(categoria, tipo, tamanho)
  // SVG executa no navegador: só entra sem conteúdo ativo (ADR-042).
  if (!erro && tipo === SVG) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }))
      erro = motivoSvgInseguro(await obj.Body?.transformToString('utf-8') ?? '')
    } catch {
      erro = 'Não foi possível ler o SVG enviado. Tente enviar de novo.'
    }
  }
  if (erro) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: chave })).catch(() => {})
    throw new ArquivoProjetoError(erro)
  }
  const arquivo = await prisma.arquivoProjeto.create({
    data: { tenantId: s.tenantId, projetoId, categoria, nome: nome.trim().slice(0, 255) || 'arquivo', tipo, tamanho, chave, enviadoPorId: s.userId },
  })
  await registrarAcao({ tenantId: s.tenantId, userId: s.userId, action: 'ARQUIVO_PROJETO_ENVIAR', entity: 'ArquivoProjeto', entityId: arquivo.id, details: { projetoId, categoria, nome: arquivo.nome, tamanho } })
  return arquivo
}

export async function listarArquivos(s: SessaoAuthz, projetoId: string, categoria: CategoriaArquivoProjeto) {
  await acesso(s, projetoId, 'documentos:ver')
  return prisma.arquivoProjeto.findMany({
    where: { tenantId: s.tenantId, projetoId, categoria, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, nome: true, tipo: true, tamanho: true, createdAt: true, enviadoPor: { select: { name: true, avatarUrl: true } },
      // Só a estrela de quem está vendo.
      favoritos: { where: { userId: s.userId }, select: { userId: true } },
    },
  }).then(lista => lista.map(({ favoritos, ...a }) => ({ ...a, favorito: favoritos.length > 0 })))
}

/** Marca ou tira a estrela pessoal de um arquivo (quem pode ver o arquivo pode favoritá-lo). */
export async function definirFavorito(s: SessaoAuthz, projetoId: string, id: string, favorito: boolean) {
  await acesso(s, projetoId, 'documentos:ver')
  const arquivo = await prisma.arquivoProjeto.findFirst({ where: { id, projetoId, tenantId: s.tenantId, deletedAt: null }, select: { id: true } })
  if (!arquivo) throw new ArquivoProjetoError('Arquivo não encontrado', 404)
  if (favorito) {
    await prisma.arquivoProjetoFavorito.upsert({
      where: { arquivoId_userId: { arquivoId: id, userId: s.userId } },
      create: { arquivoId: id, userId: s.userId, tenantId: s.tenantId },
      update: {},
    })
  } else {
    await prisma.arquivoProjetoFavorito.deleteMany({ where: { arquivoId: id, userId: s.userId } })
  }
}

/** URL assinada (5 min) para ver ou baixar; `baixar` força o download com o nome original. */
export async function urlDeAcesso(s: SessaoAuthz, projetoId: string, id: string, baixar: boolean) {
  await acesso(s, projetoId, 'documentos:ver')
  const arquivo = await prisma.arquivoProjeto.findFirst({ where: { id, projetoId, tenantId: s.tenantId, deletedAt: null } })
  if (!arquivo) throw new ArquivoProjetoError('Arquivo não encontrado', 404)
  const nome = encodeURIComponent(arquivo.nome)
  // SVG pela URL do storage sempre baixa: exibir só pela origem do app, com CSP sandbox (svgParaExibir).
  const anexo = baixar || arquivo.tipo === SVG
  return getSignedUrl(assinador, new GetObjectCommand({
    Bucket: BUCKET, Key: arquivo.chave,
    ResponseContentType: arquivo.tipo,
    ResponseContentDisposition: `${anexo ? 'attachment' : 'inline'}; filename*=UTF-8''${nome}`,
  }), { expiresIn: EXPIRA_ACESSO_S })
}

/** Largura da miniatura da grade (os blocos vão até ~320 px; 480 cobre telas de alta densidade). */
const LARGURA_PREVIA = 480
/** Miniatura guardada ao lado do original no storage, gerada na primeira visualização. */
export const chaveDaPrevia = (chave: string) => `${chave}.previa-${LARGURA_PREVIA}.webp`
/** Fotos acima disto (em pixels) não são reduzidas: evita imagem forjada para estourar memória. */
const LIMITE_PIXELS = 100_000_000

async function lerObjeto(chave: string): Promise<Buffer | null> {
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: chave }))
    return obj.Body ? Buffer.from(await obj.Body.transformToByteArray()) : null
  } catch (e) {
    if ((e as { name?: string }).name === 'NoSuchKey') return null
    throw e
  }
}

/**
 * Prévia de imagem (miniatura da grade) pela origem do app, numa URL estável que o navegador guarda em cache.
 * É uma versão reduzida (480 px, WebP) gerada na primeira visualização e guardada no storage; as seguintes, de
 * qualquer pessoa, só a leem. Se não der para reduzir (formato que o sharp não lê, imagem enorme), vai o original.
 * Só imagens que não são SVG (o SVG tem o caminho próprio, com CSP sandbox); null para os demais tipos.
 */
export async function imagemParaPrevia(s: SessaoAuthz, projetoId: string, id: string) {
  await acesso(s, projetoId, 'documentos:ver')
  const arquivo = await prisma.arquivoProjeto.findFirst({ where: { id, projetoId, tenantId: s.tenantId, deletedAt: null }, select: { tipo: true, chave: true } })
  if (!arquivo) throw new ArquivoProjetoError('Arquivo não encontrado', 404)
  if (!arquivo.tipo.startsWith('image/') || arquivo.tipo === SVG) return null

  const guardada = await lerObjeto(chaveDaPrevia(arquivo.chave))
  if (guardada) return { corpo: guardada, tipo: 'image/webp', etag: `"p${LARGURA_PREVIA}-${id}"` }

  const original = await lerObjeto(arquivo.chave)
  if (!original) return null
  try {
    const { default: sharp } = await import('sharp')
    const reduzida = await sharp(original, { limitInputPixels: LIMITE_PIXELS })
      .rotate() // respeita a orientação da câmera (EXIF) antes de descartar os metadados
      .resize({ width: LARGURA_PREVIA, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer()
    // Guardar é otimização: se falhar, a próxima visualização gera de novo.
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: chaveDaPrevia(arquivo.chave), Body: reduzida, ContentType: 'image/webp' })).catch(() => {})
    return { corpo: reduzida, tipo: 'image/webp', etag: `"p${LARGURA_PREVIA}-${id}"` }
  } catch (e) {
    console.warn('[arquivos] miniatura não gerada, enviando o original:', e instanceof Error ? e.message : e)
    return { corpo: original, tipo: arquivo.tipo, etag: null }
  }
}

/** Conteúdo do SVG para exibir pela origem do app (com CSP sandbox); null se o arquivo não for SVG. */
export async function svgParaExibir(s: SessaoAuthz, projetoId: string, id: string): Promise<string | null> {
  await acesso(s, projetoId, 'documentos:ver')
  const arquivo = await prisma.arquivoProjeto.findFirst({ where: { id, projetoId, tenantId: s.tenantId, deletedAt: null }, select: { tipo: true, chave: true } })
  if (!arquivo) throw new ArquivoProjetoError('Arquivo não encontrado', 404)
  if (arquivo.tipo !== SVG) return null
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: arquivo.chave }))
  return await obj.Body?.transformToString('utf-8') ?? ''
}

/** Troca só o nome exibido e usado no download; o objeto no storage não muda. */
export async function renomearArquivo(s: SessaoAuthz, projetoId: string, id: string, novoNome: string) {
  await acesso(s, projetoId, 'documentos:editar')
  const arquivo = await prisma.arquivoProjeto.findFirst({ where: { id, projetoId, tenantId: s.tenantId, deletedAt: null } })
  if (!arquivo) throw new ArquivoProjetoError('Arquivo não encontrado', 404)
  const nome = nomeRenomeado(arquivo.nome, novoNome)
  if (!nome) throw new ArquivoProjetoError('Informe um nome para o arquivo.')
  if (nome === arquivo.nome) return arquivo
  const atualizado = await prisma.arquivoProjeto.update({ where: { id }, data: { nome } })
  await registrarAcao({ tenantId: s.tenantId, userId: s.userId, action: 'ARQUIVO_PROJETO_RENOMEAR', entity: 'ArquivoProjeto', entityId: id, details: { projetoId, categoria: arquivo.categoria, de: arquivo.nome, para: nome } })
  return atualizado
}

export async function excluirArquivo(s: SessaoAuthz, projetoId: string, id: string) {
  await acesso(s, projetoId, 'documentos:excluir')
  const arquivo = await prisma.arquivoProjeto.findFirst({ where: { id, projetoId, tenantId: s.tenantId, deletedAt: null } })
  if (!arquivo) throw new ArquivoProjetoError('Arquivo não encontrado', 404)
  await prisma.arquivoProjeto.update({ where: { id }, data: { deletedAt: new Date() } })
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: arquivo.chave })).catch(() => {})
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: chaveDaPrevia(arquivo.chave) })).catch(() => {})
  await registrarAcao({ tenantId: s.tenantId, userId: s.userId, action: 'ARQUIVO_PROJETO_EXCLUIR', entity: 'ArquivoProjeto', entityId: id, details: { projetoId, categoria: arquivo.categoria, nome: arquivo.nome } })
}
