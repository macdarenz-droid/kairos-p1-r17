import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import {
  NEWS_CALENDAR_INTRO,
  NEWS_CALENDAR_LIMITS,
  calendarDayHeading,
  calendarWeekHeading,
  describeAddedNewsCount,
  describeEmptyWeek,
  describeEventFacts,
  describeEventOrigin,
  describeEventValues,
  describeWeekCoverage,
  eventClock,
} from '../../application/economic-calendar/calendarWords';
import { loadEconomicCalendarWeek, onlyBigNews, type EconomicCalendarWeekResult } from '../../application/economic-calendar/economicEvents';
import { shiftVisualPnlDayKey } from '../../application/visual-pnl/dayKeyCalendar';
import type { KairosDatabase } from '../../data/database';
import type { EconomicEventImpact } from '../../domain/economic-calendar/economicEvent';
import { NEWS_CALENDAR_SOURCE_IDS } from '../../domain/economic-calendar/newsSources';
import { economicEventName, economicEventSize } from '../../domain/economic-calendar/newsImpact';
import { Button, Card } from '../../design-system/primitives';
import { GlossaryHint } from '../learn/GlossaryHint';
import './newsCalendar.css';

export interface NewsCalendarScreenProps {
  readonly db: KairosDatabase;
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
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

/** P34: More → News calendar. One week of saved news, Monday to Sunday in the saved time zone; the saved copy only. */
export function NewsCalendarScreen({ db, now = wallClock }: NewsCalendarScreenProps) {
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [bigOnly, setBigOnly] = useState(false);
  // Counts reloads asked for after a change (T-046k); only the first load shows "Loading".
  const [reload] = useState(0);
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
  </section>;
}
