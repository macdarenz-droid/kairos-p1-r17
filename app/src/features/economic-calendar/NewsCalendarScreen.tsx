import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import {
  NEWS_CALENDAR_INTRO,
  NEWS_CALENDAR_LIMITS,
  NEWS_REFRESHING,
  NEWS_SOURCES_INTRO,
  calendarDayHeading,
  calendarWeekHeading,
  describeAddedNewsCount,
  describeEmptyWeek,
  describeEventFacts,
  describeEventOrigin,
  describeEventValues,
  describeNewsRefresh,
  describeSavedCopy,
  describeWeekCoverage,
  eventClock,
  type NewsRefreshState,
} from '../../application/economic-calendar/calendarWords';
import { isNewsRefreshDue, loadNewsCalendarCoverage, refreshNewsCalendar, type NewsApiPort } from '../../application/economic-calendar/fetchedNews';
import { loadEconomicCalendarWeek, onlyBigNews, type EconomicCalendarWeekResult } from '../../application/economic-calendar/economicEvents';
import { shiftVisualPnlDayKey } from '../../application/visual-pnl/dayKeyCalendar';
import type { KairosDatabase } from '../../data/database';
import type { EconomicEventImpact } from '../../domain/economic-calendar/economicEvent';
import { NEWS_CALENDAR_SOURCE_IDS, NEWS_SOURCES } from '../../domain/economic-calendar/newsSources';
import { economicEventName, economicEventSize } from '../../domain/economic-calendar/newsImpact';
import { Button, Card, UnavailableNotice } from '../../design-system/primitives';
import { GlossaryHint } from '../learn/GlossaryHint';
import { WorldCalendarPanel } from './WorldCalendarPanel';
import './newsCalendar.css';

export interface NewsCalendarScreenProps {
  readonly db: KairosDatabase;
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
  /** The Kairos server's news routes; without it, or not set up, the page shows saved and typed news only. */
  readonly news?: NewsApiPort;
}

type ScreenState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'failed' }> | Readonly<{ kind: 'ready'; result: EconomicCalendarWeekResult }>;

const wallClock = (): string => new Date().toISOString();

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function CalendarLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/** Three rising bars: 3 filled for big news, 2 for medium, 1 for small; a picture of what the words say. */
function NewsSize({ size }: { readonly size: EconomicEventImpact | null }) {
  return <span className="kairos-news-size" data-impact={size ?? 'unknown'} aria-hidden="true"><span /><span /><span /></span>;
}

const NOT_SET_UP: NewsRefreshState = Object.freeze({ kind: 'not-set-up' as const });

/** The state a busy refresh started from, down to a settled one. */
const settled = (state: NewsRefreshState): NewsRefreshState => (state.kind === 'busy' ? settled(state.previous) : state);

/** Where the news comes from: the nine official schedules with links, and the licence credits. */
function NewsSourcesCard() {
  const headingId = useId();
  return <Card as="section" className="kairos-news-calendar-card kairos-news-calendar__sources" aria-labelledby={headingId}>
    <h2 id={headingId}>Where the news comes from</h2>
    <p>{NEWS_SOURCES_INTRO}</p>
    <ul>
      {NEWS_CALENDAR_SOURCE_IDS.map((id) => <li key={id}><a href={NEWS_SOURCES[id].page} target="_blank" rel="noopener noreferrer">{NEWS_SOURCES[id].name}</a></li>)}
    </ul>
    <p>Eurostat and Reserve Bank of Australia information is used under the <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 4.0 licence</a>. Kairos changed it: it keeps only the releases on its list, gives them plain names and adds the release times each one publishes. UK information contains public sector information licensed under the <a href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/" target="_blank" rel="noopener noreferrer">Open Government Licence v3.0</a>. No source endorses Kairos.</p>
  </Card>;
}

