export type CardColor =
  | '#ef4444'
  | '#f97316'
  | '#eab308'
  | '#22c55e'
  | '#3b82f6'
  | '#8b5cf6'
  | '#ec4899'
  | '#14b8a6'
  | '#6b7280'
  | '#94a3b8'

export const CARD_COLORS: { value: CardColor; label: string }[] = [
  { value: '#6b7280', label: 'Cinza' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#f97316', label: 'Laranja' },
  { value: '#eab308', label: 'Amarelo' },
  { value: '#22c55e', label: 'Verde' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#8b5cf6', label: 'Violeta' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#14b8a6', label: 'Teal' },
]

export interface CardTag {
  tagId: string
  tag: { id: string; name: string; color: string }
}

export interface Attachment {
  id: string
  fileName: string
  fileType: string
  filePath: string
  fileSize: number
  isCover?: boolean
  uploadedAt: number
}

export interface CardResponsible {
  user: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

export interface Card {
  id: string
  title: string
  /** Código do nó vinculado na EAP (ex.: "1.2.3"); exibido como "1.2.3 - título". */
  eapCode?: string
  /** Todos os responsáveis estão inativos no projeto: precisa de outro para concluir. */
  precisaResponsavel?: boolean
  description: string
  color: CardColor
  priority?: string
  sprintId?: string | null
  tags?: CardTag[]
  attachments?: Attachment[]
  responsibles?: CardResponsible[]
  startDate?: Date | null
  endDate?: Date | null
  createdAt: number
  updatedAt: number
  // Orçado
  orcado_min?: number | null
  orcado_horas?: number | null
  orcado_dias?: number | null
  orcado_total?: number | null
  data_prevista?: Date | string | null
  // Realizado
  realizado_min?: number | null
  realizado_horas?: number | null
  realizado_dias?: number | null
  realizado_total?: number | null
  data_realizacao?: Date | string | null
  situacao_status?: string | null
}

export interface Column {
  id: string
  title: string
  cardIds: string[]
  /** Cor escolhida para a coluna (#rrggbb); null/ausente = padrão. */
  color?: string | null
}

export interface BoardState {
  projectName: string
  columns: Column[]
  cards: Record<string, Card>
}
