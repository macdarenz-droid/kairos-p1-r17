import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  readVisualPnlTimeZonePreference,
  writeVisualPnlTimeZonePreference,
} from '../application/visual-pnl';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import './settingsRoute.css';

interface SettingsRouteProps {
  readonly db?: KairosDatabase;
}

type Feedback =
  | Readonly<{ kind: 'success'; message: string }>
  | Readonly<{ kind: 'error'; message: string }>
  | null;

/**
 * First explicit Visual P&L timezone control.
 *
 * The user supplies an IANA timezone identifier. Validation and persistence are
 * delegated to the P13.10R1 application contract and MetadataRepository.
 * This route never infers browser/device timezone.
 */
export function SettingsRoute({ db = kairosDatabase }: SettingsRouteProps) {
  const repositories = useMemo(() => createKairosRepositories(db), [db]);
  const [timeZone, setTimeZone] = useState('');
  const [savedTimeZone, setSavedTimeZone] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let ignore = false;
    async function load(): Promise<void> {
      try {
        const stored = await readVisualPnlTimeZonePreference(repositories.metadata);
        if (ignore) return;
        setSavedTimeZone(stored);
        setTimeZone(stored ?? '');
      } catch {
        if (!ignore) setFeedback({ kind: 'error', message: 'Kairos could not load your daily-results time zone.' });
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    void load();
    return () => { ignore = true; };
  }, [repositories]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) return;
    setFeedback(null);
    setIsSaving(true);

    try {
      const result = await writeVisualPnlTimeZonePreference(
        repositories.metadata,
        timeZone,
        new Date().toISOString(),
      );
      if (!result.ok) {
        setFeedback({ kind: 'error', message: 'Enter a valid time zone, such as Australia/Sydney or UTC.' });
        return;
      }
      setSavedTimeZone(result.timeZone);
      setFeedback({ kind: 'success', message: 'Daily-results time zone saved.' });
    } catch {
      setFeedback({ kind: 'error', message: 'Kairos could not save your time zone. Your stored setting was not changed.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="kairos-route kairos-settings" aria-labelledby="kairos-settings-title">
      <div className="kairos-settings__heading">
        <div>
          <p className="kairos-settings__eyebrow">Preferences</p>
          <h1 id="kairos-settings-title">Settings</h1>
        </div>
      </div>

      <form className="kairos-settings-card" onSubmit={handleSubmit} noValidate>
        <div>
          <h2>Daily results time zone</h2>
          <p>Choose which calendar day Kairos should use when grouping closed trades. Kairos will not guess this setting from your device.</p>
        </div>

        <label className="kairos-settings-field" htmlFor="kairos-daily-results-time-zone">
          <span>Time zone</span>
          <input
            id="kairos-daily-results-time-zone"
            name="timeZone"
            value={timeZone}
            onChange={(event) => { setTimeZone(event.target.value); setFeedback(null); }}
            placeholder="Australia/Sydney"
            autoComplete="off"
            spellCheck={false}
            disabled={isLoading || isSaving}
          />
          <small>Use an IANA time zone, for example Australia/Sydney, America/New_York, Europe/London, or UTC.</small>
        </label>

        <div className="kairos-settings-card__actions">
          <button type="submit" disabled={isLoading || isSaving}>
            {isSaving ? 'Saving…' : 'Save time zone'}
          </button>
          <span>{savedTimeZone === null ? 'Not configured' : `Current: ${savedTimeZone}`}</span>
        </div>

        {feedback ? (
          <p className={`kairos-settings-card__feedback kairos-settings-card__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
            {feedback.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
