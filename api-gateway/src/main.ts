import 'dotenv/config'
import { createGatewayApp } from './app'
// Porta interna: app Next.js e mcp-server (rede Docker). Porta pública: Traefik.
const PORT = Number(process.env.PORT ?? 4000)
const PUBLIC_PORT = Number(process.env.PUBLIC_PORT ?? 4080)
createGatewayApp().listen(PORT, () => console.log(`api-gateway (interno) listening on :${PORT}`))
createGatewayApp({ publicExposure: true }).listen(PUBLIC_PORT, () => console.log(`api-gateway (público) listening on :${PUBLIC_PORT}`))
