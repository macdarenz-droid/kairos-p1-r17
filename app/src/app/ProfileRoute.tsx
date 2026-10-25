import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { PageHeader } from '../design-system/primitives';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import { describeStorageUse, estimateStorageUse, inspectStorageDurability, requestPersistentStorage, subscribeStorageDurabilityStatus, type StorageDurabilityStatus, type StorageUse } from '../pwa/storageDurability';
import { ActivationReceiptRepository, type StoredActivationReceiptLoadResult } from '../services/activation';
import { buildInfo } from '../shared/config/buildInfo';
import { OnlineServicesCheck } from '../features/settings/OnlineServicesCheck';
import { YourDevicesCard, type YourDevicesPort } from '../features/activation/YourDevicesCard';
import { describeActivatedSince } from '../features/activation/activationWords';
import type { KairosApiHealthPort } from '../application/online/onlineWords';
import { loadVisualPnlTimeZone } from '../application/visual-pnl/timeZonePreference';
import './profileRoute.css';

interface ProfileRouteProps {
  readonly db?: KairosDatabase;
  /** The released storage-durability owner; tests inject fakes. */
  readonly durability?: StorageDurabilityPorts;
  /** The Kairos server check (U1), built by the composition root; tests that do not need it leave it out. */
  readonly onlineServices?: KairosApiHealthPort;
  /** T-062f (D283): "Your devices", built in routes.tsx; without it (tests of this card alone, a build that can't check codes) there is no card. */
  readonly devices?: YourDevicesPort;
}

export interface StorageDurabilityPorts {
  readonly inspect: () => Promise<StorageDurabilityStatus>;
  readonly request: () => Promise<StorageDurabilityStatus>;
  readonly subscribe: (listener: (status: StorageDurabilityStatus) => void) => () => void;
  /** T-054d: how much Kairos keeps here, when the browser says; left out where a test does not need it. */
  readonly estimate?: () => Promise<StorageUse | null>;
}

/** A stable default: the released owner's functions, never recreated per render. */
const releasedDurability: StorageDurabilityPorts = Object.freeze({ inspect: inspectStorageDurability, request: requestPersistentStorage, subscribe: subscribeStorageDurabilityStatus, estimate: estimateStorageUse });
type PersistState = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'requesting' }> | Readonly<{ kind: 'declined' }>;

type ActivationState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'error' }> | Readonly<{ kind: 'ready'; stored: StoredActivationReceiptLoadResult; timeZone: string | null }>;
const durabilityText = (status: StorageDurabilityStatus): string => {
  switch (status.state) {
    case 'persistent': return 'This browser has promised to keep Kairos data on this device unless you clear it yourself.';
    case 'best-effort': return 'This browser may clear Kairos data when storage runs low. Ask it to keep your data, and keep a backup.';
    case 'unsupported': return 'This browser cannot promise to keep data on this device. Keep a recent backup.';
    case 'error': return 'Kairos could not check whether this browser keeps data. Keep a recent backup.';
    case 'unknown': return 'Checking whether this browser keeps your data…';
  }
};
/** SPA navigation inside the app, a plain link outside a router (as the Journal's links). */
function ProfileLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/** D283: whether this device is activated, in plain words: never the receipt or its id (jargon, and nothing a trader uses). */
function Activation({ state }: { readonly state: ActivationState }) {
  if (state.kind === 'loading') return <p data-profile-activation="loading">Checking this device…</p>;
  if (state.kind === 'error') return <p role="alert" data-profile-activation="error">Kairos couldn't read this device's invite right now.</p>;
  const { stored } = state;
  if (stored.status === 'missing') return <p data-profile-activation="missing">This device isn't activated.</p>;
  if (stored.status === 'corrupt') return <p role="alert" data-profile-activation="corrupt">Kairos can't read this device's invite. It will ask for your code the next time it opens.</p>;
  return <p data-profile-activation="stored">{describeActivatedSince(stored.receipt.issuedAt, state.timeZone)}</p>;
}

