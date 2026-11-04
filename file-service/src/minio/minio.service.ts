import { Injectable } from '@nestjs/common'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

@Injectable()
export class MinioService {
  private readonly s3: S3Client
  /**
   * Só assina URLs (sem chamada de rede). Usa o endpoint público: a
   * assinatura SigV4 inclui o host, então uma URL assinada com o host interno
   * (`http://minio:9000`) não abre no navegador, e trocar o host depois de
   * assinar invalida a assinatura (SDD 4.2).
   */
  private readonly signer: S3Client
  private readonly bucket: string
  private readonly publicUrl: string

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'minio'
    const port = Number(process.env.MINIO_PORT ?? 9000)
    const useSSL = process.env.MINIO_USE_SSL === 'true'
    const internalEndpoint = `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`
    const credentials = {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? '',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? '',
    }

    this.bucket = process.env.MINIO_BUCKET ?? 'mvloperum'
    this.publicUrl = (process.env.MINIO_PUBLIC_URL ?? '').replace(/\/$/, '')

    this.s3 = new S3Client({ endpoint: internalEndpoint, region: 'us-east-1', credentials, forcePathStyle: true })
    // Sem MINIO_PUBLIC_URL (ex.: teste local sem proxy), assina com o interno mesmo.
    this.signer = new S3Client({
      endpoint: this.publicUrl || internalEndpoint,
      region: 'us-east-1',
      credentials,
      forcePathStyle: true,
    })
  }

  async upload(key: string, buffer: Buffer, contentType: string, contentDisposition?: string): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
      }),
    )
    return `${this.publicUrl}/${this.bucket}/${key}`
  }

  async delete(key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch {
      // Object may already be gone
    }
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    )
  }

  extractKey(fileUrl: string): string | null {
    const prefix = `${this.publicUrl}/${this.bucket}/`
    if (fileUrl.startsWith(prefix)) return fileUrl.slice(prefix.length)
    // O exemplo local antigo apontava para a porta do console. Reassina as chaves
    // já gravadas nesse ambiente usando o endpoint atual da API do MinIO.
    const legacyLocalPrefix = `http://localhost:9001/${this.bucket}/`
    return this.publicUrl === 'http://localhost:9000' && fileUrl.startsWith(legacyLocalPrefix)
      ? fileUrl.slice(legacyLocalPrefix.length)
      : null
  }

  buildKey(type: 'uploads' | 'avatars' | 'logos', id: string, fileName: string): string {
    return `${type}/${id}/${fileName}`
  }
}
