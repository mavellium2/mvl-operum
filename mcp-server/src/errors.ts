import type { GatewayError } from './gateway.js'

export interface ToolErrorResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  isError: true
}

/** Erro de uso da tool (input inválido, confirmação ausente, tenant sem token) — a mensagem vai direto ao modelo. */
export class UserError extends Error {
  readonly status = 400
  get publicMessage(): string {
    return this.message
  }
}

/**
 * Mapeia erros do gateway para uma mensagem acionável pelo modelo (SDD 6.5).
 * Só repassa `publicMessage` (mensagem de negócio vinda de corpo JSON do
 * serviço, ver gateway.ts) — nunca texto bruto, stack trace ou URL interna.
 * O detalhe completo fica apenas no log do servidor.
 */
export function toToolError(err: unknown, entity?: string, tool?: string): ToolErrorResult {
  const status = (err as GatewayError | undefined)?.status
  const safe = (err as GatewayError | undefined)?.publicMessage
  const ao = tool ? ` ao executar ${tool}` : ''
  let message: string

  switch (status) {
    case 401:
      message = 'Token inválido ou revogado. O usuário precisa gerar um novo em /configuracoes/integracoes.'
      break
    case 403:
      message = safe ? `Sem permissão: ${safe}` : 'Sem permissão para esta operação (o token pode ter só escopo read).'
      break
    case 404:
      message = `Não encontrado neste tenant: ${entity ?? 'recurso'}.`
      break
    case 400:
    case 409:
    case 422:
      message = safe ?? 'Dados inválidos.'
      break
    case 413:
      message = safe && !/too large/i.test(safe) ? safe : 'Arquivo acima do limite de 50 MB do Operum.'
      break
    case 429:
      message = 'Limite de requisições do Operum atingido, aguarde alguns segundos e tente novamente.'
      break
    default:
      console.error('[mcp-server] erro não mapeado', { tool, status, message: err instanceof Error ? err.message : String(err) })
      if (status !== undefined && status >= 500) {
        // O status e a mensagem de negócio (se houver) ajudam a diagnosticar
        // sem expor o corpo bruto; o detalhe completo fica só no log acima.
        message = `Erro ${status} no Operum${ao}.${safe ? ` Detalhe: ${safe}.` : ''} Tente de novo; se persistir, avise o administrador do Operum.`
      } else if (isTimeout(err)) {
        message = `O Operum não respondeu a tempo${ao} (timeout). Tente de novo em instantes.`
      } else {
        message = `Não foi possível conectar ao Operum${ao} (falha de rede). Operum indisponível no momento, tente novamente.`
      }
  }

  return { content: [{ type: 'text', text: message }], isError: true }
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name
  return name === 'TimeoutError' || name === 'AbortError'
}
