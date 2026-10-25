import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, ConfirmDialog, ErrorState } from '../../design-system/primitives';
import type {
  ActivationDevice,
  ActivationDeviceList,
  ActivationDeviceRemoveResult,
  ActivationDevicesAdapter,
  ActivationEnded,
} from '../../services/activation';
import {
  describeDeviceDetails,
  describeDevicesEnded,
  describeDevicesUsed,
  describeRemoveFailed,
  describeRemoveQuestion,
  YOUR_DEVICES_WORDS,
} from './activationWords';
import './yourDevices.css';

/**
 * What the card asks, built in `app/routes.tsx`: this device's token from its stored receipt, and the activation
 * Worker's /devices and /devices/remove. The card never reads storage or the network itself.
 */
export interface YourDevicesPort {
  /** This device's token (kairosDeviceToken), or null when no usable receipt is stored. Throws when storage can't be read. */
  readonly readToken: () => Promise<string | null>;
  readonly listDevices: ActivationDevicesAdapter['listDevices'];
  readonly removeDevice: ActivationDevicesAdapter['removeDevice'];
}

export interface YourDevicesCardProps {
  readonly port: YourDevicesPort;
  /** The saved time zone "since" is shown in; null: the phone's. */
  readonly timeZone: string | null;
  /** The card's box, from the screen it sits on (Profile's card look). */
  readonly className?: string;
  /** Today, for "last used today" and the year; tests pass a fixed one. */
  readonly now?: () => Date;
}

type View =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'list'; list: ActivationDeviceList }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'not-activated' }>
  | Readonly<{ kind: 'ended'; ended: ActivationEnded }>;

const UNAVAILABLE: View = Object.freeze({ kind: 'unavailable' });
const NOT_ACTIVATED: View = Object.freeze({ kind: 'not-activated' });
const endedView = (ended: ActivationEnded): View => Object.freeze({ kind: 'ended', ended });

/** One read: no receipt is "not activated", the server's own "this device is out" is said, anything else is unavailable. */
async function readDevices(port: YourDevicesPort, signal: AbortSignal): Promise<View> {
  let token: string | null;
  try {
    token = await port.readToken();
  } catch {
    return UNAVAILABLE;
  }
  if (token === null) return NOT_ACTIVATED;
  const result = await port.listDevices(token, { signal }).catch(() => null);
  if (result === null) return UNAVAILABLE;
  if (result.ok) return Object.freeze({ kind: 'list', list: result.list });
  if (result.reason === 'device-removed') return endedView('removed');
  if (result.reason === 'code-revoked') return endedView('revoked');
  return UNAVAILABLE;
}

const removeFailed: ActivationDeviceRemoveResult = Object.freeze({ ok: false, reason: 'service-error' });

/** Whether focus has fallen to the page (the focused control went away). */
const focusLost = (): boolean => {
  const active = document.activeElement;
  return active === null || active === document.body || !active.isConnected;
};

function DeviceRow({ device, now, timeZone, onRemove }: { readonly device: ActivationDevice; readonly now: Date; readonly timeZone: string | null; readonly onRemove: (device: ActivationDevice) => void }) {
  const nameId = useId();
  const detailsId = useId();
  return (
    <li className="kairos-your-devices__row" data-this-device={device.thisDevice ? '' : undefined}>
      <span className="kairos-your-devices__text">
        <span id={nameId} className="kairos-your-devices__name">{device.label}</span>
        <span id={detailsId} className="kairos-your-devices__details">{describeDeviceDetails(device, now, timeZone)}</span>
      </span>
      {device.thisDevice
        ? <span className="kairos-your-devices__this">{YOUR_DEVICES_WORDS.thisDevice}</span>
        : <Button variant="secondary" size="sm" aria-describedby={`${nameId} ${detailsId}`} onClick={() => onRemove(device)}>{YOUR_DEVICES_WORDS.remove}</Button>}
    </li>
  );
}

/**
 * T-062f (D283): "Your devices" on Profile. It reads when Profile opens: "This code is used on 2 of 3 devices.", one row
 * per device (name, since, last used, and "This device" or "Remove"). Remove asks first, then the list reads again.
 * Offline or failed: "Your devices are unavailable right now." with "Try again". The count is the Worker's (D274); one
 * Kairos doesn't know is never shown, least of all as 0. When an answer takes away the focused control, focus goes to
 * the count (or the card), never to the page.
 */
