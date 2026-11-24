import type { CreateNotificacaoInput } from '@/lib/validation/notificacaoSchemas'

/** Prazo para colocar o aviso na fila: com o Redis fora do ar a conexão fica tentando para sempre. */
export const PRAZO_FILA_NOTIFICACOES_MS = 4000

// When NOTIFICATION_SERVICE_URL is set, publishes to BullMQ queue (async).
// Otherwise falls back to direct DB write via notificacaoService.
//
// Aviso é "melhor esforço": quem chama não pode ficar preso esperando a fila. Sem Redis, `queue.add` não falha,
// só espera a conexão (e ações do servidor como inativar um membro ficariam penduradas). Por isso há um prazo.
export async function publishNotification(input: CreateNotificacaoInput): Promise<void> {
  const serviceUrl = process.env.NOTIFICATION_SERVICE_URL

  if (serviceUrl) {
    const { Queue } = await import('bullmq')
    const queue = new Queue('notifications', {
      connection: {
        host: process.env.REDIS_QUEUE_HOST ?? 'redis',
        port: Number(process.env.REDIS_QUEUE_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD,
      },
    })
    // Sem ouvinte, o erro de conexão vira "unhandled error event".
    queue.on('error', () => { /* Redis indisponível: o prazo abaixo encerra a espera */ })
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        queue.add('create', input),
        new Promise<never>((_, rejeita) => {
          timer = setTimeout(() => rejeita(new Error('Fila de notificações indisponível (tempo esgotado)')), PRAZO_FILA_NOTIFICACOES_MS)
        }),
      ])
    } finally {
      clearTimeout(timer)
      // Fechar também espera a conexão: não segura quem chamou.
      void queue.close().catch(() => { /* já desconectado */ })
    }
    return
  }

  const { create } = await import('@/services/notificacaoService')
  await create(input)
}
