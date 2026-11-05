'use client'

import { memo, type ReactNode } from 'react'
import Dica from '@/components/ui/Tooltip'

// Acima deste tamanho o nome costuma ser cortado; a dica mostra o nome completo.
const LIMITE_DICA = 28

export interface LinhaResumo { key: string; nome: string; valores: [ReactNode, ReactNode] }

/**
 * Quadro-resumo da planilha: nome em uma linha (completo na dica ao passar o mouse), cabeçalho e
 * total fixos e rolagem interna, para não alongar a página quando há muitas fases.
 */
export default memo(function QuadroResumo({ titulo, colunas, linhas, total }: {
  titulo: string
  colunas: [string, string, string]
  linhas: LinhaResumo[]
  total: [ReactNode, ReactNode]
}) {
  return (
    <div className="planilha-resumo rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-gray-800">{titulo}</h3>
      <div className="planilha-resumo-rolagem" role="region" aria-label={titulo} tabIndex={0}>
        <table className="planilha-resumo-tabela w-full text-sm">
          <colgroup><col /><col className="planilha-resumo-numero" /><col className="planilha-resumo-numero" /></colgroup>
          <thead>
            <tr className="bg-blue-600 text-white">
              <th className="px-3 py-2 text-left text-xs font-semibold">{colunas[0]}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold">{colunas[1]}</th>
              <th className="px-3 py-2 text-right text-xs font-semibold">{colunas[2]}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {linhas.map(linha => (
              <tr key={linha.key}>
                <td className="planilha-resumo-nome px-3 py-1.5 text-gray-800">{linha.nome.length > LIMITE_DICA ? <Dica label={linha.nome} multiline>{linha.nome}</Dica> : linha.nome}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{linha.valores[0]}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{linha.valores[1]}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{total[0]}</td>
              <td className="px-3 py-2 text-right tabular-nums">{total[1]}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
})
