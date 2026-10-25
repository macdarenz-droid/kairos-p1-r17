/**
 * U16 (P21.A1, D269): the one owner of "the next big news": the first saved news event marked big (by the trader for
 * typed news, by Kairos's list for official news: `economicEventSize` high) that starts at or after now and within 14
 * days; a tie goes to the name shown, then the id. It reads saved news only, so none found never means none is coming.
 * It gives the saved time zone (to say when) and when the official schedules were last fetched. It writes nothing.
 */
import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { isEconomicEventRecordShape, type EconomicEventRecord } from '../../domain/economic-calendar/economicEvent';
import { economicEventName, economicEventSize } from '../../domain/economic-calendar/newsImpact';
import { readVisualPnlTimeZonePreference } from '../visual-pnl/timeZonePreference';
import { NEWS_COVERAGE_KEY, parseNewsCalendarCoverage } from './fetchedNews';

/** How far ahead the next big news is looked for. */
export const NEXT_BIG_NEWS_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NextBigNews {
  /** The first big news from now on, with the name shown for it; null when none is saved in the next 14 days. */
  readonly next: Readonly<{ event: EconomicEventRecord; name: string }> | null;
  /** The saved time zone, in which its day and time are said. */
  readonly timeZone: string;
  /** When the official schedules were last fetched on this device; null before the first time. */
  readonly refreshedAt: string | null;
}

export type NextBigNewsResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' }>
  | Readonly<{ kind: 'ready'; news: NextBigNews }>;

const isInstant = (value: string): boolean => Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;

/** The next big news at the moment `now` (a canonical UTC instant). A refusal is a result; a storage failure rejects. */
export async function loadNextBigNews(db: KairosDatabase, options: Readonly<{ now: string }>): Promise<NextBigNewsResult> {
  const { now } = options;
  if (!isInstant(now)) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-now' as const });
  const repositories = createKairosRepositories(db);
  const timeZone = await readVisualPnlTimeZonePreference(repositories.metadata);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  const until = new Date(Date.parse(now) + NEXT_BIG_NEWS_DAYS * DAY_MS).toISOString();
  const [rows, coverage] = await Promise.all([
    repositories.economicEvents.listStartingBetween(now, until),
    repositories.metadata.get(NEWS_COVERAGE_KEY),
  ]);
  const big = rows
    .filter(row => isEconomicEventRecordShape(row) && economicEventSize(row).size === 'high')
    .map(event => ({ event, name: economicEventName(event) }))
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt) || a.name.localeCompare(b.name) || a.event.id.localeCompare(b.event.id));
  const first = big[0];
  return Object.freeze({
    kind: 'ready' as const,
    news: Object.freeze({
      next: first === undefined ? null : Object.freeze(first),
      timeZone,
      refreshedAt: parseNewsCalendarCoverage(coverage?.value).refreshedAt,
    }),
  });
}
