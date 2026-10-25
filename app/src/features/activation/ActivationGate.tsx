import { type FormEvent, type PropsWithChildren, useEffect, useId, useState } from 'react';
import type { ActivationRequest, ActivationSnapshot } from '../../services/activation';
import './activationGate.css';

export interface ActivationGateController {
  bootstrap(): Promise<ActivationSnapshot>;
  activate(
    request: ActivationRequest,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ActivationSnapshot>;
}

export interface ActivationGateProps extends PropsWithChildren {
  readonly controller: ActivationGateController;
  readonly appVersion: string;
  readonly buildId: string;
}

function isActive(snapshot: ActivationSnapshot | null): boolean {
  return snapshot?.status === 'active-online' || snapshot?.status === 'active-offline';
}

export function ActivationGate({
  controller,
  appVersion,
  buildId,
  children,
}: ActivationGateProps) {
  const inputId = useId();
  const feedbackId = `${inputId}-feedback`;
  const [snapshot, setSnapshot] = useState<ActivationSnapshot | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void controller.bootstrap().then((next) => {
      if (active) setSnapshot(next);
    }).catch(() => {
      if (active) {
        setSnapshot({
          status: 'error',
          receipt: null,
          message: 'Activation could not be checked on this device.',
        });
      }
    });
    return () => {
      active = false;
    };
  }, [controller]);

  if (isActive(snapshot)) return <>{children}</>;

  const validating = snapshot?.status === 'validating';
  const message = localError ?? snapshot?.message;

  async function submitActivation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = inviteCode.trim();
    if (!normalizedCode) {
      setLocalError('Enter your invite code to continue.');
      return;
    }

    setLocalError(null);
    const next = await controller.activate({
      inviteCode: normalizedCode,
      appVersion,
      buildId,
    });
    setSnapshot(next);
  }

  return (
    <main className="kairos-activation" data-activation-status={snapshot?.status ?? 'checking'}>
      <section className="kairos-activation__card" aria-labelledby="kairos-activation-title">
        <div className="kairos-activation__brand" aria-hidden="true">K</div>
        <p className="kairos-activation__eyebrow">Kairos Trading Journal</p>
        <h1 id="kairos-activation-title">Activate Kairos</h1>
        <p className="kairos-activation__intro">
          Enter your invite code once. After activation, your journal can open on this device without a connection.
        </p>

        {snapshot === null ? (
          <p className="kairos-activation__status" role="status" aria-live="polite">
            Checking activation…
          </p>
        ) : (
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
              disabled={validating}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={localError ? 'true' : undefined}
              aria-describedby={message ? feedbackId : undefined}
            />

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

            <button type="submit" disabled={validating}>
              {validating ? 'Checking code…' : 'Activate Kairos'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
