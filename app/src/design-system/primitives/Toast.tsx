import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactElement } from 'react';
import { Icon } from '../icons/Icon';
import { Button } from './Button';
import './kit.css';

export interface ToastInput { readonly message: string; readonly action?: Readonly<{ label: string; onAction: () => void }> }
export const TOAST_MS = 6_000;
export const TOAST_WITH_ACTION_MS = 10_000;

type ToastApi = Readonly<{ show: (toast: ToastInput) => void; dismiss: () => void }>;
const NO_TOASTS: ToastApi = Object.freeze({ show: () => {}, dismiss: () => {} });
const ToastContext = createContext<ToastApi>(NO_TOASTS);

type Shown = Readonly<{ id: number; toast: ToastInput }>;

/** One polite status region, present before any toast, holding at most one short message with an optional action (Undo). */
export function ToastProvider({ children }: PropsWithChildren): ReactElement {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pointerOver, setPointerOver] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const paused = pointerOver || focusInside;
  const nextId = useRef(0);
  const toastElement = useRef<HTMLDivElement>(null);
  const focusCameFrom = useRef<HTMLElement | null>(null);
  const reset = useCallback(() => { setPointerOver(false); setFocusInside(false); focusCameFrom.current = null; }, []);
  const dismiss = useCallback(() => { setShown(null); reset(); }, [reset]);
  const show = useCallback((toast: ToastInput) => { nextId.current += 1; setShown({ id: nextId.current, toast }); reset(); }, [reset]);
  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  useEffect(() => {
    if (shown === null || paused) return;
    const timer = window.setTimeout(dismiss, shown.toast.action ? TOAST_WITH_ACTION_MS : TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [shown, paused, dismiss]);

  /** A close by Undo, Dismiss or Escape with focus inside gives focus back to where it came from (WCAG 2.4.3), before any action runs. */
  function closeFromToast(then?: () => void): void {
    const from = focusCameFrom.current;
    if (toastElement.current?.contains(document.activeElement) && from !== null && from.isConnected) from.focus();
    dismiss();
    then?.();
  }

  const toast = shown?.toast;
  return <ToastContext.Provider value={api}>
    {children}
    <div className="kairos-toast-region" role="status" aria-live="polite">
      {toast !== undefined ? <div key={shown!.id} ref={toastElement} className="kairos-toast"
        onPointerEnter={() => setPointerOver(true)} onPointerLeave={() => setPointerOver(false)}
        onFocus={event => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focusCameFrom.current = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
          setFocusInside(true);
        }}
        onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusInside(false); }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeFromToast(); } }}>
        <p className="kairos-toast__message">{toast.message}</p>
        {toast.action !== undefined ? <Button variant="secondary" size="sm" onClick={() => { const action = toast.action!; closeFromToast(action.onAction); }}>{toast.action.label}</Button> : null}
        <Button variant="ghost" size="sm" className="kairos-toast__dismiss" aria-label="Dismiss" onClick={() => closeFromToast()}><Icon name="close" size={16} /></Button>
      </div> : null}
    </div>
  </ToastContext.Provider>;
}

/** Shows or closes the toast; outside a ToastProvider both do nothing, so a screen tested alone still renders. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
