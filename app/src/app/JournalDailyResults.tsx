import { useEffect, useMemo, useRef, useState } from 'react';
import { listJournalClosedTradesInPeriod, listJournalVisualPnlDailySummary } from '../application/journal';
import {
  projectVisualPnlDailyStreak,
  projectVisualPnlProgressSeries,
  projectVisualPnlCumulativeRealizedPnl,
  summarizeVisualPnlDailyPerformance,
  readVisualPnlTimeZonePreference,
  projectVisualPnlDayKey,
  projectVisualPnlMonthGrid,
  projectVisualPnlResultLine,
  shiftVisualPnlDayKey,
  type VisualPnlDailySummaryProjection,
} from '../application/visual-pnl';
import type { KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import { VisualPnlStreak } from './VisualPnlStreak';
import { VisualPnlPerformanceSummary } from './VisualPnlPerformanceSummary';
import { DeviceTimeZoneButton } from '../features/settings/DeviceTimeZoneButton';
import { ResultsCalendar } from '../features/journal/ResultsCalendar';
import { ResultsLine } from '../features/journal/ResultsLine';
import { ResultsDayTrades, type ResultsDayTradesState } from '../features/journal/ResultsDayTrades';
import { ReviewTradeLink } from './ReviewTradeLink';

interface JournalDailyResultsProps {
  readonly db: KairosDatabase;
  readonly refreshRevision: number;
  /** The current instant as a canonical UTC ISO string; tests inject a fixed one. */
  readonly now?: () => string;
}

/** A stable default clock, as in GoalsRoute. */
const wallClock = (): string => new Date().toISOString();

type JournalDailyResultsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unconfigured' }>
  | Readonly<{ kind: 'ready'; timeZone: string; projection: VisualPnlDailySummaryProjection }>
  | Readonly<{ kind: 'error' }>;

/**
 * P13-owned Journal child surface.
 *
 * This boundary coordinates established P13 owners only:
 * MetadataRepository -> explicit timezone preference -> Journal daily query
 * over every closed trade -> month grid -> ResultsCalendar. It performs no financial arithmetic, FX,
 * day grouping or direct storage access. The device time zone is saved only on an explicit tap.
 */
export function JournalDailyResults({ db, refreshRevision, now = wallClock }: JournalDailyResultsProps) {
  const [state, setState] = useState<JournalDailyResultsState>({ kind: 'loading' });
  const repositories = useMemo(() => createKairosRepositories(db), [db]);
  const [localRevision, setLocalRevision] = useState(0);
  // The month survives refreshRevision reloads; null means "today's month".
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [dayTrades, setDayTrades] = useState<ResultsDayTradesState>({ kind: 'loading' });
  const dayRequest = useRef(0);

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

  function selectDay(timeZone: string, dayKey: string | null): void {
    const request = ++dayRequest.current;
    setSelectedDayKey(dayKey);
    if (dayKey === null) return;
    setDayTrades({ kind: 'loading' });
    listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: dayKey, toDayKey: shiftVisualPnlDayKey(dayKey, 1) }).then(result => {
      if (request !== dayRequest.current) return;
      setDayTrades(result.ok ? { kind: 'ready', entries: result.entries } : { kind: 'error' });
    }, () => { if (request === dayRequest.current) setDayTrades({ kind: 'error' }); });
  }

  const today = state.kind === 'ready' ? projectVisualPnlDayKey(now(), state.timeZone) : null;
  if (state.kind === 'ready' && today?.available) {
    const { timeZone, projection } = state;
    const todayMonth = today.dayKey.slice(0, 7);
    const shownMonth = monthKey ?? todayMonth;
    const grid = projectVisualPnlMonthGrid({ monthKey: shownMonth, days: projection.days, todayKey: today.dayKey });
    const changeMonth = (next: string) => { setMonthKey(next); selectDay(timeZone, null); };
    const blocked = projection.blockedTrades.length;
    return (
      <section className="kairos-pnl-calendar" aria-labelledby="kairos-pnl-calendar-title" data-visual-pnl-time-zone={timeZone}>
        <div className="kairos-pnl-calendar__heading">
          <div>
            <p className="kairos-journal__eyebrow">Your results</p>
            <h2 id="kairos-pnl-calendar-title">Daily results</h2>
          </div>
        </div>
        <VisualPnlStreak projection={projectVisualPnlDailyStreak(projection.days)} />
        <VisualPnlPerformanceSummary summary={summarizeVisualPnlDailyPerformance(projection.days)} />
        <ResultsLine line={projectVisualPnlResultLine(projectVisualPnlCumulativeRealizedPnl(projectVisualPnlProgressSeries(projection.days)))} />
        {grid ? <ResultsCalendar
          grid={grid}
          selectedDayKey={selectedDayKey}
          canShowNextMonth={shownMonth < todayMonth}
          onSelectDay={dayKey => selectDay(timeZone, dayKey === selectedDayKey ? null : dayKey)}
          onPreviousMonth={() => changeMonth(grid.previousMonthKey)}
          onNextMonth={() => changeMonth(grid.nextMonthKey)}
        /> : null}
        {selectedDayKey ? <ResultsDayTrades
          dayKey={selectedDayKey}
          timeZone={timeZone}
          state={dayTrades}
          renderTradeLink={id => <ReviewTradeLink id={id} className="kairos-results-day-trades__review" />}
          onClose={() => selectDay(timeZone, null)}
        /> : null}
        {blocked > 0 ? <p className="kairos-pnl-calendar__notice">{blocked === 1 ? '1 closed trade could not be placed on a day.' : `${blocked} closed trades could not be placed on a day.`}</p> : null}
        <p className="kairos-pnl-calendar__notice">Time zone: {timeZone}</p>
      </section>
    );
  }

  return (
    <section className="kairos-pnl-calendar" aria-labelledby="kairos-pnl-calendar-title">
      <div className="kairos-pnl-calendar__heading">
        <div>
          <p className="kairos-journal__eyebrow">Your results</p>
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
