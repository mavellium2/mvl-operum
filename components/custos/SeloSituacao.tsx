import type { SituacaoAtividade } from '@/lib/planilhaCustos'

const SITUACAO_CLASS: Record<SituacaoAtividade, string> = {
  Antecipada: 'bg-emerald-100 text-emerald-800',
  'No prazo': 'bg-blue-100 text-blue-800',
  Atrasada: 'bg-red-100 text-red-800',
  Pendente: 'bg-gray-100 text-gray-700',
}

/** Selo da situação da atividade, igual na planilha e no gráfico por elaborador. */
export default function SeloSituacao({ situacao }: { situacao: SituacaoAtividade }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${SITUACAO_CLASS[situacao]}`}>{situacao}</span>
}
