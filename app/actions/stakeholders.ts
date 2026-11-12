'use server'

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { stakeholdersApi, projectsApi } from '@/lib/api-client'
import { s3, BUCKET, publicUrl } from '@/lib/minio'
import prisma from '@/lib/prisma'
import { normalizarContato } from '@/lib/contato'
import { lerImagemAssinatura } from '@/lib/imagemAssinatura'
import { erroMoeda, parseMoeda } from '@/lib/dinheiro'
import { parseHoras } from '@/lib/validation/horas'
import { requireProjectPermission } from '@/services/projectAccess'
import { carregarStakeholdersDoProjeto } from '@/services/stakeholdersDoProjeto'
import {
  adicionarUsuarioComoExterno, PessoaError, salvarDadosDoExterno, salvarEmpresaDoUsuario, tornarExterno, tornarInterno,
  type DadosNoProjeto,
} from '@/services/pessoasDoProjeto'

interface StakeholderInput {
  name: string
  company?: string
  competence?: string
  email?: string
  phone?: string
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  estado?: string
  notes?: string
  logoUrl?: string
}

export async function createStakeholderAction(data: StakeholderInput, projectId?: string) {
  try {
    await verifySession()
    const contato = normalizarContato(data)
    if (contato.error) return { error: contato.error }
    const stakeholder = await stakeholdersApi.create(contato.data as unknown as Record<string, unknown>, projectId)
    if (projectId) {
      await stakeholdersApi.linkProject((stakeholder as { id: string }).id, projectId)
      revalidatePath(`/projetos/${projectId}/stakeholders`)
    }
    return { success: true, stakeholder }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar stakeholder.' }
  }
}

export async function updateStakeholderAction(stakeholderId: string, data: StakeholderInput, projectId: string) {
  try {
    const { tenantId } = await verifySession()
    // Valores já salvos passam sem validar: dados antigos não bloqueiam a edição de outros campos.
    const atual = await prisma.stakeholder.findFirst({ where: { id: stakeholderId, tenantId }, select: { email: true, phone: true } })
    const contato = normalizarContato(data, { atual })
    if (contato.error) return { error: contato.error }
    const stakeholder = await stakeholdersApi.update(stakeholderId, contato.data as unknown as Record<string, unknown>, projectId)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true, stakeholder }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar stakeholder.' }
  }
}

/**
 * Inativa (com motivo) ou reativa um stakeholder externo. A inativação mantém o
 * vínculo com o projeto: ele continua nos documentos, destacado como inativo.
 * A autorização é a da edição do cadastro (projeto:equipe em todos os projetos
 * onde ele aparece), aplicada pelo gateway.
 */
export async function setStakeholderAtivoAction(
  projectId: string,
  stakeholderId: string,
  ativo: boolean,
  motivo?: string,
) {
  try {
    await verifySession()
    const reason = (motivo ?? '').trim()
    if (!ativo && reason.length < 3) return { error: 'Informe o motivo da inativação.' }
    if (reason.length > 500) return { error: 'O motivo pode ter no máximo 500 caracteres.' }
    const stakeholder = await stakeholdersApi.update(
      stakeholderId,
      (ativo ? { isActive: true } : { isActive: false, inactiveReason: reason }) as unknown as Record<string, unknown>,
      projectId,
    )
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true as const, stakeholder }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar a situação do stakeholder.' }
  }
}

export async function bindStakeholderAction(projectId: string, stakeholderId: string) {
  try {
    await verifySession()
    await stakeholdersApi.linkProject(stakeholderId, projectId)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao vincular stakeholder ao projeto.' }
  }
}

export async function unbindStakeholderAction(projectId: string, stakeholderId: string) {
  try {
    await verifySession()
    await stakeholdersApi.unlinkProject(stakeholderId, projectId)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao remover stakeholder do projeto.' }
  }
}

export async function reorderStakeholdersAction(projectId: string, orderedIds: string[]) {
  try {
    await verifySession()
    await stakeholdersApi.reorderByProject(projectId, orderedIds)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao reordenar stakeholders.' }
  }
}

export async function reorderMembersAction(projectId: string, orderedUserIds: string[]) {
  try {
    await verifySession()
    await projectsApi.reorderMembers(projectId, orderedUserIds)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao reordenar membros.' }
  }
}

export async function uploadMemberSignatureAction(formData: FormData, userId: string) {
  try {
    const { role, userId: callerId, tenantId } = await verifySession()
    if (role !== 'admin' && callerId !== userId) {
      return { error: 'Não autorizado' }
    }

    if (!(await prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null }, select: { id: true } }))) return { error: 'Usuário não encontrado' }
    const imagem = await lerImagemAssinatura(formData.get('file') as File | null)
    if ('error' in imagem) return { error: imagem.error }
    const key = `signatures/${userId}/signature-${Date.now()}.${imagem.ext}`

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: imagem.body,
        ContentType: imagem.contentType,
      }),
    )

    const signatureUrl = publicUrl(key)
    await prisma.user.update({ where: { id: userId, tenantId }, data: { signatureUrl } })
    return { signatureUrl }
  } catch (err) {
    console.error('[uploadMemberSignatureAction]', err)
    return { error: err instanceof Error ? err.message : 'Erro ao fazer upload da assinatura' }
  }
}

