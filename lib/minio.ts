import { S3Client } from '@aws-sdk/client-s3'

/**
 * S3-compatible client configured to talk to a MinIO instance.
 *
 * Environment variables:
 *   MINIO_ENDPOINT   - hostname of the MinIO container (default: "localhost")
 *   MINIO_PORT       - port MinIO listens on (default: "9000")
 *   MINIO_ACCESS_KEY - MinIO root user / access key
 *   MINIO_SECRET_KEY - MinIO root password / secret key
 *
 * In Docker Compose the endpoint is the service name ("minio").
 * In local dev it is "localhost" with port 9000.
 */
const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost'
const port     = parseInt(process.env.MINIO_PORT ?? '9000', 10)
const useSSL   = process.env.MINIO_USE_SSL === 'true'

export const s3 = new S3Client({
  endpoint: `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`,
  region: 'us-east-1',   // required by SDK but ignored by MinIO
  credentials: {
    accessKeyId:     process.env.MINIO_ACCESS_KEY ?? '',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? '',
  },
  forcePathStyle: true,  // required for MinIO (path-style: bucket is in the URL path)
})

export const BUCKET = process.env.MINIO_BUCKET ?? 'mvloperum-dev'

/**
 * Returns the public URL for a given object key.
 * Avatars and logos are served directly from the MinIO public URL.
 *
 * MINIO_PUBLIC_URL example: "https://files.mvloperum.com"
 */
export function publicUrl(key: string): string {
  const base = (process.env.MINIO_PUBLIC_URL ?? `http://localhost:9000`).replace(/\/$/, '')
  return `${base}/${BUCKET}/${key}`
}

/**
 * Assina URLs com o endereço público (MINIO_PUBLIC_URL), para o navegador
 * enviar e baixar direto do storage (vídeos grandes não passam pelo app).
 * Sem MINIO_PUBLIC_URL, assina com o endereço interno, como o file-service.
 */
const enderecoPublico = (process.env.MINIO_PUBLIC_URL ?? '').replace(/\/$/, '')
export const assinador = enderecoPublico
  ? new S3Client({
      endpoint: enderecoPublico,
      region: 'us-east-1',
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? '',
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? '',
      },
      forcePathStyle: true,
    })
  : s3
