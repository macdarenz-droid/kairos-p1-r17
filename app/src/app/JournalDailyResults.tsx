import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { listJournalClosedTradesInPeriod, listJournalVisualPnlDailySummary, type JournalHistoryScope, type JournalVisualPnlDailySummary } from '../application/journal';
import { loadResultsInHomeCurrency } from '../application/currency/resultsInHomeCurrency';
import { describeTotalsInHomeCurrency } from '../application/currency/currencyWords';
import {
  projectVisualPnlDailyStreak,
  summarizeVisualPnlDailyPerformance,
  readVisualPnlTimeZonePreference,
  projectVisualPnlDayKey,
  projectVisualPnlMonthGrid,
  projectVisualPnlResultCandles,
  shiftVisualPnlDayKey,
} from '../application/visual-pnl';
import type { KairosDatabase } from '../data/database';
import { createKairosRepositories } from '../data/repositories';
import { VisualPnlStreak } from './VisualPnlStreak';
import { VisualPnlPerformanceSummary } from './VisualPnlPerformanceSummary';
import { DeviceTimeZoneButton } from '../features/settings/DeviceTimeZoneButton';
import { ResultsCalendar } from '../features/journal/ResultsCalendar';
import { ResultsCandles } from '../features/journal/ResultsCandles';
import { ResultsDayTrades, type ResultsDayTradesState } from '../features/journal/ResultsDayTrades';
import { ReviewTradeLink } from './ReviewTradeLink';
import { loadDisciplineScore } from '../application/discipline';
import { DisciplineScorePanel, type DisciplineScorePanelState } from '../features/discipline/DisciplineScorePanel';
import { CoachCard } from '../features/discipline/CoachCard';
import { monthLabel } from '../features/journal/ResultsCalendar';

interface JournalDailyResultsProps {
  readonly db: KairosDatabase;
  readonly refreshRevision: number;
  /** The current instant as a canonical UTC ISO string; tests inject a fixed one. */
  readonly now?: () => string;
  /** Bumped after a checklist or review is saved; reloads only the discipline score. */
  readonly disciplineRevision?: number;
  /** Which trades the pictures cover: the Journal's real trades (the default) or practice trades, never both. */
  readonly scope?: JournalHistoryScope;
}

interface ResultsText {
  readonly eyebrow: string;
  readonly title: string;
  readonly totalEyebrow: string;
  readonly disciplineTitle: string;
  readonly loading: string;
  readonly unconfigured: string;
  readonly error: string;
}

const RESULTS_TEXT: Readonly<Record<JournalHistoryScope, ResultsText>> = {
  real: {
    eyebrow: 'Your results', title: 'Daily results', totalEyebrow: 'Your results over time', disciplineTitle: 'Your discipline',
    loading: 'Loading daily results…', unconfigured: 'Choose a time zone in Settings to view daily results.', error: 'Kairos could not load daily results. Your stored trades were not changed.',
  },
  practice: {
    eyebrow: 'Practice trades only', title: 'Your practice results', totalEyebrow: 'Your practice results over time', disciplineTitle: 'Your practice discipline',
    loading: 'Loading your practice results…', unconfigured: 'Choose a time zone in Settings to see your practice results.', error: 'Kairos could not load your practice results. Your stored trades were not changed.',
  },
};

/** SPA navigation inside the app, a plain link outside a router (JournalRoute renders outside one in tests). */
function ResultsLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/** A stable default clock, as in GoalsRoute. */
const wallClock = (): string => new Date().toISOString();

type JournalDailyResultsState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unconfigured' }>
  | Readonly<{ kind: 'ready'; timeZone: string; projection: JournalVisualPnlDailySummary }>
  | Readonly<{ kind: 'error' }>;

/**
 * P13-owned Journal child surface.
 *
 * This boundary coordinates established P13 owners only:
 * MetadataRepository -> explicit timezone preference -> Journal daily query
 * over every closed trade of one scope (real by default) -> month grid -> ResultsCalendar. It performs no financial arithmetic, FX,
 * day grouping or direct storage access. The device time zone is saved only on an explicit tap.
 */
