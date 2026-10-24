'use server'

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { authApi } from '@/lib/api-client'
import { s3, BUCKET, publicUrl } from '@/lib/minio'
import { MeuPerfilSchema } from '@/lib/validation/userSchemas'

export async function getUserProfileAction() {
  try {
    await verifySession()
    const profile = await authApi.me()
    return { profile }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao buscar perfil' }
  }
}

export type ProfileActionState = { message?: string; error?: string }

export async function updateProfileAction(prevState: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  try {
    await verifySession()
    const campo = (nome: string) => (formData.get(nome) as string | null) ?? undefined
    const parsed = MeuPerfilSchema.safeParse({
      name: campo('name') ?? '',
      email: campo('email') ?? '',
      phone: campo('phone'),
      cep: campo('cep'),
      logradouro: campo('logradouro'),
      numero: campo('numero'),
      complemento: campo('complemento'),
      bairro: campo('bairro'),
      cidade: campo('cidade'),
      estado: campo('estado'),
      notes: campo('notes'),
    })
    if (!parsed.success) return { error: parsed.error.issues[0].message }
    // Cargo, departamento e valor/hora não são enviados: o perfil não os edita mais.
    await authApi.updateProfile(parsed.data)
    const avatarUrl = formData.get('avatarUrl') as string | null
    if (avatarUrl) {
      await authApi.updateProfile({ avatarUrl })
    }
    revalidatePath('/configuracoes/perfil')
    return { message: 'Perfil atualizado com sucesso' }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar perfil' }
  }
}

export async function changePasswordAction(prevState: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  try {
    await verifySession()
    await authApi.changePassword({
      currentPassword: formData.get('senhaAtual') as string,
      newPassword: formData.get('novaSenha') as string,
    })
    return { message: 'Senha alterada com sucesso' }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar senha' }
  }
}

export async function uploadSignatureAction(formData: FormData) {
  try {
    const { userId } = await verifySession()
    const file = formData.get('file') as File
    if (!file || file.size === 0) throw new Error('Arquivo inválido')

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const key = `signatures/${userId}/signature-${Date.now()}.${ext}`

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      }),
    )

    const signatureUrl = publicUrl(key)
    await authApi.updateProfile({ signatureUrl })
    revalidatePath('/configuracoes/perfil')
    return { signatureUrl }
  } catch (err) {
    console.error('[uploadSignatureAction]', err)
    const msg = err instanceof Error ? err.message : undefined
    return { error: msg || 'Erro ao fazer upload da assinatura' }
  }
}

const ALLOWED_AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_AVATAR_BYTES = 5 * 1024 * 1024 // 5MB

export async function uploadAvatarAction(formData: FormData) {
  try {
    const { userId } = await verifySession()
    const file = formData.get('file') as File
    if (!file || file.size === 0) throw new Error('Arquivo inválido')
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
      throw new Error('Formato de imagem não suportado. Use JPEG, PNG, WEBP ou GIF.')
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new Error('Arquivo muito grande. O limite é 5MB.')
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const key = `avatars/${userId}/avatar-${Date.now()}.${ext}`

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      }),
    )

    return { avatarUrl: publicUrl(key) }
  } catch (err) {
    console.error('[uploadAvatarAction]', err)
    const code = (err as Record<string, unknown>)?.Code ?? (err as Record<string, unknown>)?.name
    const msg = err instanceof Error ? err.message : undefined
    return { error: msg || (code ? `Erro S3: ${code}` : 'Erro ao fazer upload') }
  }
}