/** Profile: this device (activation, whether the browser keeps the data, the build) and online services. Backups have their own page (T-054a). */
export function ProfileRoute({ db = kairosDatabase, durability = releasedDurability, onlineServices, devices }: ProfileRouteProps) {
  const metadata = useMemo(() => createKairosRepositories(db).metadata, [db]);
  const receipts = useMemo(() => new ActivationReceiptRepository(metadata), [metadata]);
  const [storage, setStorage] = useState<StorageDurabilityStatus>({ state: 'unknown', persistent: false });
  const [persist, setPersist] = useState<PersistState>({ kind: 'idle' });
  const [activation, setActivation] = useState<ActivationState>({ kind: 'loading' });
  const [use, setUse] = useState<StorageUse | null>(null);

  const loadActivation = useCallback(async (ignore: () => boolean) => {
    try {
      // The dates show in the saved time zone, else the phone's (a zone that can't be read counts as none).
      const [stored, timeZone] = await Promise.all([receipts.load(), loadVisualPnlTimeZone(db).catch(() => null)]);
      if (!ignore()) setActivation({ kind: 'ready', stored, timeZone });
    } catch {
      if (!ignore()) setActivation({ kind: 'error' });
    }
  }, [receipts, db]);

  useEffect(() => {
    let ignored = false;
    void loadActivation(() => ignored);
    return () => { ignored = true; };
  }, [loadActivation]);

  useEffect(() => {
    const unsubscribe = durability.subscribe(status => setStorage(status));
    void durability.inspect().catch(() => {});
    let ignore = false;
    durability.estimate?.().then(estimate => { if (!ignore) setUse(estimate); }, () => undefined);
    return () => { ignore = true; unsubscribe(); };
  }, [durability]);

  async function handlePersist(): Promise<void> {
    if (persist.kind === 'requesting') return;
    setPersist({ kind: 'requesting' });
    try {
      const status = await durability.request();
      setStorage(status);
      setPersist(status.persistent ? { kind: 'idle' } : { kind: 'declined' });
    } catch {
      setPersist({ kind: 'declined' });
    }
  }

  return <section className="kairos-route kairos-profile" aria-labelledby="kairos-profile-title">
    <PageHeader eyebrow="Your data" title="Profile" titleId="kairos-profile-title" />

    <article className="kairos-profile-card" aria-labelledby="kairos-profile-device-title">
      <h2 id="kairos-profile-device-title">This device</h2>
      <Activation state={activation} />
      <p>Save a copy of your journal, or bring one back, in <ProfileLink to="/backup">Backup and restore</ProfileLink>.</p>
      <p data-profile-storage={storage.state}>{durabilityText(storage)}</p>
      {use !== null ? <p className="kairos-profile__note" data-profile-storage-use="">{describeStorageUse(use)}</p> : null}
      {storage.state === 'best-effort' ? <div className="kairos-profile-card__actions"><button type="button" className="kairos-profile-button--secondary" onClick={() => { void handlePersist(); }} disabled={persist.kind === 'requesting'}>{persist.kind === 'requesting' ? 'Asking…' : 'Keep my data on this device'}</button></div> : null}
      {persist.kind === 'declined' ? <p className="kairos-profile__note" role="status">The browser did not grant persistent storage this time. Keep a recent backup.</p> : null}
      <p className="kairos-profile__note">Kairos {buildInfo.appVersion} · build {buildInfo.buildId}. Everything you record stays on this device unless you back it up.</p>
      {onlineServices ? <OnlineServicesCheck port={onlineServices} /> : null}
    </article>

    {/* After the time zone is read, so its dates show once, in the right zone. */}
    {devices && activation.kind !== 'loading' ? <YourDevicesCard className="kairos-profile-card" port={devices} timeZone={activation.kind === 'ready' ? activation.timeZone : null} /> : null}

  </section>;
}
