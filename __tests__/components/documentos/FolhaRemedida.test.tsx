import { describe, it, expect, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { Folha } from '@/components/documentos/editor/folha'

const original = Object.getOwnPropertyDescriptor(document, 'fonts')

afterEach(() => {
  if (original) Object.defineProperty(document, 'fonts', original)
  else delete (document as { fonts?: unknown }).fonts
})

describe('Folha — nova medida quando as fontes carregam', () => {
  it('com as fontes já carregadas, não fica medindo sem parar (travava o navegador)', async () => {
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve(), addEventListener: () => {}, removeEventListener: () => {} },
    })
    let renders = 0
    function Conta() { renders++; return <p>texto</p> }

    render(<Folha><Conta /></Folha>)
    // Deixa as promessas e efeitos pendentes rodarem várias vezes.
    for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve() })

    const depois = renders
    for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve() })
    expect(renders).toBe(depois)
    expect(renders).toBeLessThan(10)
  })
})