/** P34: More → News calendar. One week of saved news, Monday to Sunday in the saved time zone; fresh official schedules on open when due, and on a tap. */
export function NewsCalendarScreen({ db, now = wallClock, news }: NewsCalendarScreenProps) {
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [bigOnly, setBigOnly] = useState(false);
  // Counts reloads asked for after a change (T-046k); only the first load shows "Loading".
  const [reload, setReload] = useState(0);
  const setUp = news !== undefined && news.setUp;
  // null: set up, and the coverage is not read yet (no status block).
  const [refresh, setRefresh] = useState<NewsRefreshState | null>(setUp ? null : NOT_SET_UP);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const running = useRef<AbortController | null>(null);
  const tapped = useRef<HTMLElement | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [settledByTap, setSettledByTap] = useState(0);
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const weekId = useId();
  const idPrefix = useId();

  useEffect(() => {
    let ignore = false;
    loadEconomicCalendarWeek(db, { now: now(), weekStartDayKey: weekStart }).then(
      (result) => { if (!ignore) setState({ kind: 'ready', result }); },
      () => { if (!ignore) setState({ kind: 'failed' }); },
    );
    return () => { ignore = true; };
  }, [db, now, weekStart, reload]);

  function startRefresh(from: NewsRefreshState, button: HTMLElement | null) {
    if (news === undefined || !news.setUp || from.kind === 'busy' || from.kind === 'not-set-up') return;
    const controller = new AbortController();
    running.current = controller;
    tapped.current = button;
    setRefresh({ kind: 'busy', previous: from });
    void refreshNewsCalendar(db, news, { now: now(), signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      running.current = null;
      setRefresh({ kind: 'done', result });
      setReload((count) => count + 1);
      if (button !== null) setSettledByTap((count) => count + 1);
    });
  }
  const refreshOnTap = (event: MouseEvent<HTMLElement>) => {
    if (refreshRef.current !== null) startRefresh(refreshRef.current, event.currentTarget);
  };

  // On open, once: read the coverage, then refresh when the saved copy is missing or 30 minutes old. Never from a timer.
  useEffect(() => {
    if (news === undefined || !news.setUp) return;
    let ignore = false;
    void loadNewsCalendarCoverage(db).then((coverage) => {
      if (ignore) return;
      const idle: NewsRefreshState = { kind: 'idle' };
      setRefresh(idle);
      if (isNewsRefreshDue(coverage.refreshedAt, now())) startRefresh(idle, null);
    });
    return () => { ignore = true; running.current?.abort(); };
  }, []);

  // After a refresh the trader started: when the tapped button left the document, focus the block's new button, or the week heading.
  useLayoutEffect(() => {
    const button = tapped.current;
    if (settledByTap === 0 || button === null) return;
    tapped.current = null;
    if (button.isConnected) {
      if (document.activeElement === null || document.activeElement === document.body) button.focus();
      return;
    }
    const next = statusRef.current?.querySelector('button') ?? document.getElementById(weekId);
    next?.focus();
  }, [settledByTap, weekId]);

  return <section className="kairos-route kairos-news-calendar" aria-labelledby="kairos-news-calendar-title">
    <p className="kairos-news-calendar__eyebrow">Scheduled news</p>
    <h1 id="kairos-news-calendar-title" tabIndex={-1}>News calendar</h1>
    <p>{NEWS_CALENDAR_INTRO} <GlossaryHint termId="news-calendar" label="News calendar" /></p>
    <p>{NEWS_CALENDAR_LIMITS}</p>
    {state.kind === 'loading' ? <p>Loading your news calendar…</p> : null}
    {state.kind === 'failed' || (state.kind === 'ready' && state.result.kind === 'unavailable')
      ? <p>Kairos could not load your news calendar. Your trades are not affected.</p>
      : null}
    {state.kind === 'ready' && state.result.kind === 'time-zone-unconfigured'
      ? <p>Your news calendar shows each day in your time zone, so it needs your time zone first. <CalendarLink to="/settings">Open Settings</CalendarLink></p>
      : null}
    {state.kind === 'ready' && state.result.kind === 'ready' && refresh !== null ? (() => {
      const result = state.result;
      const line = describeNewsRefresh(refresh, result.refreshedAt, result.timeZone);
      const base = settled(refresh);
      const showSaved = result.refreshedAt !== null && (base.kind === 'not-set-up' || (base.kind === 'done' && !base.result.ok));
      return <div className="kairos-news-calendar__status" ref={statusRef}>
        {refresh.kind === 'busy' ? <p role="status">{NEWS_REFRESHING}</p> : null}
        {line.kind === 'line'
          ? <><p role={line.role}>{line.text}</p>{line.button === null ? null : <div><Button variant="secondary" size="sm" busy={line.busy} onClick={refreshOnTap}>{line.button}</Button></div>}</>
          : <UnavailableNotice message={line.words.message} retryLabel={line.words.retryLabel} onRetry={() => { if (refreshRef.current !== null) startRefresh(refreshRef.current, statusRef.current?.querySelector('.kairos-unavailable button') ?? null); }} busy={line.busy} />}
        {showSaved && result.refreshedAt !== null ? <p>{describeSavedCopy(result.refreshedAt, result.timeZone)}</p> : null}
      </div>;
    })() : null}
    {state.kind === 'ready' && state.result.kind === 'ready' ? (() => {
      const result = state.result;
      const days = bigOnly ? onlyBigNews(result.days) : result.days;
      const allChecked = result.checkedSources.length === NEWS_CALENDAR_SOURCE_IDS.length;
      return <Card as="section" className="kairos-news-calendar-card" aria-labelledby={weekId}>
        <h2 id={weekId} tabIndex={-1}>{calendarWeekHeading(result.weekStartDayKey)}</h2>
        <p>{`Times in ${result.timeZone}.`}</p>
        <div className="kairos-news-calendar__controls">
          <Button variant="secondary" size="sm" onClick={() => setWeekStart((current) => shiftVisualPnlDayKey(current ?? result.thisWeekStartDayKey, -7))}>Earlier week</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(null)}>This week</Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart((current) => shiftVisualPnlDayKey(current ?? result.thisWeekStartDayKey, 7))}>Later week</Button>
        </div>
        <p>{describeWeekCoverage(result.checkedSources)}</p>
        <div className="kairos-news-calendar__filter">
          <label><input type="checkbox" checked={bigOnly} onChange={(event) => setBigOnly(event.target.checked)} /> Show big news only</label>
          {' '}<GlossaryHint termId="big-news" label="Big news" />
        </div>
        {days.length === 0
          ? <p>{describeEmptyWeek(bigOnly, allChecked)}</p>
          : days.map((day) => {
            const dayId = `${idPrefix}-${day.dayKey}`;
            return <div key={day.dayKey} role="group" aria-labelledby={dayId} className="kairos-news-calendar__day">
              <h3 id={dayId}>{calendarDayHeading(day.dayKey)}</h3>
              <ul className="kairos-news-calendar__events">
                {day.events.map((event) => {
                  const values = describeEventValues(event);
                  return <li key={event.id}>
                    <p><NewsSize size={economicEventSize(event).size} /><strong>{eventClock(event, result.timeZone)}</strong> {economicEventName(event)}</p>
                    <p>{describeEventFacts(event)}</p>
                    <p>{describeEventOrigin(event)}</p>
                    {values === null ? null : <p>{values}</p>}
                  </li>;
                })}
              </ul>
            </div>;
          })}
        <p>{describeAddedNewsCount(result.savedCount)}</p>
      </Card>;
    })() : null}
    <NewsSourcesCard />
    <WorldCalendarPanel />
  </section>;
}
