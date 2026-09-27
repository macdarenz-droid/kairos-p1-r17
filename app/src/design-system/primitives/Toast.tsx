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
  const [paused, setPaused] = useState(false);
  const nextId = useRef(0);
  const dismiss = useCallback(() => { setShown(null); setPaused(false); }, []);
  const show = useCallback((toast: ToastInput) => { nextId.current += 1; setShown({ id: nextId.current, toast }); setPaused(false); }, []);
  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  useEffect(() => {
    if (shown === null || paused) return;
    const timer = window.setTimeout(dismiss, shown.toast.action ? TOAST_WITH_ACTION_MS : TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [shown, paused, dismiss]);

  const toast = shown?.toast;
  return <ToastContext.Provider value={api}>
    {children}
    <div className="kairos-toast-region" role="status" aria-live="polite">
      {toast !== undefined ? <div key={shown!.id} className="kairos-toast"
        onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false); }}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); dismiss(); } }}>
        <p className="kairos-toast__message">{toast.message}</p>
        {toast.action !== undefined ? <Button variant="secondary" size="sm" onClick={() => { const action = toast.action!; dismiss(); action.onAction(); }}>{toast.action.label}</Button> : null}
        <Button variant="ghost" size="sm" className="kairos-toast__dismiss" aria-label="Dismiss" onClick={dismiss}><Icon name="close" size={16} /></Button>
      </div> : null}
    </div>
  </ToastContext.Provider>;
}

/** Shows or closes the toast; outside a ToastProvider both do nothing, so a screen tested alone still renders. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}
