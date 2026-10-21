'use server'
import { randomUUID } from 'node:crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3, BUCKET, publicUrl } from '@/lib/minio'
import { FileUploadSchema } from '@/lib/validation/fileSchemas'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { requireProjectPermission as exigirPermissao } from '@/services/projectAccess'
import {
  excluirAta,
  submeterDocumento,
} from '@/services/documentRevisionService'
import {
  CriarAtaSchema,
  AtualizarAtaSchema,
  type CriarAtaInput,
  type AtualizarAtaInput,
} from '@/lib/validation/ataSchemas'

export async function criarAtaAction(input: CriarAtaInput) {
  try {
    const s = await verifySession()
    const { projetoId, ...payload } = CriarAtaSchema.parse(input)
    const id = randomUUID()
    const version = await submeterDocumento(
      s,
      projetoId,
      'ATA',
      payload,
      {
        commitTitle: 'Nova ata de reunião',
        versao: '1',
        elaboradoPor: payload.elaboradoPor,
        aprovadoPor: payload.aprovadoPor ?? '',
        dataAprovacao: '',
      },
      id,
    )
    revalidatePath(`/projetos/${projetoId}/documentacao`)
    revalidatePath(`/projetos/${projetoId}/documentacao`)
    return { success: true, id, status: version.status }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao criar ata' }
  }
}
export async function atualizarAtaAction(
  ataId: string,
  projetoId: string,
  input: AtualizarAtaInput,
) {
  try {
    const s = await verifySession()
    await exigirPermissao(s, projetoId, 'documentos:editar')
    const ata = await prisma.ata.findFirst({
      where: { id: ataId, projetoId, tenantId: s.tenantId, deletedAt: null },
    })
    if (!ata) throw new Error('Ata não encontrada')
    const payload = AtualizarAtaSchema.parse(input)
    const version = await submeterDocumento(
      s,
      projetoId,
      'ATA',
      payload,
      {
        commitTitle: `Alteração da ata ${ata.numero}`,
        versao: new Date().toISOString(),
        elaboradoPor: payload.elaboradoPor,
        aprovadoPor: payload.aprovadoPor ?? '',
        dataAprovacao: '',
      },
      ataId,
    )
    revalidatePath(`/projetos/${projetoId}/documentacao`)
    revalidatePath(`/projetos/${projetoId}/documentacao`)
    return { success: true, status: version.status }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao atualizar ata' }
  }
}
export async function removerAtaAction(ataId: string, projetoId: string) {
  try {
    const s = await verifySession()
    await exigirPermissao(s, projetoId, 'documentos:excluir')
    await excluirAta(s, projetoId, ataId)
    revalidatePath(`/projetos/${projetoId}/documentacao`)
    revalidatePath(`/projetos/${projetoId}/documentacao`)
    return { success: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao remover ata' }
  }
}

/**
 * Upload de um documento anexo da ata (card "Anexar documento: adicionar botão de
 * upload do anexo"). Grava no storage e devolve nome e URL para a linha do anexo;
 * o vínculo com a ata é salvo junto com a versão, como os anexos por link.
 */
export async function enviarAnexoAtaAction(projetoId: string, formData: FormData): Promise<{ anexo: { nome: string; url: string } } | { error: string }> {
  try {
    const s = await verifySession()
    await exigirPermissao(s, projetoId, 'documentos:editar')
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return { error: 'Selecione um arquivo.' }
    const valid = FileUploadSchema.safeParse({ fileName: file.name, fileType: file.type, fileSize: file.size })
    if (!valid.success) return { error: valid.error.issues[0].message }
    const ext = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')}` : ''
    const key = `atas/${s.tenantId}/${projetoId}/${randomUUID()}${ext}`
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: Buffer.from(await file.arrayBuffer()), ContentType: file.type }))
    return { anexo: { nome: file.name, url: publicUrl(key) } }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao enviar o anexo' }
  }
}
