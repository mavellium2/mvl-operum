import express from 'express'
import { registerUploadRoute } from './uploadRoute.js'
import { telemetry, metrics } from './telemetry.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildServer } from './server.js'
import { isOAuthToken, parseTokens, TenantRegistry } from './tenants.js'
import { oauthResourceConfig, protectedResourceMetadata, wwwAuthenticate } from './oauth.js'
import { timingSafeEqual } from 'crypto'

/** Comparação em tempo constante (não vaza o tamanho do prefixo correto pelo tempo de resposta). */
function mesmoSegredo(recebido: string | undefined, esperado: string): boolean {
  if (typeof recebido !== 'string') return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface AppOptions {
  env?: NodeJS.ProcessEnv
  makeRegistry?: (tokens: string[]) => TenantRegistry
}

export function createApp({ env = process.env, makeRegistry = tokens => new TenantRegistry(tokens) }: AppOptions = {}) {
const app = express()
app.use(telemetry)
app.get('/health/metrics', (req, res) => {
  if (!process.env.INTERNAL_API_KEY || !mesmoSegredo(req.headers.authorization, `Bearer ${process.env.INTERNAL_API_KEY}`)) return res.status(401).end()
  res.type('text/plain').send(metrics())
})
// 15 MB: operum_upload_attachment aceita até 10 MB em content_base64 (≈13,4 MB em base64).
// O parse vem depois da checagem do token, para requisição sem PAT não fazer o
// servidor ler um corpo desse tamanho.
registerUploadRoute(app)

// Metadados do recurso protegido (RFC 9728): o Claude descobre por aqui o
// servidor de autorização do Operum.
const oauthCfg = oauthResourceConfig(env)
if (oauthCfg) {
  for (const path of oauthCfg.metadataPaths) {
    app.get(path, (_req, res) => {
      res.set('Cache-Control', 'public, max-age=300').json(protectedResourceMetadata(oauthCfg))
    })
  }
}

const jsonBody = express.json({ limit: '15mb' })

app.post('/mcp', (req, res, next) => {
  // Authorization: Bearer <pat> = tenant padrão; X-Operum-Tokens: <pat>,<pat> = demais tenants.
  // A validação real de cada token acontece no api-gateway, a cada chamada.
  const tokens = parseTokens(req.headers.authorization, req.headers['x-operum-tokens'])
  if (!tokens || (isOAuthToken(tokens[0]) && !oauthCfg)) {
    res.status(401).set('WWW-Authenticate', wwwAuthenticate(oauthCfg)).end()
    return
  }
  res.locals.tokens = tokens
  next()
}, async (_req, res, next) => {
  // Token OAuth vencido ou revogado precisa voltar como HTTP 401 (não como erro
  // dentro da tool), para o Claude renovar o token ou pedir novo login.
  const tokens = res.locals.tokens as string[]
  const registry = makeRegistry(tokens)
  res.locals.registry = registry
  if (!registry.isOAuth) return next()
  try {
    await registry.getDefault()
    next()
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 401) {
      res.status(401).set('WWW-Authenticate', wwwAuthenticate(oauthCfg, 'invalid_token')).end()
      return
    }
    res.status(503).json({ error: 'Operum indisponível no momento, tente novamente.' })
  }
}, jsonBody, async (req, res) => {
  const server = buildServer(res.locals.registry as TenantRegistry)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

// Stateless (D3): GET/DELETE em /mcp não são suportados — sem sessão para retomar/fechar.
app.all('/mcp', (_req, res) => res.status(405).end())

app.get('/health', (_req, res) => res.json({ ok: true }))
app.get('/health/ready', async (_req, res) => {
  let ready = false
  try {
    ready = (await fetch(`${process.env.API_GATEWAY_INTERNAL_URL ?? 'http://api-gateway:4000'}/health/ready`, { signal: AbortSignal.timeout(3000) })).ok
  } catch { /* bounded failure */ }
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not ready' })
})

return app
}
