import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { describeOnlineServices, describeUnavailable, type KairosApiHealthPort, type OnlineServicesLine } from '../../application/online/onlineWords';
import { Button, UnavailableNotice } from '../../design-system/primitives';
import './onlineServicesCheck.css';

const NOT_SET_UP = describeUnavailable({ ok: false, reason: 'not-set-up' }, 'Online services');
/** Heard by a screen reader, not shown: the status line while it is empty or while the Unavailable box shows its sentence. */
const SPOKEN_ONLY: CSSProperties = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap', border: 0 };

/**
 * U1: a line on Profile that asks the Kairos server whether it is working, only when the trader taps. Nothing is saved.
 * While it checks, the status line says so, an Unavailable box stays, and the tapped button keeps its place and its name, busy. When the answer
 * removes that button (the Unavailable box's "Try again" and "Check again" swap), focus goes to the new button, or to
 * the line itself when the answer has none, so it never falls to the page.
 */
export function OnlineServicesCheck({ port }: { readonly port: KairosApiHealthPort }) {
  const [line, setLine] = useState<OnlineServicesLine | null>(null);
  const [checking, setChecking] = useState(false);
  const running = useRef<AbortController | null>(null);
  const answered = useRef(false);
  const block = useRef<HTMLDivElement>(null);
  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => {
    if (checking || !answered.current) return;
    answered.current = false;
    const active = document.activeElement;
    const focusLost = active === null || active === document.body || !active.isConnected;
    if (focusLost && block.current !== null) (block.current.querySelector('button') ?? block.current).focus();
  }, [checking, line]);

  if (!port.setUp) return <p className="kairos-online-services" data-online-services="not-set-up">{NOT_SET_UP.message}</p>;

  async function check(): Promise<void> {
    if (running.current !== null) return;
    const controller = new AbortController();
    running.current = controller;
    setChecking(true);
    const result = await port.checkHealth({ signal: controller.signal });
    if (controller.signal.aborted) return;
    running.current = null;
    answered.current = true;
    setLine(describeOnlineServices(result));
    setChecking(false);
  }

  const onTap = () => { void check(); };
  // One status line from the first render, so every answer is heard, even one the same as the last: it says "Checking…"
  // in between. The Unavailable box shows that answer on screen and is not a second live region; the status line is then
  // spoken only (as it is while still empty), so the sentence is not shown twice.
  const status = checking ? 'Checking online services…' : line?.kind === 'working' ? line.text : line?.kind === 'unavailable' ? `Unavailable · ${line.words.message}` : '';
  return <div ref={block} tabIndex={-1} className="kairos-online-services" data-online-services={checking ? 'checking' : line?.kind ?? 'idle'}>
    <p role="status" style={status === '' || (line?.kind === 'unavailable' && !checking) ? SPOKEN_ONLY : undefined}>{status}</p>
    {line?.kind === 'unavailable'
      ? <UnavailableNotice message={line.words.message} retryLabel={line.words.retryLabel} onRetry={onTap} busy={checking} live={false} />
      : <Button variant="secondary" size="sm" busy={checking} onClick={onTap}>{line === null ? 'Check online services' : 'Check again'}</Button>}
  </div>;
}
