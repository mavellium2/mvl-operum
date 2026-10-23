import type { Express, Request, Response as ExpressResponse, NextFunction } from 'express'
import Busboy from 'busboy'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { gateway, gatewayAuthHeaders } from './gateway.js'
import { MAX_ATTACHMENT_BYTES, ACCEPTED_TYPES_LABEL, resolveMime, safeFileName } from './attachmentTypes.js'
import { UploadLinks, UploadLinkError, uploadLinks } from './uploadLink.js'

class UploadError extends Error { constructor(readonly status: number, message: string) { super(message) } }
export interface UploadRouteDeps { links: UploadLinks; fetch: typeof fetch; gateway: typeof gateway; maxBytes: number }
export function registerUploadRoute(app: Express, deps: UploadRouteDeps = { links: uploadLinks, fetch, gateway, maxBytes: MAX_ATTACHMENT_BYTES }) {
  const peers = new Map<string, number>(); let active = 0, nextSweep = 0
  const limiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    keyGenerator: req => ipKeyGenerator(req.socket.remoteAddress || 'unknown'),
    validate: { xForwardedForHeader: false }, message: { error: 'Tente novamente depois.' },
  })
  function admitPeer(req: Request, res: ExpressResponse, next: NextFunction) {
    // Cap peers before the middleware allocates an in-memory counter. Never trust X-Forwarded-For.
    const ip = ipKeyGenerator(req.socket.remoteAddress || 'unknown'), now = Date.now()
    if (now >= nextSweep) { for (const [key, expires] of peers) if (expires <= now) peers.delete(key); nextSweep = now+60_000 }
    if (!peers.has(ip) && peers.size >= 10_000) return res.status(429).json({ error: 'Tente novamente depois.' })
    peers.set(ip, now+60_000); next()
  }
  app.post('/uploads/:token', admitPeer, limiter, async (req, res) => {
    if (active >= 2) return res.status(429).json({ error: 'Tente novamente depois.' })
    let dir: string | undefined
    active++
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(),120_000)
    const disconnect = () => controller.abort(); req.on('aborted',disconnect)
    try {
      const grant = deps.links.consume(String(req.params.token))
      const gw = deps.gateway(grant.pat, grant.tenantId)
      const me = await gw.get<{ tenantId: string }>('/auth/me')
      if (me.tenantId !== grant.tenantId) throw new UploadError(403,'Sem permissão.')
      await gw.get(`/cards/${grant.taskId}`) // recheck current PAT and task access before reading multipart
      if (Number(req.headers['content-length']) > deps.maxBytes+64*1024) throw new UploadError(413,'Arquivo acima do limite de 50 MB do Operum.')
      dir = await mkdtemp(join(tmpdir(),'operum-upload-'))
      const path = join(dir,'file')
      const { mime, name } = await receive(req,path,grant.fileName,deps.maxBytes,controller.signal)
      if (!(await stat(path)).size) throw new UploadError(400,'O arquivo está vazio.')
      const boundary = `operum${randomBytes(24).toString('hex')}`
      async function* multipart() {
        yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name.replace(/[^\x20-\x7e]/g,'_')}"\r\nContent-Type: ${mime}\r\n\r\n`)
        for await (const chunk of createReadStream(path)) yield chunk
        yield Buffer.from(`\r\n--${boundary}--\r\n`)
      }
      const base = (process.env.API_GATEWAY_INTERNAL_URL ?? 'http://api-gateway:4000').replace(/\/$/,'')
      const upstream = await deps.fetch(`${base}/files/upload?cardId=${grant.taskId}`, { method: 'POST', redirect: 'error', signal: controller.signal, headers: { ...gatewayAuthHeaders(grant.pat, grant.tenantId), 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'X-Request-ID': String(req.headers['x-request-id'] ?? '') }, body: Readable.toWeb(Readable.from(multipart())) as ReadableStream, duplex: 'half' } as RequestInit & { duplex: 'half' })
      if (!upstream.ok) throw new UploadError(upstream.status === 413 ? 413 : upstream.status === 401 || upstream.status === 403 ? upstream.status : 502, upstream.status === 413 ? 'Arquivo acima do limite de 50 MB do Operum.' : 'Não foi possível anexar o arquivo. Gere um novo link para tentar novamente.')
      const attachment = await upstream.json() as { id: string }
      await gw.post('/audit',{ action: 'CREATE', entity: 'attachment', entityId: attachment.id, details: { via: 'mcp', tool: 'operum_create_upload_link', cardId: grant.taskId } }).catch(() => {})
      res.json(attachment)
    } catch (error) {
      const upstreamStatus = (error as { status?: number })?.status
      const safe = error instanceof UploadLinkError || error instanceof UploadError
      if (!res.headersSent) res.status(safe ? error.status : upstreamStatus === 401 || upstreamStatus === 403 || upstreamStatus === 404 ? upstreamStatus : 502).json({ error: safe ? error.message : 'Não foi possível anexar o arquivo. Gere um novo link para tentar novamente.' })
      req.resume()
    } finally {
      controller.abort(); clearTimeout(timer); req.off('aborted',disconnect); active--
      if (dir) await rm(dir,{ recursive: true, force: true })
    }
  })
}
async function receive(req: Request, path: string, override: string | undefined, maxBytes: number, signal: AbortSignal): Promise<{ mime: string; name: string }> {
  return new Promise((resolve,reject) => {
    let parser: ReturnType<typeof Busboy>
    try { parser = Busboy({ headers: req.headers, defParamCharset: 'utf8', limits: { files: 2, fields: 1, parts: 2, fileSize: maxBytes+1, headerPairs: 50 } }) } catch { reject(new UploadError(400,'Envie multipart com um único campo file.')); return }
    let metadata: { mime: string; name: string } | undefined, failed: Error | undefined, written: Promise<void> | undefined
    const fail = (e: Error) => { failed ??= e }
    const abort = () => { req.unpipe(parser); parser.destroy(failed ?? new UploadError(408,'Tempo de upload esgotado.')) }
    let received = 0
    const meter = (chunk: Buffer) => { received += chunk.length; if (received > maxBytes+64*1024) { fail(new UploadError(413,'Arquivo acima do limite de 50 MB do Operum.')); abort() } }
    req.on('data',meter)
    signal.addEventListener('abort',abort,{ once: true })
    if (signal.aborted) { req.off('data',meter); reject(new UploadError(408,'Tempo de upload esgotado.')); return }
    let fileCount = 0
    parser.on('field',()=>fail(new UploadError(400,'Envie um único campo file.')))
    parser.on('file',(field,file,info) => {
      if (++fileCount > 1) { fail(new UploadError(400,'Envie um único campo file.')); file.resume(); return }
      const rawName = override || info.filename, mime = resolveMime(rawName,info.mimeType)
      if (field !== 'file' || !mime) { fail(new UploadError(400, !mime ? `Tipo de arquivo não suportado. Aceitos: ${ACCEPTED_TYPES_LABEL}.` : 'Envie um único campo file.')); file.resume(); return }
      metadata = { mime, name: safeFileName(rawName,mime) }
      let size = 0; file.on('data',(chunk: Buffer) => { size += chunk.length; if (size > maxBytes) fail(new UploadError(413,'Arquivo acima do limite de 50 MB do Operum.')) })
      file.on('limit',()=>fail(new UploadError(413,'Arquivo acima do limite de 50 MB do Operum.')))
      written = pipeline(file,createWriteStream(path,{ flags: 'wx', mode: 0o600 }),{ signal }).catch(e=>{ fail(e) })
    })
    for (const event of ['filesLimit','fieldsLimit','partsLimit']) parser.on(event,()=>fail(new UploadError(400,'Envie um único campo file.')))
    parser.on('error',e=>{ signal.removeEventListener('abort',abort); req.off('data',meter); reject(failed ?? (e instanceof UploadError ? e : new UploadError(400,'Multipart inválido.'))) })
    parser.on('close',async()=>{ signal.removeEventListener('abort',abort); req.off('data',meter); await written; if (failed) reject(failed); else if (!metadata) reject(new UploadError(400,'Envie um único campo file.')); else resolve(metadata) })
    req.pipe(parser)
  })
}
