/**
 * P34: the trader's own news calendar (D122, D124): add a news event, delete one, and read one week, Monday to Sunday, in the saved
 * time zone. Every event is typed by the trader, on this device's clock like a trade's times (D127), and saved in one atomic write; at
 * most ECONOMIC_EVENT_MAX_SAVED events are kept, and none is ever deleted on its own. Nothing here uses the network.
 */
import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import {
  ECONOMIC_EVENT_IMPACTS,
  ECONOMIC_EVENT_LIMITS,
  createEconomicEventKey,
  economicEventId,
  isEconomicEventRecordShape,
  isEconomicEventText,
  type EconomicEventImpact,
  type EconomicEventRecord,
} from '../../domain/economic-calendar/economicEvent';
import { economicEventSize } from '../../domain/economic-calendar/newsImpact';
import { projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import { isVisualPnlDayKey, shiftVisualPnlDayKey, visualPnlMondayFirstWeekday } from '../visual-pnl/dayKeyCalendar';
import { readVisualPnlTimeZonePreference } from '../visual-pnl/timeZonePreference';

/** The most typed news events kept on this device; a save beyond it is refused, and no old event is ever deleted on its own (D124). */
export const ECONOMIC_EVENT_MAX_SAVED = 1000;

export interface TypedEconomicEventInput {
  readonly title: string;
  /** The date and time as this device's clock shows it, from a datetime-local field: YYYY-MM-DDTHH:mm (seconds allowed). */
  readonly startsAt: string;
  /** Blank = none. */
  readonly currency: string;
  readonly impact: EconomicEventImpact | null;
  readonly expected: string;
  readonly previous: string;
  readonly actual: string;
}
export type TypedEconomicEventField = 'title' | 'startsAt' | 'currency' | 'impact' | 'expected' | 'previous' | 'actual';
export type SaveTypedEconomicEventResult =
  | Readonly<{ ok: true; event: EconomicEventRecord }>
  | Readonly<{
      ok: false;
      type: 'validation-error';
      field: TypedEconomicEventField;
    }>
  | Readonly<{ ok: false; type: 'limit-reached'; limit: number }>
  | Readonly<{ ok: false; type: 'storage-error' }>;
export type DeleteEconomicEventResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; type: 'not-typed' }>
  | Readonly<{ ok: false; type: 'storage-error' }>;

const DEVICE_CLOCK_PATTERN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
/** A datetime-local value read on this device's clock, as the trade form's times are (manualTradeExecutionDraft.ts:20-24); null for anything else, such as 30 February. */
function instantFromDeviceClock(value: string): string | null {
  const text = value.trim();
  const match = DEVICE_CLOCK_PATTERN.exec(text);
  if (match === null || !isVisualPnlDayKey(match[1])) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
/** Blank → null; kept text → the trimmed text; refused → undefined. */
function optionalValue(value: string): string | null | undefined {
  const text = value.trim();
  if (text === '') return null;
  return isEconomicEventText(text, ECONOMIC_EVENT_LIMITS.value) ? text : undefined;
}
const refuse = (field: TypedEconomicEventField) => Object.freeze({ ok: false as const, field });

/** The record a typed event is saved as: the name and values trimmed, the currency in capitals, the time as a UTC instant. */
export function parseTypedEconomicEvent(
  input: TypedEconomicEventInput,
  key: string,
  savedAt: string,
): Readonly<{ ok: true; event: EconomicEventRecord } | { ok: false; field: TypedEconomicEventField }> {
  const title = input.title.trim();
  if (!isEconomicEventText(title, ECONOMIC_EVENT_LIMITS.title)) return refuse('title');
  const startsAt = instantFromDeviceClock(input.startsAt);
  if (startsAt === null) return refuse('startsAt');
  const currency = input.currency.trim().toUpperCase();
  if (currency !== '' && !/^[A-Z]{3}$/.test(currency)) return refuse('currency');
  if (input.impact !== null && !(ECONOMIC_EVENT_IMPACTS as readonly string[]).includes(input.impact)) return refuse('impact');
  const expected = optionalValue(input.expected);
  if (expected === undefined) return refuse('expected');
  const previous = optionalValue(input.previous);
  if (previous === undefined) return refuse('previous');
  const actual = optionalValue(input.actual);
  if (actual === undefined) return refuse('actual');
  const event: EconomicEventRecord = Object.freeze({
    id: economicEventId('typed', key),
    source: 'typed' as const,
    title,
    currency: currency === '' ? null : currency,
    startsAt,
    impact: input.impact,
    expected,
    previous,
    actual,
    savedAt,
    fetchedAt: null,
  });
  return isEconomicEventRecordShape(event) ? Object.freeze({ ok: true as const, event }) : refuse('title');
}

export interface SaveTypedEconomicEventDependencies {
  readonly now?: () => string;
  readonly createKey?: () => string;
}

/** Saves one typed news event in one atomic write, unless ECONOMIC_EVENT_MAX_SAVED are already kept. */
export async function saveTypedEconomicEvent(
  db: KairosDatabase,
  input: TypedEconomicEventInput,
  dependencies: SaveTypedEconomicEventDependencies = {},
): Promise<SaveTypedEconomicEventResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const createKey = dependencies.createKey ?? createEconomicEventKey;
  const parsed = parseTypedEconomicEvent(input, createKey(), now());
  if (!parsed.ok)
    return Object.freeze({
      ok: false as const,
      type: 'validation-error' as const,
      field: parsed.field,
    });
  const event = parsed.event;
  try {
    const saved = await runKairosAtomicWrite(db, ['economicEvents'], async ({ repositories }) => {
      if ((await repositories.economicEvents.countTyped()) >= ECONOMIC_EVENT_MAX_SAVED) return false;
      await repositories.economicEvents.put(event);
      return true;
    });
    return saved
      ? Object.freeze({ ok: true as const, event })
      : Object.freeze({
          ok: false as const,
          type: 'limit-reached' as const,
          limit: ECONOMIC_EVENT_MAX_SAVED,
        });
  } catch {
    return Object.freeze({
      ok: false as const,
      type: 'storage-error' as const,
    });
  }
}

