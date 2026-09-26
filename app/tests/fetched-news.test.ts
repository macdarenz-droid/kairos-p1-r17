import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEconomicCalendarWeek } from '../src/application/economic-calendar/economicEvents';
import {
  NEWS_COVERAGE_KEY,
  isNewsRefreshDue,
  isNewsWeekChecked,
  loadNewsCalendarCoverage,
  mapNewsCalendar,
  mergeNewsCoverage,
  parseNewsCalendarCoverage,
  pickNewsFailure,
  refreshNewsCalendar,
  type NewsApiPort,
  type NewsCalendarCoverage,
} from '../src/application/economic-calendar/fetchedNews';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import type { KairosApiFailure, KairosApiResult } from '../src/services/kairos-api/kairosApi';
import type { NewsCalendarAnswer } from '../src/services/kairos-api/newsApi';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(label: string): Promise<KairosDatabase> {
  const name = `kairos-fetched-news-${label}-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  opened.push(db);
  await openKairosDatabase(db);
  return db;
}

const now = '2026-09-24T04:00:00.000Z';
const fetchedAt = '2026-09-24T03:00:00.000Z';
const COVERS = { from: '2026-09-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z' };
const key = (n: number) => n.toString(16).padStart(16, '0');
const answer = (source: string, events: NewsCalendarAnswer['events'], covers: NewsCalendarAnswer['covers'] = events.length > 0 ? COVERS : null): NewsCalendarAnswer =>
  ({ source, fetchedAt, covers, events, leftOut: 0 });
const ok = (value: NewsCalendarAnswer): KairosApiResult<NewsCalendarAnswer> => ({ ok: true, value });
const TRANSPORT: KairosApiFailure = { ok: false, reason: 'transport-failed' };
const server = (reason: string, status = 502): KairosApiFailure => ({ ok: false, reason: 'unavailable', serverReason: reason, retryAfterSeconds: 30, status });
function fakePort(answers: Partial<Record<string, KairosApiResult<NewsCalendarAnswer>>>, setUp = true) {
  const calendar = vi.fn(async (source: string) => answers[source] ?? ok(answer(source, [])));
  const port: NewsApiPort = { setUp, calendar, headlines: vi.fn() };
  return { port, calendar };
}
const CPI = { key: key(1), title: 'Consumer Price Index', startsAt: '2026-09-24T12:30:00.000Z' };
const fetchedRow = (source: 'fed' | 'bls', n: number, startsAt: string, title = 'FOMC Meeting'): EconomicEventRecord =>
  ({ id: economicEventId(source, key(n)), source, title, currency: 'USD', startsAt, impact: null, expected: null, previous: null, actual: null, savedAt: fetchedAt, fetchedAt });
const typedRow: EconomicEventRecord = { id: economicEventId('typed', 'mine'), source: 'typed', title: 'My note', currency: null, startsAt: '2026-09-24T12:30:00.000Z', impact: 'high', expected: null, previous: null, actual: null, savedAt: fetchedAt, fetchedAt: null };

describe('mapping and coverage', () => {
  it('saves only listed releases, as fetched rows sized on read', () => {
    const rows = mapNewsCalendar('bls', answer('bls', [CPI, { key: key(2), title: 'Real Earnings', startsAt: '2026-09-24T12:30:00.000Z' }]), now);
    expect(rows).toEqual([{ id: `bls:${key(1)}`, source: 'bls', title: 'Consumer Price Index', currency: 'USD', startsAt: CPI.startsAt, impact: null, expected: null, previous: null, actual: null, savedAt: now, fetchedAt }]);
  });

  it('joins windows that overlap per source, keeps sources apart, and trims below what the cap removed', () => {
    const coverage: NewsCalendarCoverage = { refreshedAt: null, windows: [{ source: 'bls', from: '2026-09-01T00:00:00.000Z', to: '2026-09-20T00:00:00.000Z', fetchedAt: '2026-09-01T00:00:00.000Z' }] };
    const added = [
      { source: 'bls' as const, from: '2026-09-15T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', fetchedAt },
      { source: 'ecb' as const, from: '2026-09-10T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z', fetchedAt },
    ];
    expect(mergeNewsCoverage(coverage, added, now, null)).toEqual({ refreshedAt: now, windows: [
      { source: 'bls', from: '2026-09-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', fetchedAt },
      { source: 'ecb', from: '2026-09-10T00:00:00.000Z', to: '2026-09-30T00:00:00.000Z', fetchedAt },
    ] });
    expect(mergeNewsCoverage(coverage, added, now, '2026-09-05T00:00:00.000Z').windows[0].from).toBe('2026-09-05T00:00:00.001Z');
    const touching = mergeNewsCoverage(coverage, [{ source: 'bls', from: '2026-09-20T00:00:00.000Z', to: '2026-09-25T00:00:00.000Z', fetchedAt }], now, null);
    expect(touching.windows).toHaveLength(1);
    expect(mergeNewsCoverage(coverage, [], now, '2026-09-20T00:00:00.000Z').windows).toEqual([]);
  });

  it('keeps the 60 windows reaching latest', () => {
    const many = Array.from({ length: 65 }, (_, day) => ({ source: 'fed' as const, from: new Date(Date.UTC(2026, 0, 1 + day * 2)).toISOString(), to: new Date(Date.UTC(2026, 0, 1 + day * 2, 12)).toISOString(), fetchedAt }));
    const kept = mergeNewsCoverage({ refreshedAt: null, windows: [] }, many, now, null).windows;
    expect(kept).toHaveLength(60);
    expect(kept[0].from).toBe(many[5].from);
  });

  it('says a week is checked only when a window covers it with a day either side', () => {
    const covering = { refreshedAt: now, windows: [{ source: 'bls' as const, from: '2026-09-01T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', fetchedAt }] };
    expect(isNewsWeekChecked(covering, 'bls', '2026-09-21')).toBe(true);
    expect(isNewsWeekChecked(covering, 'bea', '2026-09-21')).toBe(false);
    const late = { refreshedAt: now, windows: [{ source: 'bls' as const, from: '2026-09-21T00:00:00.000Z', to: '2026-10-31T00:00:00.000Z', fetchedAt }] };
    expect(isNewsWeekChecked(late, 'bls', '2026-09-21')).toBe(false);
    const early = { refreshedAt: now, windows: [{ source: 'bls' as const, from: '2026-09-01T00:00:00.000Z', to: '2026-09-28T00:00:00.000Z', fetchedAt }] };
    expect(isNewsWeekChecked(early, 'bls', '2026-09-21')).toBe(false);
  });

  it('reads an unreadable record as no coverage, and a refresh is due after 30 minutes', () => {
    expect(parseNewsCalendarCoverage('not json')).toEqual({ refreshedAt: null, windows: [] });
    expect(parseNewsCalendarCoverage(undefined)).toEqual({ refreshedAt: null, windows: [] });
    expect(parseNewsCalendarCoverage(JSON.stringify({ version: 2, refreshedAt: now, windows: [] }))).toEqual({ refreshedAt: null, windows: [] });
    expect(parseNewsCalendarCoverage(JSON.stringify({ version: 1, refreshedAt: now, windows: [{ source: 'nope', from: now, to: now, fetchedAt }, { source: 'bls', from: '2026-09-01', to: now, fetchedAt }] }))).toEqual({ refreshedAt: now, windows: [] });
    expect(isNewsRefreshDue('2026-09-24T03:31:00.000Z', now)).toBe(false);
    expect(isNewsRefreshDue('2026-09-24T03:30:00.000Z', now)).toBe(true);
    expect(isNewsRefreshDue(null, now)).toBe(true);
  });

  it('picks the one failure to describe', () => {
    const limited = server('rate-limited', 429);
    expect(pickNewsFailure([TRANSPORT, limited])).toBe(limited);
    expect(pickNewsFailure([server('source-unavailable'), TRANSPORT])).toBe(TRANSPORT);
    const first = server('source-unavailable');
    expect(pickNewsFailure([first, server('not-found', 404)])).toBe(first);
    expect(pickNewsFailure([TRANSPORT, { ok: false, reason: 'not-set-up' }])).toEqual({ ok: false, reason: 'not-set-up' });
    expect(pickNewsFailure([])).toEqual({ ok: false, reason: 'transport-failed' });
  });
});

describe('refreshing the saved calendar', () => {
  it('saves what the sources answered, replaces a source\'s rows inside its window, and keeps the rest', async () => {
    const db = await database('refresh');
    const outside = fetchedRow('bls', 9, '2026-08-20T12:30:00.000Z', 'Consumer Price Index');
    await db.economicEvents.bulkPut([typedRow, outside]);
    const first = fakePort({ bls: ok(answer('bls', [CPI])) });
    const result = await refreshNewsCalendar(db, first.port, { now });
    expect(result).toMatchObject({ ok: true, refreshedAt: now });
    expect(result.outcomes.find((outcome) => outcome.source === 'bls')).toEqual({ source: 'bls', ok: true, saved: 1 });
    expect(first.calendar).toHaveBeenCalledTimes(9);
    expect((await db.economicEvents.toArray()).map((row) => row.id).sort()).toEqual([`bls:${key(1)}`, outside.id, typedRow.id].sort());
    expect(await loadNewsCalendarCoverage(db)).toEqual({ refreshedAt: now, windows: [{ source: 'bls', ...COVERS, fetchedAt }] });

    const moved = { key: key(3), title: 'Consumer Price Index', startsAt: '2026-09-24T12:45:00.000Z' };
    expect(await refreshNewsCalendar(db, fakePort({ bls: ok(answer('bls', [moved])) }).port, { now })).toMatchObject({ ok: true });
    expect((await db.economicEvents.toArray()).map((row) => row.id).sort()).toEqual([`bls:${key(3)}`, outside.id, typedRow.id].sort());

    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'Asia/Manila', now);
    const week = await loadEconomicCalendarWeek(db, { now, weekStartDayKey: '2026-09-21' });
    expect(week).toMatchObject({ kind: 'ready', refreshedAt: now, checkedSources: ['bls'] });
  });

  it('writes nothing when no source answered, and describes one failure', async () => {
    const db = await database('none');
    const all = Object.fromEntries(['fed', 'bls', 'bea', 'census', 'ecb', 'eurostat', 'ons', 'boc', 'rba'].map((source) => [source, TRANSPORT]));
    expect(await refreshNewsCalendar(db, fakePort(all).port, { now })).toMatchObject({ ok: false, reason: 'unavailable', failure: { ok: false, reason: 'transport-failed' } });
    expect(await db.metadata.get(NEWS_COVERAGE_KEY)).toBeUndefined();
    const limited = server('rate-limited', 429);
    expect(await refreshNewsCalendar(db, fakePort({ ...all, ecb: limited }).port, { now })).toMatchObject({ ok: false, reason: 'unavailable', failure: limited });
    expect(await db.economicEvents.count()).toBe(0);
  });

  it('asks nothing when the build has no server address', async () => {
    const db = await database('not-set-up');
    const { port, calendar } = fakePort({}, false);
    const result = await refreshNewsCalendar(db, port, { now });
    expect(result).toMatchObject({ ok: false, reason: 'unavailable', failure: { ok: false, reason: 'not-set-up' } });
    expect(result.outcomes).toHaveLength(9);
    expect(calendar).not.toHaveBeenCalled();
  });

  it('saves the others when one source fails, and names that failure', async () => {
    const db = await database('one-fails');
    const failure = server('source-unavailable');
    const result = await refreshNewsCalendar(db, fakePort({ bls: ok(answer('bls', [CPI])), ecb: failure }).port, { now });
    expect(result.ok).toBe(true);
    expect(result.outcomes.find((outcome) => outcome.source === 'ecb')).toEqual({ source: 'ecb', ok: false, failure });
    expect(await db.economicEvents.count()).toBe(1);
  });

  it('a port that throws reads as no connection', async () => {
    const db = await database('throws');
    const port: NewsApiPort = { setUp: true, calendar: vi.fn(async () => { throw new Error('boom'); }), headlines: vi.fn() };
    expect(await refreshNewsCalendar(db, port, { now })).toMatchObject({ ok: false, reason: 'unavailable', failure: { ok: false, reason: 'transport-failed' } });
  });

  it('keeps at most 5,000 fetched rows: the oldest go and the coverage no longer claims them', async () => {
    const db = await database('cap');
    const start = Date.parse('2025-01-01T00:00:00.000Z');
    const fed = Array.from({ length: 4_999 }, (_, n) => fetchedRow('fed', 100_000 + n, new Date(start + n * 3_600_000).toISOString()));
    await db.economicEvents.bulkPut([...fed, typedRow]);
    await db.metadata.put({ key: NEWS_COVERAGE_KEY, value: JSON.stringify({ version: 1, refreshedAt: null, windows: [{ source: 'fed', from: '2025-01-01T00:00:00.000Z', to: '2025-08-01T00:00:00.000Z', fetchedAt }] }), updatedAt: now });
    const three = ['Consumer Price Index', 'Employment Situation', 'Producer Price Index'].map((title, n) => ({ key: key(10 + n), title, startsAt: `2026-10-0${n + 1}T12:30:00.000Z` }));
    expect(await refreshNewsCalendar(db, fakePort({ bls: ok(answer('bls', three)) }).port, { now })).toMatchObject({ ok: true });
    expect((await db.economicEvents.count()) - 1).toBe(5_000);
    expect(await db.economicEvents.get(fed[0].id)).toBeUndefined();
    expect(await db.economicEvents.get(fed[1].id)).toBeUndefined();
    expect(await db.economicEvents.get(fed[2].id)).toBeDefined();
    expect(await db.economicEvents.get(typedRow.id)).toBeDefined();
    const coverage = await loadNewsCalendarCoverage(db);
    expect(coverage.windows.find((window) => window.source === 'fed')?.from).toBe('2025-01-01T01:00:00.001Z');
  });

  it('keeps the old rows when saving fails', async () => {
    const db = await database('storage');
    await db.economicEvents.put(fetchedRow('bls', 1, CPI.startsAt, 'Consumer Price Index'));
    vi.spyOn(db.economicEvents, 'bulkPut').mockRejectedValue(new Error('disk full'));
    const moved = { key: key(3), title: 'Consumer Price Index', startsAt: '2026-09-24T12:45:00.000Z' };
    expect(await refreshNewsCalendar(db, fakePort({ bls: ok(answer('bls', [moved])) }).port, { now })).toMatchObject({ ok: false, reason: 'storage-error' });
    expect((await db.economicEvents.toArray()).map((row) => row.id)).toEqual([`bls:${key(1)}`]);
    expect(await db.metadata.get(NEWS_COVERAGE_KEY)).toBeUndefined();
  });
});
