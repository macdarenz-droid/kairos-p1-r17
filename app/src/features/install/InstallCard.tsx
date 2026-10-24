import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { hideInstallCard, loadInstallCardHidden } from '../../application/setup/deviceKeeping';
import type { KairosDatabase } from '../../data/database';
import { Icon, type IconName } from '../../design-system/icons/Icon';
import { Button, Card } from '../../design-system/primitives';
import { browserInstall, type InstallPort } from '../../pwa/installPrompt';
import './install.css';

/** The iPhone and iPad Home Screen guide, one picture per step. */
const GUIDE: ReadonlyArray<Readonly<{ icon: IconName; words: string }>> = Object.freeze([
  { icon: 'share', words: 'Tap Share.' },
  { icon: 'plus', words: 'Choose "Add to Home Screen".' },
  { icon: 'home', words: 'Tap "Add". Kairos is now on your Home Screen.' },
]);

/**
 * T-054c (D228): Home's install help, while Kairos is not installed and the trader has not chosen "Not now". Where the
 * browser offers its install prompt, "Install" shows it; on iPhone and iPad Safari a three-step picture guide shows
 * instead. When the card goes, the host moves focus on (`onHidden`).
 */
export function InstallCard({ db, now, install = browserInstall, onHidden }: {
  readonly db: KairosDatabase;
  readonly now?: () => string;
  readonly install?: InstallPort;
  readonly onHidden: () => void;
}) {
  const titleId = useId();
  const card = useRef<HTMLDivElement>(null);
  const state = useSyncExternalStore(install.subscribe, install.getState, install.getState);
  // null while the "Not now" flag is read, so the card never flashes for a trader who hid it.
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let ignore = false;
    loadInstallCardHidden(db).then(value => { if (!ignore) setHidden(value); }, () => undefined);
    return () => { ignore = true; };
  }, [db]);

  /** Moves focus on when the card is going and focus was in it (or already fell to the page). */
  const leave = () => {
    const active = document.activeElement;
    if (active === null || active === document.body || card.current?.contains(active)) onHidden();
  };

  async function notNow(): Promise<void> {
    if (busy) return;
    setBusy(true);
    const result = await hideInstallCard(db, { now });
    setBusy(false);
    if (!result.ok) { setFailed(true); return; }
    leave();
    setHidden(true);
  }

  async function installNow(): Promise<void> {
    if (busy) return;
    setBusy(true);
    // The browser's prompt shows once: after it the card goes whatever the answer (installed, or no longer offered).
    await install.prompt();
    setBusy(false);
    leave();
  }

  if (hidden !== false || (state !== 'can-prompt' && state !== 'ios-guide')) return null;
  const guide = state === 'ios-guide';
  return <div ref={card}><Card as="section" className="kairos-install" aria-labelledby={titleId}>
    <div className="kairos-install__heading">
      <Icon name={guide ? 'share' : 'plus'} size={24} className="kairos-install__icon" />
      <h2 id={titleId}>{guide ? 'Add Kairos to your Home Screen' : 'Install Kairos'}</h2>
    </div>
    <p>{guide ? "Safari can clear the data of sites you don't add." : 'It opens like an app, works offline, and keeps your journal safer.'}</p>
    {guide ? <ol className="kairos-install__guide" aria-label="How to add Kairos">
      {GUIDE.map((step, index) => <li key={step.icon}>
        <span className="kairos-install__number" aria-hidden="true">{index + 1}</span>
        <span className="kairos-install__picture"><Icon name={step.icon} size={24} /></span>
        <span>{step.words}</span>
      </li>)}
    </ol> : null}
    {failed ? <p role="alert" className="kairos-install__problem">Kairos could not save "Not now". Nothing was changed; press it again to try once more.</p> : null}
    <div className="kairos-install__actions">
      {guide ? null : <Button onClick={() => { void installNow(); }} aria-disabled={busy || undefined}>Install</Button>}
      <Button variant={guide ? 'secondary' : 'ghost'} onClick={() => { void notNow(); }} aria-disabled={busy || undefined}>Not now</Button>
    </div>
  </Card></div>;
}
