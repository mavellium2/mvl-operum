import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';

interface ExpandableTextareaProps {
  id?: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

const ExpandableTextarea: React.FC<ExpandableTextareaProps> = ({
  id,
  name,
  value,
  onChange,
  placeholder,
  className,
  readOnly = false
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isOverflowing, setIsOverflowing] = useState<boolean>(false);
  const [visibilityTick, setVisibilityTick] = useState(0);

  const prevHeightRef = useRef<number>(100);

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

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Skip calculation while element is inside a display:none ancestor —
    // scrollHeight returns 0 there, which would lock the height at 1 line.
    if (textarea.offsetParent === null) return;

    // 1. Acha o container que tem o scroll (seja a janela ou uma div modal)
    const getScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
      if (!node || node === document.body) return window;
      const overflowY = window.getComputedStyle(node).overflowY;
      const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
      if (isScrollable && node.scrollHeight > node.clientHeight) return node;
      return getScrollParent(node.parentElement);
    };

    const scrollContainer = getScrollParent(textarea);
    const isWindow = scrollContainer === window;

    const currentScrollY = isWindow 
      ? window.scrollY 
      : (scrollContainer as HTMLElement).scrollTop;

    // 3. Mede o tamanho no escuro
    textarea.style.transition = 'none';
    textarea.style.height = '100px'; 
    const scrollHeight = textarea.scrollHeight;

    setIsOverflowing(scrollHeight > 100);
    const newHeight = isCollapsed ? 100 : scrollHeight;
    textarea.style.height = `${newHeight}px`;

    // 4. RESTAURA A POSIÇÃO (Anula a tentativa do navegador de dar o pulo seco)
    if (isWindow) {
      window.scrollTo(window.scrollX, currentScrollY);
    } else {
      (scrollContainer as HTMLElement).scrollTop = currentScrollY;
    }

    void textarea.offsetHeight; 
    textarea.style.transition = 'height 300ms ease-in-out';

    // 5. ANIMAÇÃO DE SCROLL SUAVE COM MARGEM DE RESPIRO
    if (newHeight > prevHeightRef.current) {
      const MARGIN_BOTTOM = 120; // <-- Sua margem de respiro para não colar
      
      // setTimeout garante que a transição começou e nós dominamos o scroll
      setTimeout(() => {
        const rect = textarea.getBoundingClientRect();

        if (isWindow) {
          if (rect.bottom > window.innerHeight - MARGIN_BOTTOM) {
            window.scrollBy({
              top: rect.bottom - window.innerHeight + MARGIN_BOTTOM,
              behavior: 'smooth'
            });
          }
        } else {
          const container = scrollContainer as HTMLElement;
          const containerRect = container.getBoundingClientRect();
          
          if (rect.bottom > containerRect.bottom - MARGIN_BOTTOM) {
            container.scrollBy({
              top: rect.bottom - containerRect.bottom + MARGIN_BOTTOM,
              behavior: 'smooth'
            });
          }
        }
      }, 10);
    }

    prevHeightRef.current = newHeight;

  }, [value, isCollapsed, visibilityTick]);

  return (
    <div className="relative group">
      <textarea
        readOnly={readOnly}
        ref={textareaRef}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => isCollapsed && setIsCollapsed(false)} 
        // Folga à direita para o texto não passar por baixo do botão (canto superior).
        className={`${className} block w-full overflow-hidden ${isOverflowing ? 'pr-11' : ''} ${
          isCollapsed ? 'cursor-pointer' : ''
        }`}
      />

      {isOverflowing && (
        <button
          type="button"
          onMouseDown={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault(); 
            setIsCollapsed(!isCollapsed);
          }}
          aria-label={isCollapsed ? 'Expandir campo' : 'Recolher campo'}
          aria-expanded={!isCollapsed}
          className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-slate-100 text-slate-500 rounded-md border border-slate-200 shadow-sm transition-all backdrop-blur-sm z-10"
          title={isCollapsed ? "Expandir" : "Recolher"}
        >
          {isCollapsed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
          )}
        </button>
      )}
    </div>
  );
};

export default ExpandableTextarea;