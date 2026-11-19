import { useId, type ReactNode } from 'react'

/**
 * Ícones dos 13 blocos do Canvas, redesenhados em vetor a partir dos ícones do
 * DOCX de referência (mesma composição, cores e posição; a arte original só
 * existia em baixa resolução, achatada no fundo). Cada um é um SVG só, com
 * cores fixas, então fica nítido na tela, no PDF e no Word.
 */

type Desenho = (g: (nome: string) => string) => ReactNode

/** Arredonda coordenadas calculadas com seno/cosseno: servidor e navegador diferem nas últimas casas e quebravam a hidratação. */
const r2 = (n: number) => Math.round(n * 100) / 100

/** Boneco de papel (cabeça, braços abertos e pernas) para o círculo de stakeholders. */
const boneco = (x: number, y: number, s: number, cor: string) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={cor}>
    <circle cx="0" cy="-7.2" r="1.9" />
    <path d="M-1.6 -5 h3.2 l4.6 2.6 -0.7 1.1 -3.6 -1.6 0.2 3.2 2.4 6.4 -1.5 0.6 -2.6 -5.6 -2.6 5.6 -1.5 -0.6 2.4 -6.4 0.2 -3.2 -3.6 1.6 -0.7 -1.1 z" />
  </g>
)

/** Boneco 3D branco (cabeça, corpo e pernas sombreados), usado em Restrições, Premissas e Estratégia. */
const pessoa3d = (gr: string, cx: number, topo: number, s: number) => (
  <g transform={`translate(${cx} ${topo}) scale(${s})`}>
    <circle cx="0" cy="3" r="3" fill={`url(#${gr})`} />
    <path d="M-3.4 7 Q0 6 3.4 7 L3 15 2.4 15 2 22.5 0.4 22.5 0 16 -0.4 22.5 -2 22.5 -2.4 15 -3 15 Z" fill={`url(#${gr})`} />
  </g>
)

