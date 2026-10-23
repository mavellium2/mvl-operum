import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { isLoopback, isValidRedirectUri } from './redirect'

/**
 * Leitura de Client ID Metadata Document (CIMD), com proteção a SSRF
 * (SDD-mcp-oauth §4.2). O auth-service roda na rede interna, então uma URL
 * qualquer alcançaria os outros serviços:
 *
 * - só hosts da allowlist (`OAUTH_CIMD_ALLOWED_HOSTS`), HTTPS na porta 443;
 * - o IP é conferido no `lookup` da própria conexão (resiste a DNS rebinding);
 * - sem seguir redirecionamentos, 5 s de prazo e 64 KB de limite.
 */

const BLOCKED = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) BLOCKED.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) BLOCKED.addSubnet(net, prefix, 'ipv6')

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 0) return false
  return !BLOCKED.check(ip, family === 4 ? 'ipv4' : 'ipv6')
}

const MAX_BYTES = 64 * 1024
const TIMEOUT_MS = 5_000

export class CimdError extends Error {}

export interface ClientMetadata {
  name: string
  redirectUris: string[]
}

export type CimdFetcher = (clientId: string) => Promise<ClientMetadata>

/** `client_id` em forma de URL CIMD: HTTPS, com caminho, sem porta, query, fragmento ou credenciais. */
export function isCimdClientId(clientId: string): boolean {
  let u: URL
  try {
    u = new URL(clientId)
  } catch {
    return false
  }
  return u.protocol === 'https:' && !u.port && !u.username && !u.password && !u.hash && !u.search && u.pathname.length > 1
}

export function cimdHostAllowed(clientId: string, allowedHosts: string[]): boolean {
  if (!isCimdClientId(clientId)) return false
  return allowedHosts.includes(new URL(clientId).hostname.toLowerCase())
}

function safeLookup(allowed: (ip: string) => boolean): LookupFunction {
  return ((hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    dnsLookup(hostname, { all: true }, (err, addresses: LookupAddress[]) => {
      if (err) return callback(err)
      if (!addresses.length || addresses.some(a => !allowed(a.address))) {
        return callback(new CimdError('endereço do client_id não é público'))
      }
      if (options?.all) return callback(null, addresses)
      callback(null, addresses[0].address, addresses[0].family)
    })
  }) as LookupFunction
}

function fetchJson(url: string, allowed: (ip: string) => boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup: safeLookup(allowed),
        agent: false,
        headers: { 'user-agent': 'OperumOAuth/1.0', accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
      res => {
        const status = res.statusCode ?? 0
        if (status !== 200) {
          res.resume()
          return reject(new CimdError(`documento do cliente respondeu HTTP ${status}`))
        }
        const declared = Number(res.headers['content-length'])
        if (Number.isFinite(declared) && declared > MAX_BYTES) {
          res.destroy()
          return reject(new CimdError('documento do cliente grande demais'))
        }
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_BYTES) {
            res.destroy()
            return reject(new CimdError('documento do cliente grande demais'))
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
          } catch {
            reject(new CimdError('documento do cliente não é JSON'))
          }
        })
        res.on('error', err => reject(new CimdError(err.message)))
      },
    )
    req.on('error', err => reject(err instanceof CimdError ? err : new CimdError(err.message)))
  })
}

/** Confere a estrutura do documento (CIMD §4.1 e MCP 2025-11-25). */
export function parseClientMetadata(clientId: string, doc: unknown): ClientMetadata {
  if (!doc || typeof doc !== 'object') throw new CimdError('documento do cliente inválido')
  const d = doc as Record<string, unknown>
  if (d.client_id !== clientId) throw new CimdError('client_id do documento não confere com a URL')
  const name = typeof d.client_name === 'string' ? d.client_name.trim().slice(0, 100) : ''
  if (!name) throw new CimdError('documento do cliente sem client_name')
  const uris = d.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10 || !uris.every(u => typeof u === 'string' && isValidRedirectUri(u))) {
    throw new CimdError('redirect_uris inválidos no documento do cliente')
  }
  // O documento é declarado pelo próprio cliente: redirect que não é loopback
  // tem de ficar na mesma origem do client_id (recomendação da Anthropic).
  const origin = new URL(clientId).origin
  if ((uris as string[]).some(u => !isLoopback(u) && new URL(u).origin !== origin)) {
    throw new CimdError('redirect_uris fora da origem do client_id')
  }
  const method = d.token_endpoint_auth_method
  if (method !== undefined && method !== 'none') {
    throw new CimdError('só clientes públicos (token_endpoint_auth_method "none") são aceitos')
  }
  return { name, redirectUris: uris as string[] }
}

export const fetchClientMetadata: CimdFetcher = async clientId => {
  const doc = await fetchJson(clientId, isPublicAddress)
  return parseClientMetadata(clientId, doc)
}
