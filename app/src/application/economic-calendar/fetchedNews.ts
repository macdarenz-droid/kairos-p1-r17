/**
 * P34: official news read through the Kairos server and kept on this device (D146–D148). A refresh asks all nine
 * calendar routes at once, saves the releases on Kairos's size list, replaces a source's saved rows inside the window it
 * vouched for (`covers`), keeps at most NEWS_FETCHED_MAX_SAVED fetched rows, and records which windows were checked, in
 * one atomic write. A refresh where no source answered writes nothing. Typed news is never touched here.
 */
import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { economicEventId, isEconomicEventRecordShape, type EconomicEventRecord } from '../../domain/economic-calendar/economicEvent';
import { rateOfficialRelease } from '../../domain/economic-calendar/newsImpact';
import { NEWS_CALENDAR_SOURCE_IDS, NEWS_SOURCES, isNewsCalendarSourceId, type NewsCalendarSourceId } from '../../domain/economic-calendar/newsSources';
import type { KairosApiFailure } from '../../services/kairos-api/kairosApi';
import type { NewsApiPort, NewsCalendarAnswer } from '../../services/kairos-api/newsApi';
import { shiftVisualPnlDayKey } from '../visual-pnl/dayKeyCalendar';

export type { NewsApiPort };

/** The page asks again once its saved copy is this old (D151). */
export const NEWS_REFRESH_AFTER_MINUTES = 30;
/** The most fetched rows kept on this device; the oldest go first. Typed news keeps its own cap. */
export const NEWS_FETCHED_MAX_SAVED = 5000;
/** Metadata that travels in backups with the fetched rows it describes. */
export const NEWS_COVERAGE_KEY = 'news.calendar-coverage.v1';
/** The most coverage windows kept, those reaching latest first. */
const NEWS_COVERAGE_MAX_WINDOWS = 60;

export interface NewsCoverageWindow {
  readonly source: NewsCalendarSourceId;
  readonly from: string;
  readonly to: string;
  readonly fetchedAt: string;
}
export interface NewsCalendarCoverage {
  readonly refreshedAt: string | null;
  readonly windows: readonly NewsCoverageWindow[];
}
export type NewsRefreshOutcome =
  | Readonly<{ source: NewsCalendarSourceId; ok: true; saved: number }>
  | Readonly<{ source: NewsCalendarSourceId; ok: false; failure: KairosApiFailure }>;
export type RefreshNewsCalendarResult =
  | Readonly<{ ok: true; refreshedAt: string; outcomes: readonly NewsRefreshOutcome[] }>
  | Readonly<{ ok: false; reason: 'unavailable'; failure: KairosApiFailure; outcomes: readonly NewsRefreshOutcome[] }>
  | Readonly<{ ok: false; reason: 'storage-error'; outcomes: readonly NewsRefreshOutcome[] }>;

const EMPTY_COVERAGE: NewsCalendarCoverage = Object.freeze({ refreshedAt: null, windows: Object.freeze([]) });
const NOT_SET_UP: KairosApiFailure = Object.freeze({ ok: false as const, reason: 'not-set-up' as const });
const TRANSPORT_FAILED: KairosApiFailure = Object.freeze({ ok: false as const, reason: 'transport-failed' as const });

const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const oneMsAfter = (instant: string): string => new Date(Date.parse(instant) + 1).toISOString();

/** The saved coverage record; anything unreadable is no coverage. Never throws. */
export function parseNewsCalendarCoverage(value: string | undefined): NewsCalendarCoverage {
  if (value === undefined) return EMPTY_COVERAGE;
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return EMPTY_COVERAGE;
  }
  if (!isRecord(json) || json.version !== 1) return EMPTY_COVERAGE;
  const windows = Array.isArray(json.windows) ? json.windows : [];
  const kept: NewsCoverageWindow[] = [];
  for (const window of windows) {
    if (!isRecord(window) || !isNewsCalendarSourceId(window.source)) continue;
    if (!isInstant(window.from) || !isInstant(window.to) || !isInstant(window.fetchedAt) || window.from > window.to) continue;
    kept.push(Object.freeze({ source: window.source, from: window.from, to: window.to, fetchedAt: window.fetchedAt }));
  }
  return Object.freeze({ refreshedAt: isInstant(json.refreshedAt) ? json.refreshedAt : null, windows: Object.freeze(kept) });
}

