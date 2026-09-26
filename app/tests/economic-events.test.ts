import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ECONOMIC_EVENT_MAX_SAVED,
  deleteEconomicEvent,
  economicCalendarWeekStart,
  loadEconomicCalendarWeek,
  onlyBigNews,
  parseTypedEconomicEvent,
  saveTypedEconomicEvent,
  type EconomicCalendarDay,
  type TypedEconomicEventInput,
} from '../src/application/economic-calendar/economicEvents';
import { loadNewsNearTrades } from '../src/application/economic-calendar/newsNearTrades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { economicEventId, type EconomicEventImpact, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-news-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const now = '2026-09-24T04:00:00.000Z';
const savedAt = '2026-09-20T08:00:00.000Z';
function event(key: string, title: string, currency: string | null, startsAt: string, impact: EconomicEventImpact | null, values: Partial<Pick<EconomicEventRecord, 'expected' | 'previous'>> = {}): EconomicEventRecord {
  return { id: economicEventId('typed', key), source: 'typed', title, currency, startsAt, impact, expected: values.expected ?? null, previous: values.previous ?? null, actual: null, savedAt };
}
const CPI = event('cpi', 'US CPI', 'USD', '2026-09-24T12:30:00.000Z', 'high', { expected: '3.1%', previous: '2.9%' });
const SPEECH = event('speech', 'ECB President speaks', 'EUR', '2026-09-24T09:00:00.000Z', 'medium');
const OPEC = event('opec', 'OPEC meeting', null, '2026-09-20T16:00:00.000Z', 'high');
const JOBS = event('jobs', 'US jobs report', 'USD', '2026-09-27T16:30:00.000Z', 'high');
const HOLIDAY = event('holiday', 'Japan bank holiday', 'JPY', '2026-09-20T15:59:00.000Z', 'low');
const ALL = [CPI, SPEECH, OPEC, JOBS, HOLIDAY];

async function withNews(label: string, zone = true): Promise<KairosDatabase> {
  const db = await current(label);
  if (zone) await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'Asia/Manila', now);
  await db.economicEvents.bulkPut(ALL);
  return db;
}
const typed: TypedEconomicEventInput = { title: ' US CPI ', startsAt: '2026-09-24T20:30', currency: ' usd ', impact: 'high', expected: ' 3.1% ', previous: '', actual: '' };
const titles = (days: readonly EconomicCalendarDay[]) => days.map((day) => ({ dayKey: day.dayKey, events: day.events.map((item) => item.id) }));

describe('T-046c typed news: parse', () => {
  it('keeps the trimmed name and values, the currency in capitals and the device-clock time as a UTC instant', () => {
    expect(parseTypedEconomicEvent(typed, 'k-1', savedAt)).toEqual({
      ok: true,
      event: { id: 'typed:k-1', source: 'typed', title: 'US CPI', currency: 'USD', startsAt: new Date('2026-09-24T20:30').toISOString(), impact: 'high', expected: '3.1%', previous: null, actual: null, savedAt },
    });
  });

  it('refuses each bad field by name', () => {
    const field = (patch: Partial<TypedEconomicEventInput>) => {
      const result = parseTypedEconomicEvent({ ...typed, ...patch }, 'k-1', savedAt);
      return result.ok ? null : result.field;
    };
    for (const title of ['', '   ', 'x'.repeat(81), 'US\tCPI']) expect(field({ title })).toBe('title');
    for (const startsAt of ['', '2026-09-24', '2026-02-30T10:00', '2026-09-24T24:00', '2026-09-24T20:30:00.000Z']) expect(field({ startsAt })).toBe('startsAt');
    for (const currency of ['US', 'USDT', '1$A']) expect(field({ currency })).toBe('currency');
    expect(field({ impact: 'huge' as EconomicEventImpact })).toBe('impact');
    for (const key of ['expected', 'previous', 'actual'] as const) expect(field({ [key]: 'x'.repeat(17) })).toBe(key);
  });
});

describe('T-046c typed news: save and delete', () => {
  it('saves one row equal to the parsed record, and a refusal writes nothing', async () => {
    const db = await current('save');
    const result = await saveTypedEconomicEvent(db, typed, { now: () => savedAt, createKey: () => 'k-1' });
    const parsed = parseTypedEconomicEvent(typed, 'k-1', savedAt);
    if (!parsed.ok) throw new Error('parse');
    expect(result).toEqual({ ok: true, event: parsed.event });
    expect(await db.economicEvents.toArray()).toEqual([parsed.event]);
    expect(await saveTypedEconomicEvent(db, { ...typed, title: '' }, { now: () => savedAt, createKey: () => 'k-2' })).toEqual({ ok: false, type: 'validation-error', field: 'title' });
    expect(await db.economicEvents.count()).toBe(1);
  });

  it('keeps at most 1,000 events', async () => {
    const db = await current('limit');
    await db.economicEvents.bulkPut(Array.from({ length: 999 }, (_, index) => event(`fill-${index}`, `News ${index}`, null, '2026-09-01T00:00:00.000Z', null)));
    expect((await saveTypedEconomicEvent(db, typed, { now: () => savedAt, createKey: () => 'k-999' })).ok).toBe(true);
    expect(await db.economicEvents.count()).toBe(ECONOMIC_EVENT_MAX_SAVED);
    expect(await saveTypedEconomicEvent(db, typed, { now: () => savedAt, createKey: () => 'k-1000' })).toEqual({ ok: false, type: 'limit-reached', limit: 1000 });
    expect(await db.economicEvents.count()).toBe(1000);
  });

  it('says a failed write is a storage error', async () => {
    const db = await current('save-error');
    vi.spyOn(db.economicEvents, 'put').mockRejectedValue(new Error('disk full'));
    expect(await saveTypedEconomicEvent(db, typed, { now: () => savedAt, createKey: () => 'k-1' })).toEqual({ ok: false, type: 'storage-error' });
  });

  it('deletes a saved event; an unknown id is fine; a failed delete keeps the row', async () => {
    const db = await withNews('delete');
    expect(await deleteEconomicEvent(db, 'typed:cpi')).toEqual({ ok: true });
    expect(await db.economicEvents.get('typed:cpi')).toBeUndefined();
    expect(await deleteEconomicEvent(db, 'typed:nothing')).toEqual({ ok: true });
    vi.spyOn(db.economicEvents, 'delete').mockRejectedValue(new Error('disk full'));
    expect(await deleteEconomicEvent(db, 'typed:opec')).toEqual({ ok: false, type: 'storage-error' });
    expect(await db.economicEvents.get('typed:opec')).toEqual(OPEC);
  });
});

