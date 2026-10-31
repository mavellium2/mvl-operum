import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';

interface ExpandableTextareaProps {
  id?: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  /** Altura mínima e altura recolhida, em px. */
  alturaMinima?: number;
  /** Título do campo: com ele, o botão de recolher fica na linha do título e o texto usa a largura toda. */
  rotulo?: React.ReactNode;
  /** Ocupa a altura toda da célula (campos lado a lado ficam com a mesma altura). */
  preencher?: boolean;
}

const ExpandableTextarea: React.FC<ExpandableTextareaProps> = ({
  id,
  name,
  value,
  onChange,
  placeholder,
  className,
  readOnly = false,
  alturaMinima = 100,
  rotulo,
  preencher = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isOverflowing, setIsOverflowing] = useState<boolean>(false);
  const [visibilityTick, setVisibilityTick] = useState(0);

  const prevHeightRef = useRef<number>(alturaMinima);

  // Recalculate height when the element transitions from hidden to visible
  // (e.g. when the parent tab becomes active). IntersectionObserver fires on
  // display:none → display:block changes even with no viewport movement.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibilityTick(t => t + 1);
    }, { threshold: 0.01 });
    io.observe(textarea);
    return () => io.disconnect();
  }, []);

  // Só anima quando a pessoa recolhe/expande; ao digitar, a altura acompanha o texto na hora.
  const animarRef = useRef(false);
  const alternar = () => { animarRef.current = true; setIsCollapsed(c => !c); };

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Dentro de um ancestral display:none o scrollHeight é 0 e travaria a altura em uma linha.
    if (textarea.offsetParent === null) return;

    const animar = animarRef.current;
    animarRef.current = false;

    // Mede a altura do conteúdo sem transição.
    textarea.style.transition = 'none';
    textarea.style.height = `${alturaMinima}px`;
    const scrollHeight = textarea.scrollHeight;
    setIsOverflowing(scrollHeight > alturaMinima + 2);
    const newHeight = isCollapsed ? alturaMinima : Math.max(alturaMinima, scrollHeight);

    if (animar) {
      // Parte da altura anterior e anima até a nova (curva suave, sem "pulo").
      textarea.style.height = `${prevHeightRef.current}px`;
      void textarea.offsetHeight;
      textarea.style.transition = 'height 320ms cubic-bezier(0.22, 1, 0.36, 1)';
      textarea.style.height = `${newHeight}px`;
      if (newHeight > prevHeightRef.current) {
        // Ao expandir, mostra o fim do campo se ele passar da área visível.
        setTimeout(() => textarea.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }), 340);
      }
    } else {
      textarea.style.height = `${newHeight}px`;
    }
    prevHeightRef.current = newHeight;
  }, [value, isCollapsed, visibilityTick, alturaMinima]);

  const botao = (posicao: string) => isOverflowing && (
        <button
          type="button"
          onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => { e.preventDefault(); alternar(); }}
          onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } }}
          aria-label={isCollapsed ? 'Expandir campo' : 'Recolher campo'}
          aria-expanded={!isCollapsed}
          className={`${posicao} p-1.5 bg-white/80 hover:bg-slate-100 text-slate-500 rounded-md border border-slate-200 shadow-sm transition-all backdrop-blur-sm z-10`}
          title={isCollapsed ? "Expandir" : "Recolher"}
        >
          {isCollapsed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
          )}
        </button>
  );

  return (
    <div className={`relative group ${preencher ? 'flex h-full flex-col' : ''}`}>
      {rotulo && (
        <div className="mb-1.5 flex min-h-7 items-end justify-between gap-2">
          <label htmlFor={id} className="min-w-0">{rotulo}</label>
          {botao('relative')}
        </div>
      )}
      <textarea
        readOnly={readOnly}
        ref={textareaRef}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => { if (isCollapsed) alternar(); }}
        // Folga à direita para o texto não passar por baixo do botão (canto superior).
        className={`${className} block w-full overflow-hidden ${preencher ? 'grow' : ''} ${isOverflowing && !rotulo ? 'pr-11' : ''} ${
          isCollapsed ? 'cursor-pointer' : ''
        }`}
      />
      {/* Recolhido: esmaece o fim do texto para indicar que há mais. */}
      {isCollapsed && isOverflowing && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-px bottom-px h-8 rounded-b-xl bg-gradient-to-t from-white to-transparent" />
      )}

      {!rotulo && botao('absolute top-2 right-2')}
    </div>
  );
};

export default ExpandableTextarea;