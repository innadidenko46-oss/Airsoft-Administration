import React, { useEffect, useRef, useState } from 'react';

interface InfoTooltipProps {
  text: string;
  align?: 'left' | 'center' | 'right';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placement: 'top' | 'bottom';
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = Math.min(256, window.innerWidth - 24);
    const margin = 12;

    let left =
      align === 'right'
        ? rect.right - tooltipWidth
        : align === 'center'
        ? rect.left + rect.width / 2 - tooltipWidth / 2
        : rect.left;

    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - tooltipWidth - margin)
    );

    const placement = rect.top > 130 ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8;

    setCoords({ top, left, placement });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleDocClick = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleScrollOrResize = () => updatePosition();

    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('touchstart', handleDocClick, { passive: true });
    document.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('touchstart', handleDocClick);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, align]);

  const handleOpen = () => {
    updatePosition();
    setOpen(true);
  };

  return (
    <span
      className="relative inline-flex shrink-0 items-center align-middle"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={handleOpen}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={text}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            setOpen(false);
          } else {
            handleOpen();
          }
        }}
        onFocus={handleOpen}
        onBlur={() => setOpen(false)}
        className={`inline-flex h-[18px] w-[18px] cursor-help items-center justify-center rounded-full border font-mono text-[10px] font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e88a00] ${
          open
            ? 'border-[#e88a00] bg-amber-50 text-[#b86d00]'
            : 'border-stone-300 bg-white text-stone-500 hover:border-[#e88a00] hover:bg-amber-50/70 hover:text-[#b86d00]'
        }`}
      >
        i
      </button>

      {open && coords && (
        <span
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: 'min(17.5rem, calc(100vw - 1.5rem))',
            transform:
              coords.placement === 'top' ? 'translateY(-100%)' : 'none',
          }}
          className="pointer-events-none z-50 whitespace-normal rounded-lg border border-stone-700 bg-[#1c201c] px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-stone-100 shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
};