/**
 * The coverage after a refresh: per source, windows that overlap or touch are joined; with `removedUpTo` (the newest
 * saved row dropped by the cap), no window claims anything up to it any more; the 60 reaching latest are kept.
 */
export function mergeNewsCoverage(
  coverage: NewsCalendarCoverage,
  added: readonly NewsCoverageWindow[],
  refreshedAt: string,
  removedUpTo: string | null,
): NewsCalendarCoverage {
  const merged: NewsCoverageWindow[] = [];
  for (const source of NEWS_CALENDAR_SOURCE_IDS) {
    const windows = [...coverage.windows, ...added].filter((window) => window.source === source).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    let current: { source: NewsCalendarSourceId; from: string; to: string; fetchedAt: string } | null = null;
    for (const window of windows) {
      if (current !== null && window.from <= current.to) {
        if (window.to > current.to) current.to = window.to;
        if (window.fetchedAt > current.fetchedAt) current.fetchedAt = window.fetchedAt;
        continue;
      }
      if (current !== null) merged.push(current);
      current = { ...window };
    }
    if (current !== null) merged.push(current);
  }
  const trimmed = merged.flatMap((window) => {
    if (removedUpTo === null) return [window];
    if (window.to <= removedUpTo) return [];
    return [window.from <= removedUpTo ? { ...window, from: oneMsAfter(removedUpTo) } : window];
  });
  const latest = [...trimmed].sort((a, b) => (a.to > b.to ? -1 : a.to < b.to ? 1 : 0)).slice(0, NEWS_COVERAGE_MAX_WINDOWS);
  const windows = trimmed.filter((window) => latest.includes(window)).map((window) => Object.freeze({ ...window }));
  return Object.freeze({ refreshedAt, windows: Object.freeze(windows) });
}

/** The rows a calendar answer saves: only releases on Kairos's size list, each as a fetched row (sized on read). */
export function mapNewsCalendar(source: NewsCalendarSourceId, answer: NewsCalendarAnswer, savedAt: string): readonly EconomicEventRecord[] {
  const rows: EconomicEventRecord[] = [];
  for (const event of answer.events) {
    if (rateOfficialRelease(source, event.title) === null) continue;
    const row: EconomicEventRecord = {
      id: economicEventId(source, event.key),
      source,
      title: event.title,
      currency: NEWS_SOURCES[source].currency,
      startsAt: event.startsAt,
      impact: null,
      expected: null,
      previous: null,
      actual: null,
      savedAt,
      fetchedAt: answer.fetchedAt,
    };
    if (isEconomicEventRecordShape(row)) rows.push(Object.freeze(row));
  }
  return Object.freeze(rows);
}

/** True when there is no saved copy yet, or it is at least 30 minutes old. */
export function isNewsRefreshDue(refreshedAt: string | null, now: string): boolean {
  if (refreshedAt === null) return true;
  return Date.parse(now) - Date.parse(refreshedAt) >= NEWS_REFRESH_AFTER_MINUTES * 60_000;
}

/** True when one of the source's windows covers the whole week with the week read's day of padding, so it holds in every zone. */
export function isNewsWeekChecked(coverage: NewsCalendarCoverage, source: NewsCalendarSourceId, weekStartDayKey: string): boolean {
  const from = `${shiftVisualPnlDayKey(weekStartDayKey, -1)}T00:00:00.000Z`;
  const to = `${shiftVisualPnlDayKey(weekStartDayKey, 8)}T00:00:00.000Z`;
  return coverage.windows.some((window) => window.source === source && window.from <= from && window.to >= to);
}

/** The saved coverage; a failed read is no coverage. */
export async function loadNewsCalendarCoverage(db: KairosDatabase): Promise<NewsCalendarCoverage> {
  try {
    return parseNewsCalendarCoverage((await createKairosRepositories(db).metadata.get(NEWS_COVERAGE_KEY))?.value);
  } catch {
    return EMPTY_COVERAGE;
  }
}

