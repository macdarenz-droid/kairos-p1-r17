import { type FormEvent, type PropsWithChildren, useEffect, useId, useState } from 'react';
import { describeDataCopy, type RunBackupResult } from '../../application/backup';
import { Button } from '../../design-system/primitives';
import type { ActivationRequest, ActivationSnapshot } from '../../services/activation';
import {
  describeActivationProblem,
  describeJournalOnThisDevice,
  hasJournal,
  lostAccessSteps,
  type JournalOnThisDevice,
} from './activationWords';
import './activationGate.css';

export interface ActivationGateController {
  bootstrap(): Promise<ActivationSnapshot>;
  activate(
    request: ActivationRequest,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ActivationSnapshot>;
}

/** This device's journal, for the invite screen (D281). main.tsx builds it, so the gate never opens the database itself. */
export interface ActivationJournalPort {
  /** The last backup and the trades since it (loadBackupReminder), with the time zone its date is shown in. */
  load(): Promise<JournalOnThisDevice>;
  /** "Download a copy of my data": a backup handed over as a download only, as on the crash screen (D230). */
  downloadCopy(): Promise<RunBackupResult>;
}

export interface ActivationGateProps extends PropsWithChildren {
  readonly controller: ActivationGateController;
  readonly appVersion: string;
  readonly buildId: string;
  /** Without it the gate offers no copy (tests of the code form alone). */
  readonly journal?: ActivationJournalPort;
}

/** D282: the app icon, which the service worker keeps for offline use (index.html links it). Decorative: the heading names the screen. */
export function ActivationLogo() {
  return <img className="kairos-activation__logo" src="/icons/kairos-icon-192.png" alt="" width="96" height="96" />;
}

function isActive(snapshot: ActivationSnapshot | null): boolean {
  return snapshot?.status === 'active-online' || snapshot?.status === 'active-offline';
}

type Copy = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'busy' }> | Readonly<{ kind: 'done'; message: string; failed: boolean }>;

/**
 * D281: never lock a journal away. When this device holds a journal (trades, or a backup made here), the gate says so
 * and offers a copy as a download, with the crash screen's words. Nothing shows while it reads, or if it can't read.
 */
function JournalCopy({ journal }: { readonly journal: ActivationJournalPort }) {
  const [summary, setSummary] = useState<JournalOnThisDevice | null>(null);
  const [copy, setCopy] = useState<Copy>({ kind: 'idle' });
  // A copy is also a backup: reading again moves "Last backup" to now.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    journal.load().then(
      (next) => { if (active) setSummary(next); },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [journal, revision]);

  if (summary === null || !hasJournal(summary)) return null;

  async function downloadCopy(): Promise<void> {
    if (copy.kind === 'busy') return;
    setCopy({ kind: 'busy' });
    const result = await journal.downloadCopy().catch((): RunBackupResult => ({ ok: false, reason: 'delivery-failed' }));
    setCopy({ kind: 'done', ...describeDataCopy(result) });
    setRevision((value) => value + 1);
  }

  return (
    <div className="kairos-activation__journal">
      <p>{describeJournalOnThisDevice(summary)}</p>
      {/* aria-disabled, not disabled, so the button keeps focus while the copy is made. */}
      <Button variant="secondary" onClick={() => { void downloadCopy(); }} aria-disabled={copy.kind === 'busy' || undefined}>
        {copy.kind === 'busy' ? 'Making a copy…' : 'Download a copy of my data'}
      </Button>
      {copy.kind === 'done' ? <p role="status" className={copy.failed ? 'kairos-activation__problem' : undefined}>{copy.message}</p> : null}
    </div>
  );
}

