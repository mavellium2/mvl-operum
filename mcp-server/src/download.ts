import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { UserError } from './errors.js'

/**
 * Download de anexo por URL (operum_upload_attachment com `url`), protegido
 * contra SSRF: o mcp-server roda na rede interna do Docker, onde uma URL
 * qualquer alcançaria api-gateway, file-service, MinIO, Postgres...
 *
 * - só HTTPS na porta 443;
 * - o IP é conferido no `lookup` da própria conexão (não numa consulta DNS
 *   separada), então um DNS que troca de resposta (rebinding) não escapa;
 * - redirecionamentos são seguidos à mão e cada salto passa pelas mesmas regras;
 * - limite de bytes (Content-Length e contagem no stream) e timeout total.
 */

const BLOCKED = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(net, prefix, 'ipv4')
// IPv4-mapeado (::ffff:a.b.c.d, inclusive em hex) cai nas regras IPv4 acima: o
// BlockList do Node faz esse mapeamento. Uma regra ::ffff:0:0/96 bloquearia todo IPv4.
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) BLOCKED.addSubnet(net, prefix, 'ipv6')

/** Endereço roteável na internet pública (fora de rede privada, loopback, link-local, reservados). */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 0) return false
  return !BLOCKED.check(ip, family === 4 ? 'ipv4' : 'ipv6')
}

const MAX_REDIRECTS = 3
const TIMEOUT_MS = 60_000

export interface Downloaded {
  bytes: Buffer
  contentType: string | undefined
  /** Último segmento do caminho da URL final, decodificado (sugestão de nome). */
  fileName: string | undefined
}

export interface DownloadOptions {
  maxBytes: number
  /** Só para testes: aceita o servidor local. Em produção fica o padrão. */
  isAllowedAddress?: (ip: string) => boolean
  /** Só para testes: servidor HTTPS local com certificado próprio. */
  ca?: string | Buffer
  /** Só para testes: o servidor local não escuta na 443. */
  allowAnyPort?: boolean
}

export type Downloader = (url: string, opts: DownloadOptions) => Promise<Downloaded>

function blocked(): UserError {
  return new UserError('URL recusada: o endereço não é público. Use uma URL HTTPS acessível pela internet.')
}

function checkUrl(raw: string, allowed: (ip: string) => boolean, anyPort = false): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UserError('URL inválida.')
  }
  if (url.protocol !== 'https:') throw new UserError('Só URLs HTTPS são aceitas para baixar o anexo.')
  if (url.username || url.password) throw new UserError('A URL não pode conter usuário ou senha.')
  if (url.port && url.port !== '443' && !anyPort) throw new UserError('A URL deve usar a porta padrão do HTTPS (443).')
  // IP literal não passa pelo lookup: confere aqui.
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && !allowed(host)) throw blocked()
  return url
}

function safeLookup(allowed: (ip: string) => boolean): LookupFunction {
  return ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    dnsLookup(hostname, { all: true }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err)
      if (!addresses.length || addresses.some(a => !allowed(a.address))) return callback(blocked())
      if (options?.all) return callback(null, addresses)
      callback(null, addresses[0].address, addresses[0].family)
    })
  }) as LookupFunction
}

function tooBig(maxBytes: number): UserError {
  return new UserError(`O arquivo passa do limite de ${Math.round(maxBytes / (1024 * 1024))} MB.`)
}

function fetchOnce(url: URL, opts: DownloadOptions, deadline: number): Promise<{ redirect?: string; result?: Downloaded }> {
  const allowed = opts.isAllowedAddress ?? isPublicAddress
  return new Promise((resolve, reject) => {
    const fail = (err: Error) => {
      if (err instanceof UserError) return reject(err)
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return reject(new UserError('A URL demorou demais para responder (timeout).'))
      }
      reject(new UserError(`Não foi possível baixar a URL: ${err.message}`))
    }
    const req = https.get(
      url,
      {
        lookup: safeLookup(allowed),
        // Sem pool: toda conexão passa pelo lookup acima (um socket reaproveitado não passaria).
        agent: false,
        headers: { 'user-agent': 'OperumMCP/1.0', accept: '*/*' },
        // Prazo total do download (todos os saltos), não só inatividade do socket.
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        ...(opts.ca ? { ca: opts.ca } : {}),
      },
      res => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          resolve({ redirect: new URL(res.headers.location, url).toString() })
          return
        }
        if (status < 200 || status >= 300) {
          res.resume()
          reject(new UserError(`A URL respondeu HTTP ${status}; não foi possível baixar o arquivo.`))
          return
        }
        const declared = Number(res.headers['content-length'])
        if (Number.isFinite(declared) && declared > opts.maxBytes) {
          res.destroy()
          reject(tooBig(opts.maxBytes))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > opts.maxBytes) {
            res.destroy()
            reject(tooBig(opts.maxBytes))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const last = decodeURIComponentSafe(url.pathname.split('/').filter(Boolean).pop() ?? '')
          resolve({
            result: {
              bytes: Buffer.concat(chunks),
              contentType: res.headers['content-type'],
              fileName: last || undefined,
            },
          })
        })
        res.on('error', fail)
      },
    )
    req.on('error', fail)
  })
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// Cada download pode ocupar até `maxBytes` (50 MB) de memória num container de
// 256 MB: chamadas simultâneas acima do limite são recusadas, como em /uploads.
export const MAX_DOWNLOADS_SIMULTANEOS = 2
let downloadsEmAndamento = 0

export const safeDownload: Downloader = async (raw, opts) => {
  if (downloadsEmAndamento >= MAX_DOWNLOADS_SIMULTANEOS) {
    throw new UserError('Outro anexo por URL ainda está sendo baixado. Tente de novo em instantes.')
  }
  downloadsEmAndamento++
  try {
    return await baixar(raw, opts)
  } finally {
    downloadsEmAndamento--
  }
}

const baixar: Downloader = async (raw, opts) => {
  const allowed = opts.isAllowedAddress ?? isPublicAddress
  const deadline = Date.now() + TIMEOUT_MS
  let url = checkUrl(raw, allowed, opts.allowAnyPort)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const { redirect, result } = await fetchOnce(url, opts, deadline)
    if (result) return result
    url = checkUrl(redirect!, allowed, opts.allowAnyPort)
  }
  throw new UserError(`A URL redirecionou mais de ${MAX_REDIRECTS} vezes.`)
}