export function YourDevicesCard({ port, timeZone, className, now = () => new Date() }: YourDevicesCardProps) {
  const titleId = useId();
  const [view, setView] = useState<View>({ kind: 'reading' });
  const [reading, setReading] = useState(true);
  const [confirming, setConfirming] = useState<ActivationDevice | null>(null);
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const card = useRef<HTMLElement>(null);
  const summary = useRef<HTMLParagraphElement>(null);
  const running = useRef<AbortController | null>(null);
  const keepFocus = useRef(false);

  const read = useCallback(async (): Promise<void> => {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setReading(true);
    const next = await readDevices(port, controller.signal);
    if (controller.signal.aborted) return;
    running.current = null;
    setView(next);
    setReading(false);
  }, [port]);

  useEffect(() => {
    void read();
    return () => running.current?.abort();
  }, [read]);

  useLayoutEffect(() => {
    if (reading || !keepFocus.current) return;
    keepFocus.current = false;
    if (focusLost()) (summary.current ?? card.current?.querySelector<HTMLElement>('button') ?? card.current)?.focus({ preventScroll: true });
  }, [reading, view]);

  function tryAgain(): void {
    keepFocus.current = true;
    void read();
  }

  async function remove(device: ActivationDevice): Promise<void> {
    if (removing) return;
    setRemoving(true);
    setProblem(null);
    // null: no receipt any more (this device's invite ended meanwhile); a storage that can't be read is a failed removal.
    const token = await port.readToken().catch((): undefined => undefined);
    const result = token === null ? null : token === undefined ? removeFailed : await port.removeDevice(token, device.id).catch(() => removeFailed);
    setRemoving(false);
    // The dialog closes and hands focus back to this Remove button; the answer may take that button away.
    setConfirming(null);
    if (result !== null && !result.ok && result.reason !== 'device-not-found' && result.reason !== 'device-removed' && result.reason !== 'code-revoked') {
      setProblem(describeRemoveFailed(device.label));
      return;
    }
    keepFocus.current = true;
    if (result === null) setView(NOT_ACTIVATED);
    else if (!result.ok && result.reason === 'device-removed') setView(endedView('removed'));
    else if (!result.ok && result.reason === 'code-revoked') setView(endedView('revoked'));
    // Removed, or gone already ("device-not-found": not on this code any more): the list says what is left.
    else await read();
  }

  const today = now();
  const question = confirming === null ? null : describeRemoveQuestion(confirming.label);
  return (
    <article ref={card} tabIndex={-1} className={['kairos-your-devices', className].filter(Boolean).join(' ')} aria-labelledby={titleId} data-your-devices={view.kind}>
      <h2 id={titleId}>{YOUR_DEVICES_WORDS.title}</h2>
      {view.kind === 'reading' ? <p role="status">{YOUR_DEVICES_WORDS.reading}</p> : null}
      {view.kind === 'unavailable'
        ? <ErrorState tone="unavailable" className="kairos-unavailable" message={YOUR_DEVICES_WORDS.unavailable} retryLabel="Try again" onRetry={tryAgain} busy={reading} />
        : null}
      {view.kind === 'not-activated' ? <p>{YOUR_DEVICES_WORDS.notActivated}</p> : null}
      {view.kind === 'ended' ? <p>{describeDevicesEnded(view.ended)}</p> : null}
      {view.kind === 'list' ? (
        <>
          <p ref={summary} tabIndex={-1} className="kairos-your-devices__used">{describeDevicesUsed(view.list)}</p>
          <ul className="kairos-your-devices__list">
            {view.list.devices.map((device) => (
              <DeviceRow key={device.id} device={device} now={today} timeZone={timeZone} onRemove={(chosen) => { setProblem(null); setConfirming(chosen); }} />
            ))}
          </ul>
        </>
      ) : null}
      {problem === null ? null : <p role="alert" className="kairos-your-devices__problem">{problem}</p>}
      <ConfirmDialog
        open={question !== null}
        tone="danger"
        busy={removing}
        title={question?.title ?? ''}
        message={question?.message ?? ''}
        confirmLabel={YOUR_DEVICES_WORDS.remove}
        cancelLabel={YOUR_DEVICES_WORDS.keep}
        onConfirm={() => { if (confirming !== null) void remove(confirming); }}
        onCancel={() => setConfirming(null)}
      />
    </article>
  );
}
