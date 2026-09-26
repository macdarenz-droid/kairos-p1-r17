/**
 * P34: the News calendar's words. Plain words only; the numbers and sizes come from their owners (economicEvents.ts,
 * newsImpact.ts, dayBucket.ts). "Unavailable · Try again" stay U1's (online/onlineWords.ts).
 */
import type { EconomicEventImpact, EconomicEventRecord } from '../../domain/economic-calendar/economicEvent';
import { economicEventSize } from '../../domain/economic-calendar/newsImpact';
import { NEWS_CALENDAR_SOURCE_IDS, NEWS_SOURCES, type NewsCalendarSourceId } from '../../domain/economic-calendar/newsSources';
import { currencyDayLabel } from '../currency/currencyWords';
import { describeUnavailable, type UnavailableWords } from '../online/onlineWords';
import { projectVisualPnlClockTime, projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import { visualPnlMondayFirstWeekday } from '../visual-pnl/dayKeyCalendar';
import type { TypedEconomicEventField } from './economicEvents';
import type { RefreshNewsCalendarResult } from './fetchedNews';
import { NEWS_NEAR_TRADE_MINUTES } from './newsNearTrades';

export const NEWS_CALENDAR_INTRO = `Some scheduled news, such as a central bank's rate decision or a country's inflation or jobs numbers, can move prices a lot and fast. Kairos gets the official schedules of central banks and statistics offices, and you can add your own news. Each closed trade's card says when big news was within ${NEWS_NEAR_TRADE_MINUTES} minutes of when it opened or closed, or while it was open. This calendar never predicts prices and never tells you when to trade.`;
export const NEWS_CALENDAR_LIMITS = "Official schedules only, and only the releases on Kairos's own list. Some big news is not there, such as business surveys (PMIs), China's numbers and most speeches: add it yourself.";

export const IMPACT_WORDS: Readonly<Record<EconomicEventImpact, string>> = Object.freeze({ high: 'Big news', medium: 'Medium news', low: 'Small news' });

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** "Big news", or "Big news (Kairos's rating)" for official news. */
export function describeEventSize(event: EconomicEventRecord): string {
  const { size, ratedBy } = economicEventSize(event);
  if (ratedBy === 'you') return size === null ? 'Size not set' : IMPACT_WORDS[size];
  return size === null ? 'Not rated by Kairos' : `${IMPACT_WORDS[size]} (Kairos's rating)`;
}

/** "Thursday 24 September 2026". */
export function calendarDayHeading(dayKey: string): string {
  return `${WEEKDAYS[visualPnlMondayFirstWeekday(dayKey)]} ${currencyDayLabel(dayKey)}`;
}

/** "Week of Monday 21 September 2026". */
export function calendarWeekHeading(weekStartDayKey: string): string {
  return `Week of ${calendarDayHeading(weekStartDayKey)}`;
}

/** "20:30" in the saved zone, or "Time unavailable". */
export function eventClock(event: EconomicEventRecord, timeZone: string): string {
  return projectVisualPnlClockTime(event.startsAt, timeZone) ?? 'Time unavailable';
}

/** "Thursday 24 September 2026 at 20:30" in the saved zone, or "Time unavailable". */
export function describeCalendarMoment(instant: string, timeZone: string): string {
  const day = projectVisualPnlDayKey(instant, timeZone);
  const clock = projectVisualPnlClockTime(instant, timeZone);
  return day.available && clock !== null ? `${calendarDayHeading(day.dayKey)} at ${clock}` : 'Time unavailable';
}

/** "USD · Big news (Kairos's rating)", or the size alone when no currency is set. */
export function describeEventFacts(event: EconomicEventRecord): string {
  return [event.currency, describeEventSize(event)].filter((part): part is string => part !== null).join(' · ');
}

/** "Added by you", or where an official release came from with the source's own title. */
export function describeEventOrigin(event: EconomicEventRecord): string {
  return event.source === 'typed' ? 'Added by you' : `From ${NEWS_SOURCES[event.source].name}: ${event.title}`;
}

/** "Expected 3.1% · Last time 2.9%"; typed news without values says nothing, official news says they are unavailable. */
export function describeEventValues(event: EconomicEventRecord): string | null {
  const parts = [
    event.expected === null ? null : `Expected ${event.expected}`,
    event.previous === null ? null : `Last time ${event.previous}`,
    event.actual === null ? null : `Actual ${event.actual}`,
  ].filter((part): part is string => part !== null);
  if (parts.length > 0) return parts.join(' · ');
  return event.source === 'typed' ? null : 'Expected, last time and actual: unavailable';
}

function listNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Which official schedules Kairos checked for the week; the missing ones are named when there are 1 to 3. */
export function describeWeekCoverage(checked: readonly NewsCalendarSourceId[]): string {
  const total = NEWS_CALENDAR_SOURCE_IDS.length;
  if (checked.length >= total) return `Kairos checked all ${total} official schedules for this week.`;
  if (checked.length === 0) return 'Kairos has not checked the official schedules for this week yet.';
  const missing = NEWS_CALENDAR_SOURCE_IDS.filter((source) => !checked.includes(source));
  const named = missing.length <= 3 ? ` Not checked yet: ${listNames(missing.map((source) => NEWS_SOURCES[source].name))}.` : '';
  return `Kairos checked ${checked.length} of ${total} official schedules for this week.${named}`;
}

/** An empty week: it claims no official release only when every schedule was checked. */
export function describeEmptyWeek(bigOnly: boolean, allChecked: boolean): string {
  if (allChecked) {
    return bigOnly
      ? "No big news from Kairos's list of official releases this week, and none you added."
      : "Nothing from Kairos's list of official releases this week, and no news you added.";
  }
  return bigOnly ? 'No big news saved for this week.' : 'No news saved for this week.';
}

export function describeAddedNewsCount(count: number): string {
  if (count === 0) return 'You have not added any news on this device.';
  return count === 1 ? 'You added 1 news event on this device.' : `You added ${count} news events on this device.`;
}

/** Where the page is with the official schedules on this visit (T-046k); busy keeps the state it started from. */
export type NewsRefreshState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'not-set-up' }>
  | Readonly<{ kind: 'busy'; previous: NewsRefreshState }>
  | Readonly<{ kind: 'done'; result: RefreshNewsCalendarResult }>;

