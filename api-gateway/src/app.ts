import express from 'express'
import { telemetry, metrics } from './telemetry'
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware'
import rateLimit from 'express-rate-limit'
import { authorizationMiddleware } from './middleware/authorization'
import { authMiddleware, isPublicAuthAllowed, sameSecret } from './middleware/auth'

export interface GatewayOptions {
  /** Porta exposta pelo Traefik: restringe /auth/* às leituras de identidade. */
  publicExposure?: boolean
}

export function createGatewayApp({ publicExposure = false }: GatewayOptions = {}) {
const app = express()
// O Traefik (rede Docker privada) repassa o IP do cliente em X-Forwarded-For.
// Confiar só em loopback/redes privadas: o Express lê a cadeia da direita para
// a esquerda e para no primeiro IP público, então um X-Forwarded-For forjado
// pelo cliente não troca o IP usado nos limites abaixo (antes todos os
// clientes dividiam o balde do IP do Traefik).
app.set('trust proxy', process.env.GATEWAY_TRUST_PROXY ?? 'loopback, uniquelocal')
app.use(telemetry)
app.use(
  rateLimit({
    windowMs: 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  }),
)

app.get('/health/metrics', (req, res) => {
  const key = process.env.INTERNAL_API_KEY
  if (!key || !sameSecret(req.headers.authorization ?? '', `Bearer ${key}`)) return res.status(401).end()
  res.type('text/plain').send(metrics())
})

// Porta pública: depois do limite global, antes de autenticar ou repassar.
if (publicExposure) {
  app.use((req, res, next) => (isPublicAuthAllowed(req.method, req.path) ? next() : res.status(404).end()))
}

app.use((req, res, next) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)
  const origin = req.headers.origin
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Tenant-ID,X-Internal-Api-Key')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.get('/health/ready', async (_req, res) => {
  const services = ['AUTH', 'PROJECT', 'SPRINT', 'FILE', 'NOTIFICATION']
  const ready = await Promise.all(services.map(async name => {
    const port = { AUTH: 4001, PROJECT: 4002, SPRINT: 4003, NOTIFICATION: 4004, FILE: 4005 }[name]
    try {
      const url = process.env[`${name}_SERVICE_URL`] ?? `http://${name.toLowerCase()}-service:${port}`
      return (await fetch(`${url}/health/ready`, { signal: AbortSignal.timeout(2500) })).ok
    } catch { return false }
  }))
  res.status(ready.every(Boolean) ? 200 : 503).json({ status: ready.every(Boolean) ? 'ready' : 'not ready' })
})


// Limites próprios do servidor de autorização OAuth, antes da autenticação, por IP do cliente.
app.use('/oauth/register', rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_requests' } }))
app.use('/oauth/token', rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_requests' } }))

app.use(authMiddleware())

// Rate limit adicional por PAT ou conexão OAuth (20 req/s por token), além do limite global por IP acima.
// x-auth-type/x-api-token-id só chegam aqui se authMiddleware() os definiu a
// partir de uma introspecção válida — nunca são repassados de um valor
// enviado pelo cliente (ver limpeza no início de authMiddleware).
const PAT_RATE_LIMIT_MAX = 20
const PAT_RATE_LIMIT_WINDOW_MS = 1000
const PAT_RATE_LIMIT_MAX_BUCKETS = 10_000
const patRateLimitBuckets = new Map<string, { count: number; windowStart: number }>()

function sweepStaleRateLimitBuckets(now: number) {
  if (patRateLimitBuckets.size < PAT_RATE_LIMIT_MAX_BUCKETS) return
  for (const [key, bucket] of patRateLimitBuckets) {
    if (now - bucket.windowStart >= PAT_RATE_LIMIT_WINDOW_MS * 2) {
      patRateLimitBuckets.delete(key)
    }
  }
}

app.use((req, res, next) => {
  const authType = req.headers['x-auth-type']
  if (authType !== 'pat' && authType !== 'oauth') return next()
  const tokenId = req.headers['x-api-token-id'] as string | undefined
  if (!tokenId) return next()

  const now = Date.now()
  const bucket = patRateLimitBuckets.get(tokenId)
  if (!bucket || now - bucket.windowStart >= PAT_RATE_LIMIT_WINDOW_MS) {
    sweepStaleRateLimitBuckets(now)
    patRateLimitBuckets.set(tokenId, { count: 1, windowStart: now })
    return next()
  }

  bucket.count += 1
  if (bucket.count > PAT_RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests' })
  }
  next()
})

app.use(express.json({ limit: '2mb' }))
app.use(authorizationMiddleware())

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? ''

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://auth-service:4001'
const PROJECT_SERVICE_URL = process.env.PROJECT_SERVICE_URL ?? 'http://project-service:4002'
const SPRINT_SERVICE_URL = process.env.SPRINT_SERVICE_URL ?? 'http://sprint-service:4003'
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL ?? 'http://notification-service:4004'
const FILE_SERVICE_URL = process.env.FILE_SERVICE_URL ?? 'http://file-service:4005'

function makeProxy(targetUrl: string, prefix: string) {
  return createProxyMiddleware({ target: targetUrl, changeOrigin: true, pathRewrite: { '^/': `${prefix}/` }, on: { proxyReq: (proxyReq, req) => { proxyReq.setHeader('X-Internal-Api-Key', INTERNAL_API_KEY); fixRequestBody(proxyReq, req) } } })
}

const proxyRoutes = [
  { context: '/auth', target: AUTH_SERVICE_URL },
  { context: '/oauth', target: AUTH_SERVICE_URL },
  { context: '/.well-known/oauth-authorization-server', target: AUTH_SERVICE_URL },
  { context: '/projects', target: PROJECT_SERVICE_URL },
  { context: '/departments', target: PROJECT_SERVICE_URL },
  { context: '/roles', target: PROJECT_SERVICE_URL },
  { context: '/permissions', target: PROJECT_SERVICE_URL },
  { context: '/stakeholders', target: PROJECT_SERVICE_URL },
  { context: '/sprints', target: SPRINT_SERVICE_URL },
  { context: '/dashboard', target: SPRINT_SERVICE_URL },
  { context: '/cards', target: SPRINT_SERVICE_URL },
  { context: '/tags', target: SPRINT_SERVICE_URL },
  { context: '/time-entries', target: SPRINT_SERVICE_URL },
  { context: '/audit', target: SPRINT_SERVICE_URL },
  { context: '/notifications', target: NOTIFICATION_SERVICE_URL },
  { context: '/files', target: FILE_SERVICE_URL },
]

for (const { context, target } of proxyRoutes) {
  const proxy = makeProxy(target, context)
  app.use(context, (req: express.Request, res: express.Response, next: express.NextFunction) => {
    proxy(req, res, next)
  })
}


return app
}
