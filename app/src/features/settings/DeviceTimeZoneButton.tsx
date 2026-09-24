import { useState } from 'react';
import { writeVisualPnlTimeZonePreference } from '../../application/visual-pnl';
import type { MetadataRepository } from '../../data/repositories';

/** The device's own IANA time zone, or null when the browser does not report one. */
export function readDeviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.trim() !== '' ? zone : null;
  } catch {
    return null;
  }
}

/**
 * One tap saves this device's time zone as the daily-results time zone.
 * Nothing is saved without the tap; the host reloads through `onSaved`.
 */
export function DeviceTimeZoneButton({ metadata, onSaved }: {
  readonly metadata: MetadataRepository;
  readonly onSaved: (timeZone: string) => void;
}) {
  const [zone] = useState(readDeviceTimeZone);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  if (zone === null) return null;

  async function save(timeZone: string): Promise<void> {
    setStatus('saving');
    try {
      const result = await writeVisualPnlTimeZonePreference(metadata, timeZone, new Date().toISOString());
      if (!result.ok) { setStatus('error'); return; }
      setStatus('idle');
      onSaved(result.timeZone);
    } catch {
      setStatus('error');
    }
  }

  return <span className="kairos-device-time-zone">
    <button type="button" onClick={() => { void save(zone); }} disabled={status === 'saving'}>Use {zone} (this device)</button>
    {status === 'error' ? <small role="alert">Kairos could not save this time zone. Nothing was changed.</small> : null}
  </span>;
}