const isRateLimited = (failure: KairosApiFailure) => failure.reason === 'unavailable' && failure.serverReason === 'rate-limited';

/** The one failure described when no source answered: not set up, else the server's rate limit, else no connection, else the first. */
export function pickNewsFailure(failures: readonly KairosApiFailure[]): KairosApiFailure {
  return (
    failures.find((failure) => failure.reason === 'not-set-up') ??
    failures.find(isRateLimited) ??
    failures.find((failure) => failure.reason === 'transport-failed') ??
    failures[0] ??
    TRANSPORT_FAILED
  );
}

type Answered = Readonly<{ source: NewsCalendarSourceId; answer: NewsCalendarAnswer; rows: readonly EconomicEventRecord[] }>;

/** Asks all nine calendars and saves what they answered in one atomic write (D148); nothing is written when none answered. */
export async function refreshNewsCalendar(
  db: KairosDatabase,
  port: NewsApiPort,
  options: { readonly now: string; readonly signal?: AbortSignal },
): Promise<RefreshNewsCalendarResult> {
  const { now } = options;
  if (!port.setUp) {
    const outcomes = Object.freeze(NEWS_CALENDAR_SOURCE_IDS.map((source) => Object.freeze({ source, ok: false as const, failure: NOT_SET_UP })));
    return Object.freeze({ ok: false as const, reason: 'unavailable' as const, failure: NOT_SET_UP, outcomes });
  }
  const results = await Promise.all(
    NEWS_CALENDAR_SOURCE_IDS.map(async (source) => {
      try {
        return await port.calendar(source, { signal: options.signal });
      } catch {
        return TRANSPORT_FAILED;
      }
    }),
  );
  const answered: Answered[] = [];
  const failures: KairosApiFailure[] = [];
  const outcomes = Object.freeze(
    NEWS_CALENDAR_SOURCE_IDS.map((source, index): NewsRefreshOutcome => {
      const result = results[index];
      if (!result.ok) {
        failures.push(result);
        return Object.freeze({ source, ok: false as const, failure: result });
      }
      const rows = mapNewsCalendar(source, result.value, now);
      answered.push({ source, answer: result.value, rows });
      return Object.freeze({ source, ok: true as const, saved: rows.length });
    }),
  );
  if (answered.length === 0) return Object.freeze({ ok: false as const, reason: 'unavailable' as const, failure: pickNewsFailure(failures), outcomes });
  try {
    await runKairosAtomicWrite(db, ['economicEvents', 'metadata'], async ({ repositories }) => {
      const events = repositories.economicEvents;
      const added: NewsCoverageWindow[] = [];
      for (const { source, answer } of answered) {
        if (answer.covers === null) continue;
        const replaced = (await events.listStartingBetween(answer.covers.from, answer.covers.to)).filter((row) => row.source === source);
        if (replaced.length > 0) await events.deleteMany(replaced.map((row) => row.id));
        added.push({ source, from: answer.covers.from, to: answer.covers.to, fetchedAt: answer.fetchedAt });
      }
      const rows = answered.flatMap((item) => item.rows);
      if (rows.length > 0) await events.putMany(rows);
      const excess = (await events.count()) - (await events.countTyped()) - NEWS_FETCHED_MAX_SAVED;
      let removedUpTo: string | null = null;
      if (excess > 0) {
        const oldest = await events.listOldestFetched(excess);
        await events.deleteMany(oldest.map((row) => row.id));
        removedUpTo = oldest.reduce<string | null>((latest, row) => (latest === null || row.startsAt > latest ? row.startsAt : latest), null);
      }
      const coverage = parseNewsCalendarCoverage((await repositories.metadata.get(NEWS_COVERAGE_KEY))?.value);
      const merged = mergeNewsCoverage(coverage, added, now, removedUpTo);
      await repositories.metadata.put({ key: NEWS_COVERAGE_KEY, value: JSON.stringify({ version: 1, refreshedAt: now, windows: merged.windows }), updatedAt: now });
    });
  } catch {
    return Object.freeze({ ok: false as const, reason: 'storage-error' as const, outcomes });
  }
  return Object.freeze({ ok: true as const, refreshedAt: now, outcomes });
}
