// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fila = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn(), on: vi.fn() }))
vi.mock('bullmq', () => ({ Queue: vi.fn(function () { return fila }) }))
vi.mock('@/services/notificacaoService', () => ({ create: vi.fn() }))
import { PRAZO_FILA_NOTIFICACOES_MS, publishNotification } from '@/lib/notificationPublisher'

const aviso = { userId: 'u1', type: 'UPDATE', title: 't', message: 'm' } as never

describe('publishNotification com fila (NOTIFICATION_SERVICE_URL)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubEnv('NOTIFICATION_SERVICE_URL', 'http://notificacoes')
    fila.add.mockReset(); fila.close.mockReset().mockResolvedValue(undefined); fila.on.mockReset()
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  it('publica na fila e fecha a conexão', async () => {
    fila.add.mockResolvedValue(undefined)
    await publishNotification(aviso)
    expect(fila.add).toHaveBeenCalledWith('create', aviso)
    expect(fila.close).toHaveBeenCalled()
  })

  it('com o Redis fora do ar (add nunca responde), desiste no prazo em vez de ficar pendurado', async () => {
    fila.add.mockReturnValue(new Promise(() => {}))
    // Fechar a conexão também nunca termina: não pode segurar o chamador.
    fila.close.mockReturnValue(new Promise(() => {}))
    const resultado = publishNotification(aviso)
    const desfecho = expect(resultado).rejects.toThrow(/tempo esgotado/)
    await vi.advanceTimersByTimeAsync(PRAZO_FILA_NOTIFICACOES_MS + 10)
    await desfecho
  })

  it('registra um ouvinte de erro (sem ele, a falha de conexão derruba o processo)', async () => {
    fila.add.mockResolvedValue(undefined)
    await publishNotification(aviso)
    expect(fila.on).toHaveBeenCalledWith('error', expect.any(Function))
  })
})
