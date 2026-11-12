'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import OperumButton from '@/components/ui/GlassButton'
import { CopiaParaImpressao } from '@/components/documentos/editor/folha'
import { useToast } from '@/components/ui/Toast'
import { fetchWithSession } from '@/lib/clientFetch'
import type { AtaExportData } from '@/lib/exports/ataDocx'
import AtaDocument from './AtaDocument'

/** Datas chegam como texto no JSON; a folha usa Date. */
function comDatas(d: AtaExportData): AtaExportData {
  const data = (v: unknown) => (v ? new Date(v as string) : null)
  return { ...d, data: data(d.data), acoes: d.acoes.map(a => ({ ...a, prazo: data(a.prazo) })) }
}

/**
 * Word da Ata direto da lista, idêntico à tela: busca os dados, desenha a mesma
 * folha fora da tela (como na impressão) e gera o .docx a partir dela.
 */
export default function BaixarWordAta({ ataId, numero, className }: { ataId: string; numero: number; className?: string }) {
  const { toast } = useToast()
  const [dados, setDados] = useState<AtaExportData | null>(null)
  const [gerando, setGerando] = useState(false)
  const folha = useRef<HTMLDivElement>(null)
  const rotulo = `Baixar Word da ata ${String(numero).padStart(2, '0')}`

  async function iniciar() {
    if (gerando) return
    setGerando(true)
    try {
      const r = await fetchWithSession(`/api/atas/${ataId}/export?formato=dados`)
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? 'Erro ao carregar a ata')
      setDados(comDatas(await r.json()))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar o Word.', 'error')
      setGerando(false)
    }
  }

  // Com a folha desenhada, gera o Word e desmonta a cópia.
  useEffect(() => {
    if (!dados || !folha.current) return
    let ativo = true
    void (async () => {
      try {
        const { downloadFolhaDocx, arquivoDaAta } = await import('@/lib/exports/projectDocumentsDocx')
        if (ativo && folha.current) await downloadFolhaDocx(folha.current, `Ata de Reunião Nº ${String(dados.numero || 0).padStart(2, '0')}`, arquivoDaAta(dados.numero, dados.nomeProjeto))
      } catch (e) {
        toast(e instanceof Error && e.message.startsWith('Imagem indisponível')
          ? 'Não foi possível gerar o Word: a logo ou uma assinatura não carregou. Tente novamente.'
          : 'Não foi possível gerar o Word. Tente novamente.', 'error')
      } finally {
        if (ativo) { setDados(null); setGerando(false) }
      }
    })()
    return () => { ativo = false }
  }, [dados, toast])

  return (
    <>
      <OperumButton variant="custom" type="button" aria-label={rotulo} aria-busy={gerando} disabled={gerando} onClick={() => void iniciar()} className={className}>
        {gerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
      </OperumButton>
      {dados && <CopiaParaImpressao><AtaDocument ref={folha} data={dados} /></CopiaParaImpressao>}
    </>
  )
}
