import { useCallback, useEffect, type KeyboardEvent, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Focus inside a modal (Sheet, ConfirmDialog): on open it remembers what had focus and moves to `initial` or the panel;
 * on close it goes back when that element is still in the page. The returned key handler keeps Tab and Shift+Tab inside.
 */
export function useModalFocus(open: boolean, panel: RefObject<HTMLElement | null>, initial?: RefObject<HTMLElement | null>): (event: KeyboardEvent<HTMLElement>) => void {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (initial?.current ?? panel.current)?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [open, panel, initial]);

  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab' || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) { event.preventDefault(); panel.current.focus(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }, [panel]);
}
