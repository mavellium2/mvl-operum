import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

const isDev = process.env.NODE_ENV === 'development'

// Versão exibida na UI (sidebar e /sobre); fonte única: package.json.
const APP_VERSION: string = JSON.parse(readFileSync(`${process.cwd()}/package.json`, 'utf8')).version

const MINIO_PUBLIC = process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000'

const CSP = [
  "default-src 'self'",
  // unsafe-eval required by React dev tools (reconstructing callstacks); never used in production
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // i.ytimg.com: miniatura dos anexos que são link de vídeo do YouTube.
  `img-src 'self' data: blob: https://*.operum.adm.br https://i.ytimg.com ${isDev ? MINIO_PUBLIC : ''}`.trim(),
  "font-src 'self'",
  "connect-src 'self' https://*.operum.adm.br https://viacep.com.br",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: APP_VERSION },

  // TypeScript is checked separately via `tsc --noEmit` (Next.js worker OOMs on this machine).
  typescript: { ignoreBuildErrors: true },

  // Limit concurrent workers to avoid OOM in memory-constrained environments.
  experimental: {
    cpus: 2,
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },

  // Enables standalone output for Docker — copies only necessary files.
  // Required for the production Dockerfile to work correctly.
  output: "standalone",
  outputFileTracingIncludes: { "/sobre": ["./CHANGELOG.md"] },

  // Allow images from MinIO (replace domain with your actual MinIO domain)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.operum.adm.br",
      },
      {
        // Local MinIO for development
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Consentimento OAuth: sem cache e sem vazar a query (client_id,
        // redirect_uri, state) no Referer. Fica depois da regra geral porque,
        // no mesmo cabeçalho, a última regra vence.
        source: "/oauth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
