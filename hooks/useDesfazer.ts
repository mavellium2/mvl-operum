'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Desfazer/refazer de um estado de edição (Ctrl+Z / Ctrl+Shift+Z no editor de
 * documentos). Digitação seguida (dentro de `agruparMs`) vira um passo só.
 * `aplicar` recebe o estado anterior/seguinte; a mudança vinda dele não entra
 * de novo na pilha.
 */
export function useDesfazer<T>(estado: T, aplicar: (valor: T) => void, { agruparMs = 700, ativo = true, chave }: {
  agruparMs?: number
  ativo?: boolean
  /** Quando muda (ex.: documento carregado), o histórico recomeça do estado atual. */
  chave?: unknown
} = {}) {
  const passado = useRef<T[]>([])
  const futuro = useRef<T[]>([])
  const atual = useRef(estado)
  const ultimoRegistro = useRef(0)
  const aplicando = useRef(false)
  const chaveAtual = useRef(chave)
  const [pilhas, setPilhas] = useState({ passado: 0, futuro: 0 })
  const atualizar = () => setPilhas({ passado: passado.current.length, futuro: futuro.current.length })

  useEffect(() => {
    if (!Object.is(chave, chaveAtual.current)) {
      chaveAtual.current = chave
      passado.current = []; futuro.current = []; atual.current = estado; ultimoRegistro.current = 0
      atualizar()
      return
    }
    if (aplicando.current) { aplicando.current = false; atual.current = estado; return }
    if (Object.is(estado, atual.current)) return
    if (!ativo) { atual.current = estado; return }
    const agora = Date.now()
    if (agora - ultimoRegistro.current > agruparMs || passado.current.length === 0) {
      passado.current.push(atual.current)
      if (passado.current.length > 100) passado.current.shift()
    }
    ultimoRegistro.current = agora
    futuro.current = []
    atual.current = estado
    atualizar()
  }, [estado, ativo, agruparMs, chave])

  /** Recomeça o histórico (ex.: depois de carregar o documento). */
  const reiniciar = useCallback((valor: T) => {
    passado.current = []; futuro.current = []; atual.current = valor; ultimoRegistro.current = 0
    atualizar()
  }, [])

  const desfazer = useCallback(() => {
    const anterior = passado.current.pop()
    if (anterior === undefined) return
    futuro.current.push(atual.current)
    aplicando.current = true
    atual.current = anterior
    ultimoRegistro.current = 0
    aplicar(anterior)
    atualizar()
  }, [aplicar])

  const refazer = useCallback(() => {
    const seguinte = futuro.current.pop()
    if (seguinte === undefined) return
    passado.current.push(atual.current)
    aplicando.current = true
    atual.current = seguinte
    ultimoRegistro.current = 0
    aplicar(seguinte)
    atualizar()
  }, [aplicar])

  return { desfazer, refazer, podeDesfazer: pilhas.passado > 0, podeRefazer: pilhas.futuro > 0, reiniciar }
}
