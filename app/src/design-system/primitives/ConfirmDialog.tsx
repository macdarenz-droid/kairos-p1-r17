import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { useModalFocus } from './modalFocus';
import './kit.css';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly message: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly tone?: 'danger' | 'default';
  readonly busy?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** "Are you sure?" before anything that cannot be taken back (P40's confirm before deleting). Focus starts on the safe choice. */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, tone = 'default', busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const keepFocusInside = useModalFocus(open, panel, cancel);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // While busy both buttons are disabled; the pressed one would drop focus to the page, so focus waits on the panel.
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !busy || element === null) return;
    const active = document.activeElement;
    const enabledInside = active instanceof HTMLElement && active !== element && element.contains(active) && !active.matches(':disabled');
    if (!enabledInside) element.focus({ preventScroll: true });
  }, [open, busy]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') { event.stopPropagation(); if (!busyRef.current) onCancel(); return; }
    keepFocusInside(event);
  }

  return createPortal(<div className="kairos-sheet kairos-confirm">
    <div className="kairos-sheet__backdrop" data-sheet-backdrop="" onClick={() => { if (!busy) onCancel(); }} />
    <div className="kairos-sheet__panel kairos-confirm__panel" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId}
      tabIndex={-1} ref={panel} onKeyDown={handleKeyDown}>
      <h2 id={titleId} className="kairos-sheet__title">{title}</h2>
      <div id={messageId} className="kairos-confirm__message">{message}</div>
      <div className="kairos-confirm__actions">
        <Button ref={cancel} variant="secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  </div>, document.body);
}
