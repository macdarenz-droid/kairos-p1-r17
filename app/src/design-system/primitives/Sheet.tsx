import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import './primitives.css';

export interface SheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal panel: slides up from the bottom on phones, centred on wider screens.
 * Focus moves into it on open, stays inside while Tab cycles, and returns to
 * where it was on close. `<dialog>.showModal()` is not used because jsdom
 * does not implement it.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') { event.stopPropagation(); onCloseRef.current(); return; }
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) { event.preventDefault(); panel.current.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  return createPortal(<div className="kairos-sheet">
    <div className="kairos-sheet__backdrop" data-sheet-backdrop="" onClick={() => onCloseRef.current()} />
    <div className="kairos-sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel} onKeyDown={handleKeyDown}>
      <div className="kairos-sheet__header">
        <h2 id={titleId} className="kairos-sheet__title">{title}</h2>
        <Button variant="ghost" size="sm" onClick={() => onCloseRef.current()}>Close</Button>
      </div>
      {children}
    </div>
  </div>, document.body);
}