describe('T-046c one week of news in the saved time zone', () => {
  it('reads this week, Monday to Sunday, by day in Manila', async () => {
    const db = await withNews('week');
    const week = await loadEconomicCalendarWeek(db, { now });
    expect(week).toMatchObject({ kind: 'ready', timeZone: 'Asia/Manila', weekStartDayKey: '2026-09-21', thisWeekStartDayKey: '2026-09-21', savedCount: 5 });
    if (week.kind !== 'ready') throw new Error(week.kind);
    expect(titles(week.days)).toEqual([
      { dayKey: '2026-09-21', events: [OPEC.id] },
      { dayKey: '2026-09-24', events: [SPEECH.id, CPI.id] },
    ]);
    expect(titles(onlyBigNews(week.days))).toEqual([
      { dayKey: '2026-09-21', events: [OPEC.id] },
      { dayKey: '2026-09-24', events: [CPI.id] },
    ]);
  });

  it('reads another week, from any day in it; a bad day reads this week', async () => {
    const db = await withNews('weeks');
    const next = await loadEconomicCalendarWeek(db, { now, weekStartDayKey: '2026-09-28' });
    if (next.kind !== 'ready') throw new Error(next.kind);
    expect(titles(next.days)).toEqual([{ dayKey: '2026-09-28', events: [JOBS.id] }]);
    const before = await loadEconomicCalendarWeek(db, { now, weekStartDayKey: '2026-09-17' });
    if (before.kind !== 'ready') throw new Error(before.kind);
    expect(before.weekStartDayKey).toBe('2026-09-14');
    expect(titles(before.days)).toEqual([{ dayKey: '2026-09-20', events: [HOLIDAY.id] }]);
    expect(await loadEconomicCalendarWeek(db, { now, weekStartDayKey: 'bad' })).toMatchObject({ kind: 'ready', weekStartDayKey: '2026-09-21' });
  });

  it('leaves a damaged row out of the days but counts it', async () => {
    const db = await withNews('damaged');
    await db.economicEvents.put({ ...CPI, id: economicEventId('typed', 'bad'), title: '' });
    const week = await loadEconomicCalendarWeek(db, { now });
    if (week.kind !== 'ready') throw new Error(week.kind);
    expect(week.savedCount).toBe(6);
    expect(titles(week.days)).toEqual([
      { dayKey: '2026-09-21', events: [OPEC.id] },
      { dayKey: '2026-09-24', events: [SPEECH.id, CPI.id] },
    ]);
  });

  it('needs a saved time zone and a good clock', async () => {
    expect(await loadEconomicCalendarWeek(await withNews('no-zone', false), { now })).toEqual({ kind: 'time-zone-unconfigured' });
    expect(await loadEconomicCalendarWeek(await withNews('bad-now'), { now: 'bad' })).toEqual({ kind: 'unavailable' });
  });

  it('starts a week on its Monday', () => {
    expect(economicCalendarWeekStart('2026-09-27')).toBe('2026-09-21');
    expect(economicCalendarWeekStart('2026-09-21')).toBe('2026-09-21');
  });
});

describe('T-046c the big news near the trades on a page', () => {
  const A = { id: 'a', status: 'closed', openedAt: '2026-09-24T12:42:00.000Z', closedAt: '2026-09-24T13:30:00.000Z' } as const;
  const B = { id: 'b', status: 'closed', openedAt: '2026-09-25T09:00:00.000Z', closedAt: '2026-09-25T10:00:00.000Z' } as const;
  const C = { id: 'c', status: 'open', openedAt: '2026-09-24T12:40:00.000Z', closedAt: null } as const;
  const LATE = event('late', 'Late big news', 'USD', '2026-09-25T10:20:00.000Z', 'high');
  const MEDIUM = event('medium', 'Medium news', 'USD', '2026-09-24T12:35:00.000Z', 'medium');

  it('finds each closed trade its big news in one read', async () => {
    const db = await withNews('near');
    await db.economicEvents.bulkPut([LATE, MEDIUM]);
    const near = await loadNewsNearTrades(db, [A, B, C]);
    const plain = Object.fromEntries([...near].map(([id, items]) => [id, items.map((item) => ({ id: item.event.id, relation: item.relation, minutes: item.minutes }))]));
    expect(plain).toEqual({
      a: [{ id: CPI.id, relation: 'before-open', minutes: 12 }],
      b: [{ id: LATE.id, relation: 'after-close', minutes: 20 }],
    });
  });

  it('reads nothing when no trade is closed', async () => {
    const db = await withNews('near-none');
    const where = vi.spyOn(db.economicEvents, 'where');
    expect((await loadNewsNearTrades(db, [C])).size).toBe(0);
    expect(where).not.toHaveBeenCalled();
  });
});