const DESENHOS: Record<string, { viewBox: string; desenho: Desenho }> = {
  // Gráfico de barras em degradê (verde → vermelho) com a linha azul em zigue-zague.
  justificativa: {
    viewBox: '0 0 50 34',
    desenho: g => <>
      <defs>
        {[['b1', '#2fa83a', '#7cd35a'], ['b2', '#6cbf2e', '#b5e04a'], ['b3', '#c9d22a', '#eef06a'], ['b4', '#f0b51e', '#ffd95a'], ['b5', '#ea7a1a', '#ffb04d'], ['b6', '#c81e12', '#ee5a3a']].map(([id, a, b]) => (
          <linearGradient key={id} id={g(id)} x1="0" x2="1"><stop offset="0" stopColor={b} /><stop offset="0.6" stopColor={a} /><stop offset="1" stopColor={a} stopOpacity="0.85" /></linearGradient>
        ))}
      </defs>
      {[[3, 3], [8.6, 7.5], [14.2, 11.5], [19.8, 15], [25.4, 18.5]].map(([x, topo], i) => (
        <path key={i} d={`M${x} ${topo + 1.2} q0 -1.2 2.6 -1.2 q2.6 0 2.6 1.2 V32 H${x} Z`} fill={`url(#${g(`b${i + 1}`)})`} />
      ))}
      <path d="M32 22.5 q0 -1 4 -1 h6 q4 0 4 1 V32 H32 Z" fill={`url(#${g('b6')})`} />
      <path d="M6 2.5 L11 9 L14 5.5 L19.5 13 L23 8.5 L30.5 17.5 L37 12 L45.5 21.5" fill="none" stroke="#3b6fc4" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M2 32.6 H47" stroke="#9aa3ad" strokeWidth="0.6" />
    </>,
  },
  // Alvo vermelho e branco com três dardos azuis.
  objetivos: {
    viewBox: '0 0 44 46',
    desenho: g => <>
      <defs>
        <radialGradient id={g('sombra')}><stop offset="0" stopColor="#000" stopOpacity="0.25" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <linearGradient id={g('pena')} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#7fb2ee" /><stop offset="1" stopColor="#1f5fbf" /></linearGradient>
      </defs>
      <ellipse cx="31" cy="40" rx="10" ry="2.2" fill={`url(#${g('sombra')})`} />
      {[[11.5, '#c8161d'], [9.2, '#fff'], [7, '#d81e25'], [4.8, '#fff'], [2.6, '#d81e25']].map(([r, cor], i) => (
        <ellipse key={i} cx="31" cy="23" rx={Number(r) * 0.86} ry={Number(r)} fill={String(cor)} stroke={i === 0 ? '#8e0d12' : 'none'} strokeWidth="0.5" />
      ))}
      {[[5, 5, 0], [3.5, 15.5, 0], [6, 27.5, 0]].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x + 5} ${y + 4} L29.5 22.5`} stroke="#34507a" strokeWidth="1" strokeLinecap="round" />
          <path d={`M${x} ${y} q4 -1 7 2.5 l-1.5 3 q-4 0.5 -5.5 -5.5 Z`} fill={`url(#${g('pena')})`} />
          <path d={`M${x - 1} ${y + 5.5} q3.5 -2 7 0.5 l-0.8 2.5 q-3.5 1 -6.2 -3 Z`} fill={`url(#${g('pena')})`} />
        </g>
      ))}
    </>,
  },
  // Alvo preto e branco com dardo no centro (Escopo).
  escopo: {
    viewBox: '0 0 36 41',
    desenho: g => <>
      <defs>
        <radialGradient id={g('aro')} cx="0.45" cy="0.45"><stop offset="0.85" stopColor="#fff" /><stop offset="1" stopColor="#c9c9c9" /></radialGradient>
      </defs>
      <ellipse cx="16.5" cy="23" rx="15" ry="16.5" fill="#bdbdbd" opacity="0.55" />
      <ellipse cx="15.5" cy="22" rx="14.6" ry="16" fill={`url(#${g('aro')})`} stroke="#a8a8a8" strokeWidth="0.5" />
      {[[11.6, 12.8, '#111'], [9, 10, '#fff'], [6.6, 7.3, '#111'], [4, 4.5, '#fff'], [2, 2.3, '#111']].map(([rx, ry, cor], i) => (
        <ellipse key={i} cx="15.5" cy="22" rx={Number(rx)} ry={Number(ry)} fill={String(cor)} />
      ))}
      <path d="M15.5 22 L31 6" stroke="#222" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M28.5 8.5 L35 1.5 L33.6 7.4 Z M28.5 8.5 L35 1.5 L29.2 3 Z" fill="#111" />
    </>,
  },
  escopoNaoIncluido: { viewBox: '0 0 36 41', desenho: g => DESENHOS.escopo.desenho(g) },
  // Boneco branco no centro com setas coloridas saindo em todas as direções.
  estrategia: {
    viewBox: '0 0 47 39',
    desenho: g => <>
      <defs>
        <linearGradient id={g('pessoa')} x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#bfc3c8" /></linearGradient>
      </defs>
      <ellipse cx="23.5" cy="26" rx="7" ry="2.2" fill="#e3e6ea" />
      {[[-178, '#e8432c'], [-150, '#f18a2a'], [-120, '#7ec8f0'], [-60, '#8cd13b'], [-25, '#f2d22c'], [0, '#f39a2a'], [30, '#e8432c'], [150, '#f39a2a'], [170, '#ef5a2c'], [60, '#9fd03a'], [115, '#e8432c']].map(([ang, cor], i) => {
        const a = (Number(ang) * Math.PI) / 180
        const x1 = r2(23.5 + Math.cos(a) * 5), y1 = r2(26 + Math.sin(a) * 2.2), x2 = r2(23.5 + Math.cos(a) * 21), y2 = r2(26 + Math.sin(a) * 11)
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={String(cor)} strokeWidth="2" strokeLinecap="round" />
            <circle cx={x2} cy={y2} r="1.4" fill={String(cor)} />
          </g>
        )
      })}
      {pessoa3d(g('pessoa'), 23.5, 1, 1)}
      <path d="M22.6 8 h1.8 l-0.4 6 h-1 z" fill="#d23a2a" />
    </>,
  },
  // Círculo de bonecos de mãos dadas em volta do chão cinza.
  stakeholders: {
    viewBox: '0 0 42 42',
    desenho: g => <>
      <defs>
        <radialGradient id={g('chao')} cx="0.5" cy="0.4"><stop offset="0" stopColor="#f1f1f1" /><stop offset="1" stopColor="#b9b9b9" /></radialGradient>
      </defs>
      <ellipse cx="21" cy="27" rx="18" ry="13" fill={`url(#${g('chao')})`} />
      {[[5, 11, 0.62, '#555'], [11.5, 8, 0.62, '#9a9a9a'], [17.5, 7, 0.62, '#9b1b1b'], [24, 7, 0.62, '#333'], [30.5, 8, 0.62, '#7a7a7a'], [36.5, 11, 0.62, '#9a9a2a'], [38.5, 19, 0.7, '#a9a930'], [3, 19, 0.7, '#666']].map(([x, y, s, c], i) => (
        <g key={i}>{boneco(Number(x), Number(y), Number(s), String(c))}</g>
      ))}
      {boneco(10, 30, 1.05, '#b11e1e')}
      {boneco(23, 31, 1.2, '#1f1f1f')}
      {boneco(35, 28, 0.9, '#9f9f28')}
    </>,
  },
  // Símbolo de rede sem fio (Comunicação).
  comunicacao: {
    viewBox: '0 0 29 31',
    desenho: () => <>
      {/* Três arcos de ~100° centrados no ponto, como o símbolo original. */}
      {[20, 13.5, 7].map((r, i) => {
        const dx = r2(r * Math.sin(Math.PI * 50 / 180)), dy = r2(r * Math.cos(Math.PI * 50 / 180))
        return <path key={i} d={`M${14.5 - dx} ${26 - dy} A${r} ${r} 0 0 1 ${14.5 + dx} ${26 - dy}`} fill="none" stroke="#000" strokeWidth="3.4" strokeLinecap="round" />
      })}
      <circle cx="14.5" cy="26.5" r="2.7" fill="#000" />
    </>,
  },
  // Boneco branco segurando um X vermelho (Restrições).
  restricoes: {
    viewBox: '0 0 21 34',
    desenho: g => <>
      <defs>
        <linearGradient id={g('pessoa')} x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#bdbdbd" /></linearGradient>
        <linearGradient id={g('x')} x1="0" x2="1"><stop offset="0" stopColor="#e2332b" /><stop offset="1" stopColor="#a1150f" /></linearGradient>
      </defs>
      <ellipse cx="10" cy="32.5" rx="5" ry="1" fill="#000" opacity="0.15" />
      {pessoa3d(g('pessoa'), 9, 1.5, 1.25)}
      <path d="M3 4.5 L5.4 3 L18.6 24.6 L16.2 26.1 Z" fill={`url(#${g('x')})`} />
      <path d="M15.5 3 L18 4.5 L6.4 26 L3.9 24.5 Z" fill={`url(#${g('x')})`} />
    </>,
  },
  // Ponto de interrogação azul e boneco branco pensando (Premissas).
  premissas: {
    viewBox: '0 0 21 37',
    desenho: g => <>
      <defs>
        <linearGradient id={g('pessoa')} x1="0" x2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#bdbdbd" /></linearGradient>
        <linearGradient id={g('q')} x1="0" x2="1"><stop offset="0" stopColor="#2f8ab0" /><stop offset="1" stopColor="#145a78" /></linearGradient>
      </defs>
      <ellipse cx="12" cy="35.5" rx="7" ry="1.1" fill="#000" opacity="0.15" />
      <path d="M1.5 7.5 Q1.5 1 7.5 1 Q13.5 1 13.5 6.5 Q13.5 10 10 12.5 Q8.2 13.8 8.2 17 V19 H4.6 V16.5 Q4.6 12 8 9.8 Q9.6 8.6 9.6 6.8 Q9.6 4.5 7.5 4.5 Q5.2 4.5 5.2 7.5 Z" fill={`url(#${g('q')})`} />
      <circle cx="6.4" cy="23.5" r="2.2" fill={`url(#${g('q')})`} />
      {pessoa3d(g('pessoa'), 14.5, 9.5, 1.12)}
    </>,
  },
  // Forma cinza 3D com a explosão de raios (Riscos).
  riscos: {
    viewBox: '0 0 38 56',
    desenho: g => <>
      <defs>
        <radialGradient id={g('pedra')} cx="0.35" cy="0.3"><stop offset="0" stopColor="#f2f2f2" /><stop offset="0.6" stopColor="#9a9a9a" /><stop offset="1" stopColor="#5b5b5b" /></radialGradient>
        <radialGradient id={g('brilho')}><stop offset="0" stopColor="#fff6b0" /><stop offset="1" stopColor="#ff8a3a" stopOpacity="0" /></radialGradient>
      </defs>
      {Array.from({ length: 26 }, (_, i) => {
        const a = (-150 + i * 12) * (Math.PI / 180)
        const comp = 9 + ((i * 7) % 11)
        return <line key={i} x1="23" y1="20" x2={r2(23 + Math.cos(a) * comp)} y2={r2(20 + Math.sin(a) * comp)} stroke={i % 3 === 0 ? '#8a8a8a' : '#f07a3e'} strokeWidth="0.55" />
      })}
      <circle cx="23" cy="20" r="3.2" fill={`url(#${g('brilho')})`} />
      <path d="M2 30 Q1.5 18 11 17.5 Q20.5 17.5 21 30 V44 Q21 54 11.5 54 Q2 54 2 44 Z" fill={`url(#${g('pedra')})`} stroke="#5a5a5a" strokeWidth="0.4" />
      <path d="M5 24 Q7 20.5 11 20.5" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" strokeLinecap="round" />
    </>,
  },
  // Blocos coloridos subindo como escada, com silhuetas empurrando (Fases).
  fases: {
    viewBox: '0 0 30 44',
    desenho: g => <>
      <defs>
        {[['azul', '#3b8fe6', '#1d5fb8'], ['roxo', '#a86fd6', '#6e3aa8'], ['ciano', '#5fd0f0', '#1e98c8'], ['vermelho', '#f06a4a', '#c8341f'], ['laranja', '#f7a43a', '#d9781a'], ['amarelo', '#ffe14a', '#e0b81a']].map(([id, a, b]) => (
          <linearGradient key={id} id={g(id)} x1="0" x2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        ))}
      </defs>
      <ellipse cx="13" cy="41.5" rx="11" ry="1.6" fill="#6a8ff0" opacity="0.25" />
      {[['amarelo', 21, 1, 7, 10], ['laranja', 19, 9, 8, 9], ['vermelho', 16, 15, 8, 9], ['ciano', 12, 21, 9, 10], ['roxo', 9, 26, 8, 9], ['azul', 4, 31, 10, 10]].map(([cor, x, y, w, h]) => (
        <g key={String(cor)}>
          <rect x={Number(x)} y={Number(y)} width={Number(w)} height={Number(h)} fill={`url(#${g(String(cor))})`} />
          <path d={`M${Number(x)} ${Number(y)} l2 -1.5 h${Number(w)} l-2 1.5 Z`} fill="#fff" opacity="0.45" />
        </g>
      ))}
      {[[3.5, 22, 0.75], [7.5, 19, 0.75], [25, 27, 0.8]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`} fill="#111">
          <circle cx="0" cy="0" r="1.6" />
          <path d="M-1.4 2 h2.8 l1 6 2.4 0.6 -0.3 1 -3 -0.5 -0.2 2.4 1 6 h-1.3 l-1.3 -5.4 -1.3 5.4 h-1.3 l1 -6 -0.5 -4 -1.6 3 -1 -0.4 Z" />
        </g>
      ))}
    </>,
  },
  // Relógio de parede com aro cobre e ponteiros azuis (Cronograma).
  cronograma: {
    viewBox: '0 0 28 40',
    desenho: g => <>
      <defs>
        <linearGradient id={g('aro')} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#f6c79a" /><stop offset="0.5" stopColor="#d6743a" /><stop offset="1" stopColor="#9e4a1f" /></linearGradient>
        <radialGradient id={g('mostrador')} cx="0.4" cy="0.35"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#dfe8f2" /></radialGradient>
      </defs>
      <ellipse cx="15" cy="21" rx="12.5" ry="17.5" fill="#c4c4c4" opacity="0.6" />
      <ellipse cx="14" cy="20" rx="12.5" ry="17.5" fill={`url(#${g('aro')})`} />
      <ellipse cx="14.4" cy="20" rx="10.2" ry="14.8" fill={`url(#${g('mostrador')})`} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180
        return <line key={i} x1={r2(14.4 + Math.sin(a) * 8.6)} y1={r2(20 - Math.cos(a) * 12.6)} x2={r2(14.4 + Math.sin(a) * 9.6)} y2={r2(20 - Math.cos(a) * 14)} stroke={i % 3 === 0 ? '#c0392b' : '#9aa5b1'} strokeWidth={i % 3 === 0 ? 0.9 : 0.5} />
      })}
      <path d="M14.4 20 L9.5 9.5" stroke="#1d3f9e" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M14.4 20 L20 10.5" stroke="#1d3f9e" strokeWidth="1" strokeLinecap="round" />
      <path d="M14.4 20 L15.6 31" stroke="#e05a2a" strokeWidth="0.5" strokeLinecap="round" />
      <circle cx="14.4" cy="20" r="0.9" fill="#1d3f9e" />
    </>,
  },
  // Baú aberto com tampa cinza e conteúdo dourado (Orçamento).
  orcamento: {
    viewBox: '0 0 30 42',
    desenho: g => <>
      <defs>
        <linearGradient id={g('tampa')} x1="0" x2="1"><stop offset="0" stopColor="#c9cdd2" /><stop offset="1" stopColor="#6d7278" /></linearGradient>
        <linearGradient id={g('corpo')} x1="0" x2="1"><stop offset="0" stopColor="#a94a3a" /><stop offset="1" stopColor="#6a2219" /></linearGradient>
        <linearGradient id={g('ouro')} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#fff38a" /><stop offset="1" stopColor="#f0b21a" /></linearGradient>
      </defs>
      <ellipse cx="15" cy="39.5" rx="13" ry="2" fill="#000" opacity="0.18" />
      <path d="M4 16 L3 6 Q3 2 7 2 L19 3 Q22 3.3 21.5 7 L20 15 Z" fill={`url(#${g('tampa')})`} stroke="#4c5156" strokeWidth="0.6" />
      <path d="M5 16 L20 14.5 L27 19 L12 21 Z" fill={`url(#${g('ouro')})`} stroke="#c88a12" strokeWidth="0.5" />
      <path d="M5 16 L12 21 V38 L5 33.5 Z" fill="#8a3326" stroke="#3a120d" strokeWidth="0.5" />
      <path d="M12 21 L27 19 V35 L12 38 Z" fill={`url(#${g('corpo')})`} stroke="#3a120d" strokeWidth="0.5" />
      <path d="M12 21 L27 19" stroke="#e08a2a" strokeWidth="1.4" />
      <path d="M12 21 L5 16" stroke="#e08a2a" strokeWidth="1.4" />
      <rect x="22.5" y="25" width="2.5" height="3.2" rx="0.5" fill="#e9c24a" stroke="#8a6a12" strokeWidth="0.4" />
    </>,
  },
}

