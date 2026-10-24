export type WbsViewMode = 'chart' | 'details' | 'costs' | 'gantt';
/**
 * Menu Organizar (ADR-047, desenho em lib/wbsLayout.ts). Na raiz é o formato da EAP inteira:
 * LADO_A_LADO = Padrão, DIREITA, ESQUERDA ou HORIZONTAL. Numa fase (1º nível), ESQUERDA/DIREITA
 * é o formato próprio dela e de tudo abaixo; outro valor = segue a EAP. Abaixo das fases não é usado.
 */
export type WbsLayoutOrientation = 'LADO_A_LADO' | 'DIREITA' | 'ESQUERDA' | 'HORIZONTAL';
export type ClipboardActionType = 'COPY' | 'CUT' | null;
export type DropPosition = 'INSIDE' | 'BEFORE' | 'AFTER';

export interface WbsNodeStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  borderWidth: number;
  fontSize: number;
  borderRadius: number;
}

export interface WbsNodeProperties {
  /** Card da sprint vinculado a este nó (sincronização EAP ↔ sprint). */
  cardId?: string;
  /** Sprint representada por este nó (nível 2 da EAP). */
  sprintId?: string;
  /** Folha: custo DERIVADO de tempo×valorPorMinuto+materiais (§5.4). Rollup soma. >= 0 */
  cost?: number;
  /** INPUT só em folhas; rollup soma os filhos. >= 0 */
  durationDays?: number;
  /** referência a UserProject ativo */
  ownerUserId?: string;
  description?: string;
  /** Planilha de Custos — folha: tempo previsto (minutos). */
  tempoMinutos?: number;
  /** Planilha de Custos — folha: custo previsto de materiais. */
  materiais?: number;
  /** Planilha de Custos — folha: data de realização prevista. */
  dataPrevista?: string | null;
  /** Planilha de Custos — folha: tempo real (minutos). */
  tempoRealMinutos?: number;
  /** DERIVADO em leitura dos apontamentos encerrados do card; não persistido no nó. */
  tempoRealApontadoSegundos?: number;
  /** Planilha de Custos — folha: custo real de materiais. */
  materiaisReal?: number;
  /** Planilha de Custos — folha: data de realização efetiva. */
  dataRealizacao?: string | null;
  /** Planilha de Custos — folha: nome/identificação de quem elaborou. */
  elaboradoPor?: string;
  /** Planilha de Custos — folha: id do primeiro elaborador (formato antigo; = elaboradoPorUserIds[0]). */
  elaboradoPorUserId?: string | null;
  /** Planilha de Custos — folha: quem elaborou = responsáveis do card ligado (lib/elaboradores.ts). */
  elaboradoPorUserIds?: string[] | null;
  /** Os elaboradores já foram juntados com os responsáveis do card uma vez; depois o card manda. */
  elaboradoSincronizado?: boolean;
  /** Planilha de Custos — folha: % de conclusão (0-100) para situação. */
  percentualConclusao?: number;
}

/** Valores derivados (não persistidos) — calculados por lib/wbsRollup.ts */
export interface WbsRollup {
  cost: number;
  durationDays: number;
  isRolledUp: boolean;
}

export interface WbsNodeClient {
  id: string;
  parentId: string | null;
  /** posição 0-based entre irmãos — FONTE DE VERDADE da ordenação */
  order: number;
  /** derivado; recalculado pelo servidor */
  code: string;
  title: string;
  layout: WbsLayoutOrientation;
  collapsed: boolean;
  style: WbsNodeStyle;
  properties: WbsNodeProperties;
  /** IDs dos filhos ORDENADOS por `order` */
  childrenIds: string[];
}

export interface WbsNodeGeometry {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Card em pé, com o texto na vertical (raiz do formato Horizontal). */
  vertical?: boolean;
}

export interface WbsConnector {
  fromId: string;
  toId: string;
  path: string;
}

export interface WbsLayoutResult {
  geometry: Record<string, WbsNodeGeometry>;
  connectors: WbsConnector[];
  bounds: { width: number; height: number };
}

/** client-only */
export interface WbsViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface WbsHistoryEntry {
  nodes: Record<string, WbsNodeClient>;
  rootId: string | null;
}

export interface WbsTreeState {
  nodes: Record<string, WbsNodeClient>;
  rootId: string | null;
  selectedNodeIds: string[];
  /** edição inline em andamento */
  editingNodeId: string | null;
  /** texto inicial da edição inline (digitação substitui o título) */
  editingInitialText?: string;
  /** nó recém-criado que o canvas deve centralizar (limpo após o pan) */
  focusNodeId: string | null;
  clipboard: {
    nodes: WbsNodeClient[];
    copiedStyle: WbsNodeStyle | null;
    actionType: ClipboardActionType;
  };
  history: {
    past: WbsHistoryEntry[];
    future: WbsHistoryEntry[];
  };
  viewport: WbsViewport;
  sync: {
    status: 'IDLE' | 'DIRTY' | 'SAVING' | 'ERROR' | 'CONFLICT';
    lastSavedAt: number | null;
    serverVersion: number;
  };
}