/** "Lost access? Here's what to do" (D281): four steps behind a button; it opens by itself when all devices are used. */
function LostAccess({ open, onToggle, deviceLimit }: { readonly open: boolean; readonly onToggle: () => void; readonly deviceLimit: number | undefined }) {
  const stepsId = useId();
  return (
    <div className="kairos-activation__help">
      <Button variant="ghost" size="sm" aria-expanded={open} aria-controls={stepsId} onClick={onToggle}>
        Lost access? Here's what to do
      </Button>
      <ol id={stepsId} className="kairos-activation__steps" hidden={!open}>
        {lostAccessSteps(deviceLimit).map((step) => <li key={step}>{step}</li>)}
      </ol>
    </div>
  );
}

export function ActivationGate({
  controller,
  appVersion,
  buildId,
  journal,
  children,
}: ActivationGateProps) {
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const hintId = `${inputId}-hint`;
  const [snapshot, setSnapshot] = useState<ActivationSnapshot | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void controller.bootstrap().then((next) => {
      if (active) setSnapshot(next);
    }).catch(() => {
      if (active) {
        setSnapshot({
          status: 'error',
          receipt: null,
          message: "Kairos couldn't read this device's invite. Close Kairos and open it again.",
        });
      }
    });
    return () => {
      active = false;
    };
  }, [controller]);

  if (isActive(snapshot)) return <>{children}</>;

  const busy = checking || snapshot?.status === 'validating';
  // The last answer's words give way while a new try is checked; the next answer brings its own.
  const message = localError ?? (snapshot === null || busy ? null : describeActivationProblem(snapshot));

  async function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const normalizedCode = inviteCode.trim();
    if (!normalizedCode) {
      setLocalError('Enter your invite code to continue.');
      return;
    }

    setLocalError(null);
    setChecking(true);
    // The coordinator answers every failure with a snapshot; anything it throws reads as "couldn't check right now".
    const next = await controller.activate({
      inviteCode: normalizedCode,
      appVersion,
      buildId,
    }).catch((): ActivationSnapshot => ({ status: 'error', receipt: null, message: null, reason: 'service-error' }));
    setChecking(false);
    setSnapshot(next);
    // D281: a code used on all its devices opens the steps by itself.
    if (next.reason === 'already-used') setHelpOpen(true);
  }

  return (
    <main className="kairos-activation" data-activation-status={snapshot?.status ?? 'checking'}>
      <section className="kairos-activation__card" aria-labelledby="kairos-activation-title">
        <ActivationLogo />
        <h1 id="kairos-activation-title">Welcome to Kairos</h1>
        <p className="kairos-activation__intro">
          Type your invite code once. After that, Kairos opens on this device even without internet.
        </p>

        {snapshot === null ? (
          <p className="kairos-activation__status" role="status" aria-live="polite">
            Checking activation…
          </p>
        ) : (
          <>
            <form className="kairos-activation__form" onSubmit={submitActivation} noValidate>
              <label htmlFor={inputId}>Invite code</label>
              <input
                id={inputId}
                name="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(event) => {
                  setInviteCode(event.target.value);
                  if (localError) setLocalError(null);
                }}
                required
                readOnly={busy}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={localError ? 'true' : undefined}
                aria-describedby={message ? `${hintId} ${feedbackId}` : hintId}
              />
              <p id={hintId} className="kairos-activation__hint">
                Kairos is invite-only for now. Your code comes from the person who invited you.
              </p>

              {message ? (
                <p
                  id={feedbackId}
                  className="kairos-activation__feedback"
                  role={localError || snapshot.status === 'rejected' || snapshot.status === 'error' ? 'alert' : 'status'}
                  aria-live="polite"
                >
                  {message}
                </p>
              ) : null}

              {/* aria-disabled, not disabled, so focus stays on the button while the code is checked. */}
              <button type="submit" className="kairos-activation__submit" aria-disabled={busy || undefined}>
                {busy ? 'Checking code…' : 'Activate Kairos'}
              </button>
            </form>

            <LostAccess open={helpOpen} onToggle={() => setHelpOpen((open) => !open)} deviceLimit={snapshot.deviceLimit} />
            {journal ? <JournalCopy journal={journal} /> : null}
          </>
        )}
      </section>
    </main>
  );
}
