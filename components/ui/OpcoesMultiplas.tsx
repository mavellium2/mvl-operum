'use client'

import { Check } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import './OpcoesMultiplas.css'

export interface OpcaoMultipla<T extends string | number> { value: T; label: string }

/**
 * Grupo de opções que podem ser marcadas juntas (botões de alternância com
 * aria-pressed). Nenhuma marcada deixa o texto `vazio` à mostra, para dizer o
 * que isso significa (ex.: "Todos").
 */
export default function OpcoesMultiplas<T extends string | number>({ legenda, opcoes, valores, onChange, vazio, semOpcoes = 'Nenhuma opção disponível.' }: {
  legenda: string
  opcoes: readonly OpcaoMultipla<T>[]
  valores: readonly T[]
  onChange: (valores: T[]) => void
  /** Texto ao lado da legenda quando nada está marcado. */
  vazio?: string
  semOpcoes?: string
}) {
  const alternar = (valor: T) => onChange(valores.includes(valor) ? valores.filter(v => v !== valor) : [...valores, valor])
  return <fieldset className="opcoes-multiplas">
    <legend className="opcoes-multiplas-legenda">{legenda}{vazio && !valores.length && <span>{vazio}</span>}</legend>
    {opcoes.length ? <div className="opcoes-multiplas-lista">
      {opcoes.map(opcao => {
        const marcada = valores.includes(opcao.value)
        return <GlassButton key={String(opcao.value)} variant="custom" className="opcoes-multiplas-opcao" aria-pressed={marcada} onClick={() => alternar(opcao.value)}>
          {marcada && <Check size={13} aria-hidden="true" />}{opcao.label}
        </GlassButton>
      })}
    </div> : <p className="opcoes-multiplas-vazio">{semOpcoes}</p>}
  </fieldset>
}