/** Posição e tamanho de cada ícone na folha (pt), iguais aos do ícone original na arte do DOCX. */
export const ICONES_CANVAS: { id: string; titulo: string; x: number; y: number; w: number; h: number }[] = [
  { id: 'justificativa', titulo: 'Justificativa', x: 8.2, y: 98.6, w: 51.5, h: 35 },
  { id: 'objetivos', titulo: 'Objetivo', x: 207.2, y: 98.6, w: 43.3, h: 45.3 },
  { id: 'escopo', titulo: 'Escopo', x: 418.5, y: 105.8, w: 36, h: 41.2 },
  { id: 'escopoNaoIncluido', titulo: 'Escopo não incluído', x: 806, y: 104, w: 36, h: 41.2 },
  { id: 'estrategia', titulo: 'Estratégia de condução', x: 11.3, y: 317.7, w: 47.4, h: 39.1 },
  { id: 'stakeholders', titulo: 'Stakeholders', x: 208.2, y: 314.7, w: 42.3, h: 42.2 },
  { id: 'comunicacao', titulo: 'Comunicação', x: 408.2, y: 320.8, w: 28.9, h: 30.9 },
  { id: 'restricoes', titulo: 'Restrições', x: 608.1, y: 316.7, w: 20.6, h: 34 },
  { id: 'premissas', titulo: 'Premissas', x: 813.2, y: 317.7, w: 20.6, h: 37 },
  { id: 'riscos', titulo: 'Riscos', x: 18.6, y: 535.9, w: 38.1, h: 56.6 },
  { id: 'fases', titulo: 'Fases', x: 406.1, y: 529.7, w: 29.9, h: 44.2 },
  { id: 'cronograma', titulo: 'Cronograma', x: 607.1, y: 532.8, w: 27.8, h: 40.1 },
  { id: 'orcamento', titulo: 'Orçamento', x: 809.1, y: 530.7, w: 29.9, h: 42.2 },
]

export function IconeCanvas({ id, titulo, x, y, w, h }: (typeof ICONES_CANVAS)[number]) {
  const base = useId().replace(/:/g, '')
  const { viewBox, desenho } = DESENHOS[id]
  return (
    <svg
      className="canvas-template-icone"
      role="img"
      aria-label={`Ícone: ${titulo}`}
      viewBox={viewBox}
      width={`${w}pt`}
      height={`${h}pt`}
      preserveAspectRatio="xMidYMid meet"
      style={{ position: 'absolute', left: `${x}pt`, top: `${y}pt`, zIndex: 2, overflow: 'visible' }}
    >
      {desenho(nome => `${base}-${nome}`)}
    </svg>
  )
}
