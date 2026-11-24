'use client'

import { useId, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import GlassPopover from '@/components/ui/GlassPopover'
import FormActions, { FormBody } from '@/components/ui/FormActions'
import OpcoesMultiplas from '@/components/ui/OpcoesMultiplas'
import DateInput from '@/components/ui/DateInput'
import {
  contarFiltros, FAIXAS_TAMANHO, FILTROS_ARQUIVOS_VAZIOS, PERIODOS_ARQUIVO,
  type FaixaTamanho, type FiltrosArquivos, type PeriodoArquivo,
} from '@/lib/filtrosArquivos'

/**
 * Botão "Filtros" da lista de arquivos: abre um painel com vários filtros combináveis (tipo, data, quem enviou,
 * tamanho e estrela). O filtro vale na hora, sem botão "Aplicar"; opções de um mesmo filtro somam e filtros diferentes se combinam.
 */
export default function FiltroArquivos({ filtros, onChange, tipos, enviadores, comTamanho, comEstrela }: {
  filtros: FiltrosArquivos
  onChange: (filtros: FiltrosArquivos) => void
  /** Opções do filtro "Tipo", na ordem. */
  tipos: { value: string; label: string }[]
  /** Quem enviou arquivos (nomes distintos, já ordenados). Vazio esconde o filtro. */
  enviadores: string[]
  /** Há tamanho em bytes nos itens (sem ele, o filtro de tamanho não aparece). */
  comTamanho: boolean
  /** A lista tem estrela pessoal (sem ela, o filtro de estrela não aparece). */
  comEstrela: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const ancora = useRef<HTMLButtonElement>(null)
  const id = useId()
  const ativos = contarFiltros(filtros)
  const mudar = (parcial: Partial<FiltrosArquivos>) => onChange({ ...filtros, ...parcial })
  // Período é de escolha única: marcar outro troca; marcar o mesmo desmarca.
  const periodo = (valores: PeriodoArquivo[]) => mudar({ periodo: valores.find(v => v !== filtros.periodo) ?? '' })
  return <>
    <GlassButton ref={ancora} variant="default" aria-haspopup="dialog" aria-expanded={aberto} aria-controls={aberto ? id : undefined}
      aria-label={ativos ? `Filtros (${ativos} ativo${ativos > 1 ? 's' : ''})` : 'Filtros'}
      onClick={() => setAberto(v => !v)} className="arq-filtro-botao inline-flex h-10 items-center gap-2 px-3.5 text-sm">
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline">Filtros</span>
      {ativos > 0 && <span className="arq-filtro-contagem" aria-hidden="true">{ativos}</span>}
    </GlassButton>
    <GlassPopover id={id} open={aberto} anchor={ancora} onClose={() => setAberto(false)} label="Filtrar arquivos" layout="form">
      <div className="form-layout min-h-0 flex-1">
        <FormBody>
          <h2 className="mb-1 text-sm font-semibold">Filtrar arquivos</h2>
          <p className="mb-4 text-xs opacity-70">Marque quantas opções quiser. Sem nada marcado, vale para todos.</p>
          <OpcoesMultiplas legenda="Tipo" vazio="Todos" valores={filtros.tipos} onChange={tipos => mudar({ tipos })} opcoes={tipos} />
          <OpcoesMultiplas<PeriodoArquivo> legenda="Enviado em" vazio="Qualquer data" valores={filtros.periodo ? [filtros.periodo] : []} onChange={periodo}
            opcoes={[...PERIODOS_ARQUIVO.map(p => ({ value: p.valor as PeriodoArquivo, label: p.rotulo })), { value: 'personalizado', label: 'Escolher datas' }]} />
          {filtros.periodo === 'personalizado' && (
            <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5">De<DateInput ariaLabel="Enviado a partir de" value={filtros.de} onChange={de => mudar({ de })} className="w-32" /></label>
              <label className="flex items-center gap-1.5">até<DateInput ariaLabel="Enviado até" value={filtros.ate} onChange={ate => mudar({ ate })} className="w-32" /></label>
            </div>
          )}
          {enviadores.length > 0 && (
            <OpcoesMultiplas legenda="Enviado por" vazio="Todos" valores={filtros.enviadores} onChange={enviadores => mudar({ enviadores })} opcoes={enviadores.map(n => ({ value: n, label: n }))} />
          )}
          {comTamanho && (
            <OpcoesMultiplas<FaixaTamanho> legenda="Tamanho" vazio="Qualquer" valores={filtros.tamanhos} onChange={tamanhos => mudar({ tamanhos })} opcoes={FAIXAS_TAMANHO.map(f => ({ value: f.valor, label: f.rotulo }))} />
          )}
          {comEstrela && (
            <OpcoesMultiplas<'estrela'> legenda="Estrela" valores={filtros.somenteEstrela ? ['estrela'] : []} onChange={v => mudar({ somenteEstrela: v.length > 0 })} opcoes={[{ value: 'estrela', label: 'Só com estrela' }]} />
          )}
        </FormBody>
        <FormActions surface="none" className="flex justify-end gap-2 pt-3">
          <GlassButton disabled={ativos === 0} onClick={() => onChange(FILTROS_ARQUIVOS_VAZIOS)}>Limpar</GlassButton>
          <GlassButton variant="primary" onClick={() => setAberto(false)}>Concluir</GlassButton>
        </FormActions>
      </div>
    </GlassPopover>
  </>
}