export type NewsRefreshLine =
  | Readonly<{ kind: 'line'; text: string; role: 'status' | 'alert'; button: 'Refresh' | 'Try again' | null; busy: boolean }>
  | Readonly<{ kind: 'unavailable'; words: UnavailableWords; busy: boolean }>;

export const NEWS_REFRESHING = 'Getting the latest news…';

const line = (text: string, role: 'status' | 'alert', button: 'Refresh' | 'Try again' | null): NewsRefreshLine =>
  Object.freeze({ kind: 'line' as const, text, role, button, busy: false });

/** "Showing news saved Thursday 24 September 2026 at 11:50." */
export function describeSavedCopy(savedAt: string, timeZone: string): string {
  return `Showing news saved ${describeCalendarMoment(savedAt, timeZone)}.`;
}

/** The status block's line for a refresh state; `savedAt` is the saved copy's refreshedAt (null: none on this device). */
export function describeNewsRefresh(state: NewsRefreshState, savedAt: string | null, timeZone: string): NewsRefreshLine {
  switch (state.kind) {
    case 'idle':
      return savedAt === null ? line('Kairos has not got the official schedules on this device yet.', 'status', 'Refresh') : line(describeSavedCopy(savedAt, timeZone), 'status', 'Refresh');
    case 'busy':
      return Object.freeze({ ...describeNewsRefresh(state.previous, savedAt, timeZone), busy: true });
    case 'not-set-up':
      return line(`${describeUnavailable({ ok: false, reason: 'not-set-up' }, 'News').message} You can still add your own news.`, 'status', null);
    case 'done': {
      const { result } = state;
      if (result.ok) {
        const updated = `Updated ${describeCalendarMoment(result.refreshedAt, timeZone)}.`;
        const failed = new Set(result.outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.source));
        if (failed.size === 0) return line(updated, 'status', 'Refresh');
        const names = NEWS_CALENDAR_SOURCE_IDS.filter((source) => failed.has(source)).map((source) => NEWS_SOURCES[source].name);
        return line(`${updated} Could not get news from ${listNames(names)} this time.`, 'status', 'Try again');
      }
      if (result.reason === 'unavailable') return Object.freeze({ kind: 'unavailable' as const, words: describeUnavailable(result.failure, 'News'), busy: false });
      return line('Kairos could not save the news. Nothing was changed.', 'alert', 'Try again');
    }
  }
}

/** The sources card; restates newsImpact.ts's high rules, so it changes when they change. */
export const NEWS_SOURCES_INTRO = "Kairos's server reads these official schedules for you. They give the name and date of each release, and most give the time. For Eurostat, the European Central Bank and the Reserve Bank of Australia, Kairos adds the release time each one publishes: 11:00 in Luxembourg, 14:15 in Frankfurt and 14:30 in Sydney. No schedule says how big a release is or what numbers are expected. Kairos shows only the releases on its own fixed list and sizes them itself. Big news: rate decisions and the US Fed's press conference; US and UK inflation, and the euro area's first inflation estimate; the US and UK jobs reports; and the first US growth (GDP), spending and retail sales numbers. Everything else on the list is medium or small news, and each release on the calendar shows its size.";

/** The add form's words for each field it refuses (T-046l). */
export const EVENT_FIELD_ERRORS: Readonly<Record<TypedEconomicEventField, string>> = Object.freeze({
  title: 'Add a name of up to 80 characters, such as US CPI.',
  startsAt: 'Add the date and time.',
  currency: 'Use 3 letters, such as USD, or leave it empty.',
  impact: 'Choose how big it is.',
  expected: 'Use up to 16 characters, such as 3.1% or 21.5K.',
  previous: 'Use up to 16 characters, such as 3.1% or 21.5K.',
  actual: 'Use up to 16 characters, such as 3.1% or 21.5K.',
});

/** "1,000": a whole count with thousands commas. */
function countWithCommas(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "Saved: US CPI, Thursday 24 September 2026 at 20:30." */
export function describeEventSaved(event: EconomicEventRecord, timeZone: string): string {
  return `Saved: ${event.title}, ${describeCalendarMoment(event.startsAt, timeZone)}.`;
}

/** Said when the typed news cap is reached. */
export function describeNewsLimit(limit: number): string {
  return `You have added ${countWithCommas(limit)} news events, the most Kairos keeps. Delete some you no longer need, then save this one.`;
}

/** "Delete US CPI, Thursday 24 September 2026 at 20:30": the Delete button's name. */
export function eventDeleteLabel(event: EconomicEventRecord, timeZone: string): string {
  return `Delete ${event.title}, ${describeCalendarMoment(event.startsAt, timeZone)}`;
}

/** "Deleted US CPI." */
export function describeEventDeleted(event: EconomicEventRecord): string {
  return `Deleted ${event.title}.`;
}
