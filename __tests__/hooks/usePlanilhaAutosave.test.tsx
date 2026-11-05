import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlanilhaAutosave } from '@/hooks/usePlanilhaAutosave'
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })
describe('salvamento automático da planilha', () => {
  it('agrupa alterações próximas e salva a edição mais recente', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(true)
    const { rerender } = renderHook(({ key }) => usePlanilhaAutosave({ changeKey: key, enabled: true, save: () => save(key), isSaving: () => false }), { initialProps: { key: 'a' } })
    await act(() => vi.advanceTimersByTimeAsync(800))
    rerender({ key: 'b' })
    await act(() => vi.advanceTimersByTimeAsync(1199))
    expect(save).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(save).toHaveBeenCalledExactlyOnceWith('b')
  })
  it('preserva alterações durante outro envio e espera a edição do título terminar', async () => {
    vi.useFakeTimers()
    let busy = true
    const input = document.createElement('input')
    input.className = 'planilha-name-input'
    document.body.append(input)
    input.focus()
    const save = vi.fn().mockResolvedValue(true)
    renderHook(() => usePlanilhaAutosave({ changeKey: 'novo título', enabled: true, save, isSaving: () => busy }))
    await act(() => vi.advanceTimersByTimeAsync(1200))
    busy = false
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(save).not.toHaveBeenCalled()
    input.blur()
    await act(() => vi.advanceTimersByTimeAsync(1200))
    expect(save).toHaveBeenCalledOnce()
  })
  it('não tenta salvar novamente com erro pendente ou edição incompleta', async () => {
    vi.useFakeTimers()
    const save = vi.fn().mockResolvedValue(true)
    renderHook(() => usePlanilhaAutosave({ changeKey: 'valor inválido', enabled: false, save, isSaving: () => false }))
    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(save).not.toHaveBeenCalled()
  })
})