// ── Uma pessoa, um cadastro: interno ou externo em cada projeto ───────────────

type Sessao = Awaited<ReturnType<typeof verifySession>>

async function comPermissaoDeEquipe<T>(projectId: string, fazer: (s: Sessao) => Promise<T>) {
  const sessao = await verifySession()
  await requireProjectPermission(sessao, projectId, 'projeto:equipe')
  return fazer(sessao)
}

/** Resposta das trocas: o cadastro do projeto já atualizado (listas de interno e externo). */
async function cadastroAtualizado(tenantId: string, projectId: string) {
  revalidatePath(`/projetos/${projectId}/stakeholders`)
  return carregarStakeholdersDoProjeto(tenantId, projectId)
}

function mensagemDeErro(err: unknown, padrao: string) {
  if (err instanceof PessoaError) return err.message
  return err instanceof Error && err.message ? err.message : padrao
}

/** Usa uma conta do sistema como parte interessada externa (sem dar acesso ao projeto). */
export async function adicionarUsuarioComoExternoAction(projectId: string, userId: string) {
  try {
    return await comPermissaoDeEquipe(projectId, async s => {
      await adicionarUsuarioComoExterno(s.tenantId, projectId, userId)
      return { success: true as const, cadastro: await cadastroAtualizado(s.tenantId, projectId) }
    })
  } catch (err) {
    return { error: mensagemDeErro(err, 'Não foi possível adicionar como externo.') }
  }
}

/** Interno → externo neste projeto (sai da equipe e fica nas partes interessadas). */
export async function tornarExternoAction(projectId: string, userId: string) {
  try {
    return await comPermissaoDeEquipe(projectId, async s => {
      await tornarExterno(s.tenantId, projectId, userId)
      return { success: true as const, cadastro: await cadastroAtualizado(s.tenantId, projectId) }
    })
  } catch (err) {
    return { error: mensagemDeErro(err, 'Não foi possível mudar para externo.') }
  }
}

/**
 * Contato → interno neste projeto. Sem conta ligada, devolve `semConta`: o
 * administrador cria o login (mesmo fluxo de "Criar membro") e chama de novo com
 * `novoUserId`. Só o administrador liga uma conta nova a um contato.
 */
export async function tornarInternoAction(projectId: string, stakeholderId: string, novoUserId?: string) {
  try {
    return await comPermissaoDeEquipe(projectId, async s => {
      if (novoUserId && s.role !== 'admin') return { error: 'Só o administrador cria o login de uma pessoa.' }
      await tornarInterno(s.tenantId, projectId, stakeholderId, novoUserId)
      return { success: true as const, cadastro: await cadastroAtualizado(s.tenantId, projectId) }
    })
  } catch (err) {
    if (err instanceof PessoaError && err.message === 'SEM_CONTA') return { semConta: true as const, error: 'Esta pessoa ainda não tem login no sistema.' }
    return { error: mensagemDeErro(err, 'Não foi possível mudar para interno.') }
  }
}

/** Remuneração mensal, horas por dia, funções e departamentos do externo neste projeto. */
export async function salvarDadosDoExternoAction(projectId: string, stakeholderId: string, dados: {
  remuneracao?: string | number | null; horasDiarias?: string | number | null; funcoes?: string[]; departamentos?: string[]
}) {
  try {
    return await comPermissaoDeEquipe(projectId, async s => {
      const valores: DadosNoProjeto = { funcoes: dados.funcoes, departamentos: dados.departamentos }
      // Mesmas regras do membro da equipe: valor em reais válido e horas entre 0 e 24.
      if (dados.remuneracao !== undefined) {
        if (dados.remuneracao === null || dados.remuneracao === '') valores.remuneracao = null
        else {
          const erro = erroMoeda(dados.remuneracao, { rotulo: 'Remuneração' })
          if (erro) return { error: erro }
          valores.remuneracao = parseMoeda(dados.remuneracao)
        }
      }
      if (dados.horasDiarias !== undefined) {
        if (dados.horasDiarias === null || dados.horasDiarias === '') valores.horasDiarias = null
        else {
          const { valor, erro } = parseHoras(dados.horasDiarias)
          if (erro) return { error: erro }
          valores.horasDiarias = valor
        }
      }
      await salvarDadosDoExterno(s.tenantId, projectId, stakeholderId, valores)
      revalidatePath(`/projetos/${projectId}/stakeholders`)
      return { success: true as const }
    })
  } catch (err) {
    return { error: mensagemDeErro(err, 'Não foi possível salvar os dados do projeto.') }
  }
}

/** Empresa e competência de quem é interno (no contato da mesma pessoa). */
export async function salvarEmpresaDoMembroAction(projectId: string, userId: string, empresa: { company?: string | null; competence?: string | null }) {
  try {
    return await comPermissaoDeEquipe(projectId, async s => {
      const membro = await prisma.userProject.findFirst({ where: { projectId, userId, user: { tenantId: s.tenantId, deletedAt: null } }, select: { id: true } })
      if (!membro) return { error: 'Membro não encontrado neste projeto.' }
      await salvarEmpresaDoUsuario(s.tenantId, userId, empresa)
      revalidatePath(`/projetos/${projectId}/stakeholders`)
      return { success: true as const }
    })
  } catch (err) {
    return { error: mensagemDeErro(err, 'Não foi possível salvar empresa e competência.') }
  }
}