/** Deletes one typed news event in one atomic write; an id that is not saved is fine. Fetched news is never deleted here. */
export async function deleteEconomicEvent(db: KairosDatabase, id: string): Promise<DeleteEconomicEventResult> {
  if (!id.startsWith('typed:')) return Object.freeze({ ok: false as const, type: 'not-typed' as const });
  try {
    await runKairosAtomicWrite(db, ['economicEvents'], ({ repositories }) => repositories.economicEvents.delete(id));
    return Object.freeze({ ok: true as const });
  } catch {
    return Object.freeze({
      ok: false as const,
      type: 'storage-error' as const,
    });
  }
}

export interface EconomicCalendarDay {
  readonly dayKey: string;
  readonly events: readonly EconomicEventRecord[];
}
export type EconomicCalendarWeekResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
      kind: 'ready';
      timeZone: string;
      weekStartDayKey: string;
      thisWeekStartDayKey: string;
      days: readonly EconomicCalendarDay[];
      savedCount: number;
    }>;

/** The Monday on or before a day: weeks run Monday to Sunday, as the results calendar does. */
export function economicCalendarWeekStart(dayKey: string): string {
  return shiftVisualPnlDayKey(dayKey, -visualPnlMondayFirstWeekday(dayKey));
}

function byTime(a: EconomicEventRecord, b: EconomicEventRecord): number {
  return a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

/** Only the news marked big (by the trader or by Kairos's list); a day left with none is dropped. */
export function onlyBigNews(days: readonly EconomicCalendarDay[]): readonly EconomicCalendarDay[] {
  return Object.freeze(
    days
      .map((day) =>
        Object.freeze({
          dayKey: day.dayKey,
          events: Object.freeze(day.events.filter((event) => economicEventSize(event).size === 'high')),
        }),
      )
      .filter((day) => day.events.length > 0),
  );
}

/** One week of saved news, Monday to Sunday, grouped by day in the saved time zone. */
export async function loadEconomicCalendarWeek(
  db: KairosDatabase,
  options: { readonly now: string; readonly weekStartDayKey?: string | null },
): Promise<EconomicCalendarWeekResult> {
  const repositories = createKairosRepositories(db);
  const timeZone = await readVisualPnlTimeZonePreference(repositories.metadata);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  const today = projectVisualPnlDayKey(options.now, timeZone);
  if (!today.available) return Object.freeze({ kind: 'unavailable' as const });
  const thisWeek = economicCalendarWeekStart(today.dayKey);
  const wanted = options.weekStartDayKey;
  const start = typeof wanted === 'string' && isVisualPnlDayKey(wanted) ? economicCalendarWeekStart(wanted) : thisWeek;
  const end = shiftVisualPnlDayKey(start, 7);
  // One day of padding on each side holds the week in every time zone (closedTradePeriodQuery.ts).
  const [rows, savedCount] = await Promise.all([
    repositories.economicEvents.listStartingBetween(
      `${shiftVisualPnlDayKey(start, -1)}T00:00:00.000Z`,
      `${shiftVisualPnlDayKey(end, 1)}T00:00:00.000Z`,
    ),
    repositories.economicEvents.countTyped(),
  ]);
  const byDay = new Map<string, EconomicEventRecord[]>();
  for (const row of rows) {
    if (!isEconomicEventRecordShape(row)) continue;
    const day = projectVisualPnlDayKey(row.startsAt, timeZone);
    if (!day.available || day.dayKey < start || day.dayKey >= end) continue;
    const list = byDay.get(day.dayKey) ?? [];
    list.push(row);
    byDay.set(day.dayKey, list);
  }
  const days = [...byDay.keys()].sort().map((dayKey) =>
    Object.freeze({
      dayKey,
      events: Object.freeze([...(byDay.get(dayKey) ?? [])].sort(byTime)),
    }),
  );
  return Object.freeze({
    kind: 'ready' as const,
    timeZone,
    weekStartDayKey: start,
    thisWeekStartDayKey: thisWeek,
    days: Object.freeze(days),
    savedCount,
  });
}
