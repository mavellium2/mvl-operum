'use client'

import { useId, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import GlassPopover from '@/components/ui/GlassPopover'
import FormActions, { FormBody } from '@/components/ui/FormActions'
import OpcoesMultiplas from '@/components/ui/OpcoesMultiplas'

export type VinculoPessoa = 'interno' | 'externo'
export type SituacaoPessoa = 'ativo' | 'inativo'
export interface FiltrosPessoas { vinculos: VinculoPessoa[]; situacoes: SituacaoPessoa[]; areas: string[] }
export const FILTROS_PESSOAS_VAZIOS: FiltrosPessoas = { vinculos: [], situacoes: [], areas: [] }
export const contarFiltrosPessoas = (f: FiltrosPessoas) => [f.vinculos, f.situacoes, f.areas].filter(l => l.length > 0).length

/**
 * Botão "Filtros" da tela Stakeholders (mesmo padrão dos filtros de arquivos e de projetos): painel com Vínculo,
 * Situação e Área ou empresa, aplicado na hora. Opções do mesmo filtro somam; filtros diferentes se combinam.
 */
export default function FiltroPessoas({ filtros, onChange, areas, compacto = false }: { filtros: FiltrosPessoas; onChange: (f: FiltrosPessoas) => void; areas: string[]; /** Só o ícone (a lista está estreita). */ compacto?: boolean }) {
  const [aberto, setAberto] = useState(false)
  const ancora = useRef<HTMLButtonElement>(null)
  const id = useId()
  const ativos = contarFiltrosPessoas(filtros)
  const mudar = (parcial: Partial<FiltrosPessoas>) => onChange({ ...filtros, ...parcial })
  return <>
    <GlassButton ref={ancora} variant="default" aria-haspopup="dialog" aria-expanded={aberto} aria-controls={aberto ? id : undefined}
      aria-label={ativos ? `Filtros (${ativos} ativo${ativos > 1 ? 's' : ''})` : 'Filtros'}
      onClick={() => setAberto(v => !v)} className="arq-filtro-botao inline-flex h-10 items-center gap-2 px-3.5 text-sm">
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      <span className={compacto ? 'sr-only' : 'hidden sm:inline'}>Filtros</span>
      {ativos > 0 && <span className="arq-filtro-contagem" aria-hidden="true">{ativos}</span>}
    </GlassButton>
    <GlassPopover id={id} open={aberto} anchor={ancora} onClose={() => setAberto(false)} label="Filtrar pessoas" layout="form">
      <div className="form-layout min-h-0 flex-1">
        <FormBody>
          <h2 className="mb-1 text-sm font-semibold">Filtrar pessoas</h2>
          <p className="mb-4 text-xs opacity-70">Marque quantas opções quiser. Sem nada marcado, vale para todos.</p>
          <OpcoesMultiplas<VinculoPessoa> legenda="Vínculo" vazio="Todos" valores={filtros.vinculos} onChange={vinculos => mudar({ vinculos })}
            opcoes={[{ value: 'interno', label: 'Equipe' }, { value: 'externo', label: 'Externos' }]} />
          <OpcoesMultiplas<SituacaoPessoa> legenda="Situação" vazio="Todas" valores={filtros.situacoes} onChange={situacoes => mudar({ situacoes })}
            opcoes={[{ value: 'ativo', label: 'Ativos' }, { value: 'inativo', label: 'Inativos' }]} />
          <OpcoesMultiplas legenda="Área ou empresa" vazio="Todas" valores={filtros.areas} onChange={areas => mudar({ areas })}
            opcoes={areas.map(a => ({ value: a, label: a }))} semOpcoes="Nenhuma área ou empresa cadastrada." />
        </FormBody>
        <FormActions surface="none" className="flex justify-end gap-2 pt-3">
          <GlassButton disabled={ativos === 0} onClick={() => onChange(FILTROS_PESSOAS_VAZIOS)}>Limpar</GlassButton>
          <GlassButton variant="primary" onClick={() => setAberto(false)}>Concluir</GlassButton>
        </FormActions>
      </div>
    </GlassPopover>
  </>
}
