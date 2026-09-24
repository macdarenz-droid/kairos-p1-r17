import { useEffect, useMemo, useState } from 'react';
import { listJournalVisualPnlDailySummary } from '../application/journal';
import {
  projectVisualPnlDailyStreak,
  projectVisualPnlProgressSeries,
  projectVisualPnlCumulativeRealizedPnl,
  summarizeVisualPnlDailyPerformance,
  readVisualPnlTimeZonePreference,
  type VisualPnlDailySummaryProjection,
} from '../application/visual-pnl';
import type { KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import { VisualPnlCalendar } from './VisualPnlCalendar';
import { VisualPnlStreak } from './VisualPnlStreak';
import { VisualPnlPerformanceSummary } from './VisualPnlPerformanceSummary';
import { VisualPnlCumulativeProgress } from './VisualPnlCumulativeProgress';
import { DeviceTimeZoneButton } from '../features/settings/DeviceTimeZoneButton';

interface JournalDailyResultsProps {
  readonly db: KairosDatabase;
  readonly refreshRevision: number;
}

type JournalDailyResultsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unconfigured' }>
  | Readonly<{ kind: 'ready'; timeZone: string; projection: VisualPnlDailySummaryProjection }>
  | Readonly<{ kind: 'error' }>;

/**
 * P13-owned Journal child surface.
 *
 * This boundary coordinates established P13 owners only:
 * MetadataRepository -> explicit timezone preference -> bounded Journal daily
 * query -> VisualPnlCalendar. It performs no financial arithmetic, FX,
 * day grouping, timezone inference, or direct storage access.
 */
export function JournalDailyResults({ db, refreshRevision }: JournalDailyResultsProps) {
  const [state, setState] = useState<JournalDailyResultsState>({ kind: 'loading' });
  const repositories = useMemo(() => createKairosRepositories(db), [db]);
  const [localRevision, setLocalRevision] = useState(0);

  useEffect(() => {
    let ignore = false;

    async function load(): Promise<void> {
      setState({ kind: 'loading' });
      try {
        const timeZone = await readVisualPnlTimeZonePreference(repositories.metadata);
        if (ignore) return;

        if (timeZone === null) {
          setState({ kind: 'unconfigured' });
          return;
        }

        const projection = await listJournalVisualPnlDailySummary(db, timeZone);
        if (ignore) return;
        setState({ kind: 'ready', timeZone, projection });
      } catch {
        if (!ignore) setState({ kind: 'error' });
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [db, repositories, refreshRevision, localRevision]);

  if (state.kind === 'ready') {
    return (
      <div data-visual-pnl-time-zone={state.timeZone}>
        <VisualPnlStreak projection={projectVisualPnlDailyStreak(state.projection.days)} />
        <VisualPnlPerformanceSummary summary={summarizeVisualPnlDailyPerformance(state.projection.days)} />
        <VisualPnlCumulativeProgress projection={projectVisualPnlCumulativeRealizedPnl(projectVisualPnlProgressSeries(state.projection.days))} />
        <VisualPnlCalendar projection={state.projection} />
        <p className="kairos-pnl-calendar__notice">Time zone: {state.timeZone}</p>
      </div>
    );
  }

  return (
    <section className="kairos-pnl-calendar" aria-labelledby="kairos-pnl-calendar-title">
      <div className="kairos-pnl-calendar__heading">
        <div>
          <p className="kairos-journal__eyebrow">Visual P&amp;L</p>
          <h2 id="kairos-pnl-calendar-title">Daily results</h2>
        </div>
      </div>
      <p className="kairos-pnl-calendar__state">
        {state.kind === 'loading'
          ? 'Loading daily results…'
          : state.kind === 'unconfigured'
            ? 'Choose a time zone in Settings to view daily results.'
            : 'Kairos could not load daily results. Your stored trades were not changed.'}
      </p>
      {state.kind === 'unconfigured' ? <DeviceTimeZoneButton metadata={repositories.metadata} onSaved={() => setLocalRevision(value => value + 1)} /> : null}
    </section>
  );
}
