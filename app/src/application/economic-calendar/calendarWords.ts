/**
 * P34: the News calendar's words. Plain words only; the numbers and sizes come from their owners (economicEvents.ts,
 * newsImpact.ts, dayBucket.ts). "Unavailable · Try again" stay U1's (online/onlineWords.ts).
 */
import type { EconomicEventImpact, EconomicEventRecord } from '../../domain/economic-calendar/economicEvent';
import { economicEventSize } from '../../domain/economic-calendar/newsImpact';
import { NEWS_CALENDAR_SOURCE_IDS, NEWS_SOURCES, type NewsCalendarSourceId } from '../../domain/economic-calendar/newsSources';
import { currencyDayLabel } from '../currency/currencyWords';
import { projectVisualPnlClockTime, projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import { visualPnlMondayFirstWeekday } from '../visual-pnl/dayKeyCalendar';
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
