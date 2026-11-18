'use client'

import { useState, type ReactNode } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { ROTULO_STATUS } from './useVersoesDocumento'
import { proximaVersaoDocumento } from '@/lib/versaoDocumento'

/** O mínimo de uma versão para o seletor (serve às listas de /revisions e do Termo). */
export interface VersaoParaVoltar { id: string; versao?: string | null; commitTitle: string; status: string; payload?: unknown }

/**
 * "Voltar para uma versão" nos documentos, como em Editar projeto: escolher uma
 * versão no seletor da barra leva o conteúdo dela para o rascunho, editável.
 * Ao salvar, vira a próxima versão (v1.0.1, v1.0.2 …) e segue o fluxo normal de
 * aprovação. Nenhuma versão é apagada.
 */
export function useVoltarVersao<V extends VersaoParaVoltar>({ versoes, vigente, aplicar, alteracoesPendentes = false, podeEditar = true }: {
  versoes: V[]
  vigente: V | null
  /** Coloca o conteúdo da versão escolhida no editor (normalizado pelo documento). */
  aplicar: (payload: unknown, versao: V) => void
  /** O rascunho atual tem alterações ainda não salvas como versão. */
  alteracoesPendentes?: boolean
  podeEditar?: boolean
}): {
  /** Prop `versao` do EditorDocumento. */
  seletor: { rotulo: string; rotuloAtual: string; selecionada: string | null; opcoes: { id: string; rotulo: string; detalhe?: string }[]; onSelecionar: (id: string | null) => void }
  /** Rótulo que o rascunho recebe ao ser salvo (campo "Versão" das folhas). */
  proxima: string
  /** Versão de onde o rascunho partiu ao voltar, se houver. */
  origem: V | null
  /** Confirmação; renderizar junto do editor. */
  dialogo: ReactNode
} {
  const [origem, setOrigem] = useState<V | null>(null)
  const [pedido, setPedido] = useState<V | null>(null)
  const proxima = proximaVersaoDocumento(versoes.map(v => v.versao))
  const base = origem ? `a partir da ${origem.versao ?? '—'}` : vigente ? `sobre a ${vigente.versao ?? '—'}` : ''
  const seletor = {
    rotulo: base ? `Rascunho ${base}` : 'Rascunho',
    rotuloAtual: `Rascunho${base ? ` ${base}` : ''} (editável)`,
    selecionada: null,
    opcoes: versoes.filter(v => v.payload).map(v => ({
      id: v.id,
      rotulo: `${podeEditar ? 'Voltar para a ' : ''}${v.versao ?? '—'} · ${v.id === vigente?.id ? 'vigente' : ROTULO_STATUS[v.status] ?? ''}`,
      detalhe: v.commitTitle || undefined,
    })),
    onSelecionar: (id: string | null) => {
      if (!id || !podeEditar) return
      const v = versoes.find(x => x.id === id)
      if (v?.payload) setPedido(v)
    },
  }
  const dialogo = (
    <ConfirmDialog
      isOpen={!!pedido}
      onClose={() => setPedido(null)}
      onConfirm={() => {
        if (!pedido) return
        aplicar(pedido.payload, pedido)
        setOrigem(pedido)
        setPedido(null)
      }}
      title={pedido ? `Voltar para a ${pedido.versao ?? 'versão escolhida'}?` : 'Voltar para a versão'}
      message={`O conteúdo desta versão passa a ser o seu rascunho, e você pode editá-lo normalmente. Ao salvar, ele vira a ${proxima} e segue para aprovação como qualquer versão. Nenhuma versão é apagada.${alteracoesPendentes ? ' As alterações do rascunho atual que ainda não foram salvas como versão serão substituídas.' : ''}`}
      confirmLabel="Voltar para esta versão"
    />
  )
  return { seletor, proxima, origem, dialogo }
}
