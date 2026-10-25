import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { useModalFocus } from './modalFocus';
import './primitives.css';

export interface SheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

/**
 * A modal panel: slides up from the bottom on phones, centred on wider screens.
 * Focus moves into it on open, stays inside while Tab cycles, and returns to
 * where it was on close (modalFocus.ts). `<dialog>.showModal()` is not used because jsdom
 * does not implement it.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const keepFocusInside = useModalFocus(open, panel);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') { event.stopPropagation(); onCloseRef.current(); return; }
    keepFocusInside(event);
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
