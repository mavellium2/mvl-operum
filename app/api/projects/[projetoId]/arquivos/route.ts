import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifySession } from '@/lib/dal'
import { listarArquivos, registrarArquivo } from '@/services/arquivosProjetoService'
import { erroArquivos } from './erros'

const categoria = z.enum(['FOTOS_VIDEOS', 'APRESENTACAO'])
type Ctx = { params: Promise<{ projetoId: string }> }

/** Arquivos de uma seção do projeto (Fotos e Vídeos / Apresentação e Vídeo). */
export async function GET(req: Request, { params }: Ctx) {
  const { projetoId } = await params
  const { tenantId, role, userId } = await verifySession()
  try {
    const cat = categoria.parse(new URL(req.url).searchParams.get('categoria'))
    const arquivos = await listarArquivos({ tenantId, role, userId }, projetoId, cat)
    return NextResponse.json(arquivos.map(a => ({ id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, enviadoEm: a.createdAt.toISOString(), enviadoPor: a.enviadoPor?.name ?? null })))
  } catch (e) { return erroArquivos(e) }
}

/** Registra o arquivo depois do envio direto ao storage (ver `envio`). */
export async function POST(req: Request, { params }: Ctx) {
  const { projetoId } = await params
  const { tenantId, role, userId } = await verifySession()
  try {
    const d = z.object({ categoria, chave: z.string().min(1).max(500), nome: z.string().min(1).max(255) }).strict().parse(await req.json())
    const a = await registrarArquivo({ tenantId, role, userId }, projetoId, d.categoria, d.chave, d.nome)
    return NextResponse.json({ id: a.id }, { status: 201 })
  } catch (e) { return erroArquivos(e) }
}
