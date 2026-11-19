import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { SemPermissaoError } from '@/services/authz'
import { ArquivoProjetoError } from '@/services/arquivosProjetoService'

/** Resposta de erro das rotas de arquivos do projeto (sem detalhes internos). */
export function erroArquivos(e: unknown) {
  if (e instanceof SemPermissaoError) return NextResponse.json({ error: e.message }, { status: 403 })
  if (e instanceof ArquivoProjetoError) return NextResponse.json({ error: e.message }, { status: e.status })
  if (e instanceof ZodError) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
  console.error('[arquivos do projeto]', e instanceof Error ? e.message : e)
  return NextResponse.json({ error: 'Não foi possível concluir. Tente novamente.' }, { status: 500 })
}