export function JournalDailyResults({ db, refreshRevision, now = wallClock, disciplineRevision = 0, scope = 'real' }: JournalDailyResultsProps) {
  const text = RESULTS_TEXT[scope];
  const [state, setState] = useState<JournalDailyResultsState>({ kind: 'loading' });
  const repositories = useMemo(() => createKairosRepositories(db), [db]);
  const [localRevision, setLocalRevision] = useState(0);
  // The month survives refreshRevision reloads; null means "today's month".
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [dayTrades, setDayTrades] = useState<ResultsDayTradesState>({ kind: 'loading' });
  const dayRequest = useRef(0);
  const [discipline, setDiscipline] = useState<DisciplineScorePanelState>({ kind: 'loading' });
  const disciplineRequest = useRef(0);
  const readyTimeZone = state.kind === 'ready' ? state.timeZone : null;

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

        const projection = await listJournalVisualPnlDailySummary(db, timeZone, { scope });
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
  }, [db, repositories, refreshRevision, localRevision, scope]);

  // The score of the month the calendar shows. Only the first load shows "loading"; a reload keeps the last panel.
  useEffect(() => {
    if (readyTimeZone === null) return;
    const instant = now();
    const today = projectVisualPnlDayKey(instant, readyTimeZone);
    if (!today.available) return;
    const request = ++disciplineRequest.current;
    loadDisciplineScore(db, { now: instant, monthKey: monthKey ?? today.dayKey.slice(0, 7), scope }).then(result => {
      if (request !== disciplineRequest.current) return;
      setDiscipline(result.kind === 'ready' ? { kind: 'ready', score: result.score } : { kind: 'error' });
    }, () => { if (request === disciplineRequest.current) setDiscipline({ kind: 'error' }); });
    return () => { disciplineRequest.current += 1; };
  }, [db, now, monthKey, refreshRevision, disciplineRevision, readyTimeZone, scope]);

  function selectDay(timeZone: string, dayKey: string | null): void {
    const request = ++dayRequest.current;
    setSelectedDayKey(dayKey);
    if (dayKey === null) return;
    setDayTrades({ kind: 'loading' });
    listJournalClosedTradesInPeriod(db, { timeZone, fromDayKey: dayKey, toDayKey: shiftVisualPnlDayKey(dayKey, 1), scope }).then(async result => {
      if (request !== dayRequest.current) return;
      if (!result.ok) { setDayTrades({ kind: 'error' }); return; }
      const inHome = await loadResultsInHomeCurrency(db, result.entries);
      if (request !== dayRequest.current) return;
      setDayTrades({ kind: 'ready', entries: result.entries, conversions: inHome.homeCurrency === null ? null : inHome.byTrade });
    }).catch(() => { if (request === dayRequest.current) setDayTrades({ kind: 'error' }); });
  }

  const today = state.kind === 'ready' ? projectVisualPnlDayKey(now(), state.timeZone) : null;
  if (state.kind === 'ready' && today?.available) {
    const { timeZone, projection } = state;
    const todayMonth = today.dayKey.slice(0, 7);
    const shownMonth = monthKey ?? todayMonth;
    const grid = projectVisualPnlMonthGrid({ monthKey: shownMonth, days: projection.days, todayKey: today.dayKey });
    const changeMonth = (next: string) => { setMonthKey(next); selectDay(timeZone, null); };
    const blocked = projection.blockedTrades.length;
    const homeWords = describeTotalsInHomeCurrency(projection.inHomeCurrency);
    return (
      <section className="kairos-pnl-calendar" aria-labelledby="kairos-pnl-calendar-title" data-visual-pnl-time-zone={timeZone}>
        <div className="kairos-pnl-calendar__heading">
          <div>
            <p className="kairos-journal__eyebrow">{text.eyebrow}</p>
            <h2 id="kairos-pnl-calendar-title">{text.title}</h2>
          </div>
        </div>
        {homeWords ? <p className="kairos-pnl-calendar__notice" data-home-currency={projection.inHomeCurrency.homeCurrency}>{homeWords.text} <ResultsLink to="/currency">{homeWords.link}</ResultsLink></p> : null}
        <VisualPnlStreak projection={projectVisualPnlDailyStreak(projection.days)} />
        <VisualPnlPerformanceSummary summary={summarizeVisualPnlDailyPerformance(projection.days)} />
        <ResultsCandles eyebrow={text.totalEyebrow} projection={projectVisualPnlResultCandles(projection.days)} />
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
        <DisciplineScorePanel title={text.disciplineTitle} state={discipline} periodLabel={monthLabel(shownMonth)} />
        <CoachCard db={db} scope={scope} now={now} refreshRevision={refreshRevision} disciplineRevision={disciplineRevision} />
        {blocked > 0 ? <p className="kairos-pnl-calendar__notice">{blocked === 1 ? '1 closed trade could not be placed on a day.' : `${blocked} closed trades could not be placed on a day.`}</p> : null}
        <p className="kairos-pnl-calendar__notice">Time zone: {timeZone}</p>
      </section>
    );
  }

  return (
    <section className="kairos-pnl-calendar" aria-labelledby="kairos-pnl-calendar-title">
      <div className="kairos-pnl-calendar__heading">
        <div>
          <p className="kairos-journal__eyebrow">{text.eyebrow}</p>
          <h2 id="kairos-pnl-calendar-title">{text.title}</h2>
        </div>
      </div>
      <p className="kairos-pnl-calendar__state">
        {state.kind === 'loading' ? text.loading : state.kind === 'unconfigured' ? text.unconfigured : text.error}
      </p>
      {state.kind === 'unconfigured' ? <DeviceTimeZoneButton metadata={repositories.metadata} onSaved={() => setLocalRevision(value => value + 1)} /> : null}
    </section>
  );
}
