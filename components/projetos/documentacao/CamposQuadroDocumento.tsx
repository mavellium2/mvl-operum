'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchWithSession } from '@/lib/clientFetch'
import DateInput from '@/components/ui/DateInput'
import MembroEquipeSelect, { type MembroEquipeOption } from './MembroEquipeSelect'

/**
 * Campos padrão do quadro de identificação dos documentos (Termo, Partes
 * Interessadas, EAP…). Todo documento usa estes campos em vez de inputs próprios:
 *  - "Gerente do projeto": automático (gerente do projeto), só leitura;
 *  - "Elaborado por" / "Aprovado por": select de membro da equipe com "+" para criar;
 *  - "Versão" e "Data de aprovação".
 * Renderiza só os campos; o container (grid) fica com o documento.
 */

const LABEL = 'block text-sm font-semibold text-slate-700 mb-1'
const INPUT =
  'w-full border-2 border-slate-400 rounded-lg px-3 py-2 text-sm text-slate-900 bg-white placeholder-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

export function CampoGerenteProjeto({ id, nome, labelClass = LABEL, inputClass = INPUT }: { id: string; nome: string; labelClass?: string; inputClass?: string }) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>Gerente do projeto</label>
      <input
        id={id}
        className={`${inputClass} bg-slate-100 cursor-not-allowed`}
        value={nome}
        readOnly
        placeholder="Nenhum gerente definido no projeto"
        title="Preenchido automaticamente com o gerente do projeto"
      />
    </div>
  )
}

export interface CamposQuadroDocumentoProps {
  /** Prefixo dos ids dos campos (ex.: "eap", "pc", "ds"). */
  idPrefix: string
  projetoId: string
  /** Membros da equipe, já somados aos criados na sessão (`useMembrosEquipe`). */
  membros: MembroEquipeOption[]
  onCriarMembro: (membro: MembroEquipeOption) => void
  elaboradoPorUserId: string | null | undefined
  onElaboradoPor: (membro: MembroEquipeOption | null) => void
  aprovadoPorUserId: string | null | undefined
  onAprovadoPor: (membro: MembroEquipeOption | null) => void
  versao: string
  onVersao: (versao: string) => void
  dataAprovacao: string
  onDataAprovacao: (data: string) => void
  /** Quando informado, mostra o gerente (automático) antes dos demais campos. */
  gerenteProjeto?: string
  disabled?: boolean
  labelClass?: string
  inputClass?: string
}

export default function CamposQuadroDocumento({
  idPrefix, projetoId, membros, onCriarMembro,
  elaboradoPorUserId, onElaboradoPor, aprovadoPorUserId,
  versao, onVersao, dataAprovacao, onDataAprovacao,
  gerenteProjeto, disabled, labelClass = LABEL, inputClass = INPUT,
}: CamposQuadroDocumentoProps) {
  const [usuarioAtual, setUsuarioAtual] = useState<MembroEquipeOption | null>(null)
  const defaults = useRef({ elaboradoPorUserId, onElaboradoPor })
  useEffect(() => {
    let active = true
    void fetchWithSession('/api/me').then(r => r.ok ? r.json() : null).then(data => {
      if (active && data?.user?.id && data.user.name) setUsuarioAtual({ id: data.user.id, name: data.user.name, setor: null })
      if (active && !defaults.current.elaboradoPorUserId && data?.user?.id && data.user.name) {
        defaults.current.onElaboradoPor({ id: data.user.id, name: data.user.name, setor: null })
      }
    }).catch(() => {})
    return () => { active = false }
  }, [projetoId])
  return (
    <>
      {gerenteProjeto !== undefined && (
        <CampoGerenteProjeto id={`${idPrefix}-gerente`} nome={gerenteProjeto} labelClass={labelClass} inputClass={inputClass} />
      )}
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-elaborado-por`}>Elaborado por</label>
        <MembroEquipeSelect
          id={`${idPrefix}-elaborado-por`}
          membros={usuarioAtual && !membros.some(m => m.id === usuarioAtual.id) ? [...membros, usuarioAtual] : membros}
          projetoId={projetoId}
          value={elaboradoPorUserId}
          onChange={onElaboradoPor}
          onCriarMembro={onCriarMembro}
          placeholder="Selecionar membro da equipe"
          className={inputClass}
          disabled={disabled}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-aprovado-por`}>Aprovado por</label>
        <input id={`${idPrefix}-aprovado-por`} className={inputClass} value={gerenteProjeto ?? membros.find(m => m.id === aprovadoPorUserId)?.name ?? ''} readOnly placeholder="Nenhum gerente definido no projeto" title="Preenchido automaticamente com o gerente do projeto" />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-versao`}>Versão</label>
        <input
          id={`${idPrefix}-versao`}
          className={inputClass}
          value={versao}
          onChange={e => onVersao(e.target.value)}
          placeholder="1.0"
          disabled={disabled}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-data-aprovacao`}>Data de aprovação</label>
        <DateInput
          id={`${idPrefix}-data-aprovacao`}
          className={inputClass}
          value={dataAprovacao}
          onChange={onDataAprovacao}
          disabled={disabled}
        />
      </div>
    </>
  )
}
