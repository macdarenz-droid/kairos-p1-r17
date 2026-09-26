import { useEffect, useRef, useState } from 'react';
import { describeOnlineServices, type KairosApiHealthPort, type OnlineServicesLine } from '../../application/online/onlineWords';
import { Button, UnavailableNotice } from '../../design-system/primitives';
import './onlineServicesCheck.css';

/**
 * U1: a line on Profile that asks the Kairos server whether it is working, only when the trader taps. Nothing is saved.
 * While it checks, the last answer stays and the tapped button keeps its place and its name, busy. When the answer
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

  if (!port.setUp) return <p className="kairos-online-services" data-online-services="not-set-up">Online services: not set up in this version of Kairos.</p>;

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
  return <div ref={block} tabIndex={-1} className="kairos-online-services" data-online-services={checking ? 'checking' : line?.kind ?? 'idle'}>
    {checking ? <p role="status">Checking online services…</p> : null}
    {line?.kind === 'working' ? <p role="status">{line.text}</p> : null}
    {line?.kind === 'unavailable'
      ? <UnavailableNotice message={line.words.message} retryLabel={line.words.retryLabel} onRetry={onTap} busy={checking} />
      : <Button variant="secondary" size="sm" busy={checking} onClick={onTap}>{line === null ? 'Check online services' : 'Check again'}</Button>}
  </div>;
}
