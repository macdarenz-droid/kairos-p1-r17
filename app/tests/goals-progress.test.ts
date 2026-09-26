import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGoalsProgress, projectGoalsProgress, writeGoalsPreference, EMPTY_GOALS_PREFERENCE } from '../src/application/goals';
import type { JournalHistoryEntry } from '../src/application/journal';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p26-2-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

type Status = 'open' | 'closed' | 'draft';
function entry(id: string, status: Status, openedAt: string | null, closedAt: string | null, amount: string | null, currency: string | null): JournalHistoryEntry {
  const trade = { id, symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status, source: 'manual', openedAt, closedAt, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' } as unknown as JournalHistoryEntry['trade'];
  const visualPnl = amount === null
    ? { outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none' } as const
    : { outcome: amount.startsWith('-') ? 'loss' : amount === '0' ? 'breakeven' : 'profit', label: amount.startsWith('-') ? 'Loss' : 'Profit', amount: amount as DecimalString, currency, source: 'net-pnl' } as const;
  return { trade, plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl } as unknown as JournalHistoryEntry;
}
const now = '2026-09-18T14:30:00.000Z';
const preference = { tradesPerMonthTarget: 4, maxTradesPerDay: 2, monthlyResultTarget: { amount: '250' as DecimalString, currency: 'USDT' } } as const;

describe('P26.2 goals progress projection', () => {
  it('counts closed trades this month and trades opened today from the released day-key contract, and sums the month result only over comparable days', () => {
    const entries = [
      entry('m1', 'closed', '2026-09-02T09:00:00.000Z', '2026-09-02T10:00:00.000Z', '100', 'USDT'),
      entry('m2', 'closed', '2026-09-10T09:00:00.000Z', '2026-09-10T10:00:00.000Z', '-20.5', 'USDT'),
      entry('t1', 'closed', '2026-09-18T01:00:00.000Z', '2026-09-18T02:00:00.000Z', '80', 'USDT'),
      entry('t2', 'open', '2026-09-18T12:00:00.000Z', null, null, null),
      entry('t3', 'open', '2026-09-18T13:00:00.000Z', null, null, null),
      entry('old', 'closed', '2026-08-30T09:00:00.000Z', '2026-08-30T10:00:00.000Z', '999', 'USDT'),
      entry('other', 'closed', '2026-09-11T09:00:00.000Z', '2026-09-11T10:00:00.000Z', '50', 'EUR'),
      entry('draft', 'draft', null, null, null, null),
    ];
    const progress = projectGoalsProgress({ preference, entries, timeZone: 'UTC', now });
    expect(progress).toEqual({
      kind: 'ready', timeZone: 'UTC', todayKey: '2026-09-18', monthKey: '2026-09', consideredEntries: 8,
      tradesPerMonth: { kind: 'progress', target: 4, current: 4, reached: true },
      maxTradesPerDay: { kind: 'limit', limit: 2, today: 3, remaining: 0, exceeded: true },
      monthlyResult: { kind: 'progress', target: '250', currency: 'USDT', current: '159.5', remaining: '90.5', reached: false, comparableDays: 3, incompleteDays: 1 },
    });
  });

  it('projects a reached result target, a limit with room left, and unset goals without inventing evidence', () => {
    const entries = [entry('a', 'closed', '2026-09-05T09:00:00.000Z', '2026-09-05T10:00:00.000Z', '300', 'USDT'), entry('b', 'open', '2026-09-18T12:00:00.000Z', null, null, null)];
    const progress = projectGoalsProgress({ preference, entries, timeZone: 'UTC', now });
    expect(progress).toMatchObject({ tradesPerMonth: { current: 1, reached: false }, maxTradesPerDay: { today: 1, remaining: 1, exceeded: false }, monthlyResult: { kind: 'progress', current: '300', remaining: '0', reached: true } });
    expect(projectGoalsProgress({ preference: EMPTY_GOALS_PREFERENCE, entries, timeZone: 'UTC', now })).toMatchObject({ kind: 'ready', tradesPerMonth: { kind: 'unset' }, maxTradesPerDay: { kind: 'unset' }, monthlyResult: { kind: 'unset' } });
  });

  it('reports the result target as unavailable when no month day is comparable, and the whole projection as unavailable for an invalid time zone or instant', () => {
    const entries = [entry('x', 'closed', '2026-09-05T09:00:00.000Z', '2026-09-05T10:00:00.000Z', '10', 'EUR'), entry('y', 'closed', '2026-09-06T09:00:00.000Z', '2026-09-06T10:00:00.000Z', null, null)];
    expect(projectGoalsProgress({ preference, entries, timeZone: 'UTC', now })).toMatchObject({ monthlyResult: { kind: 'unavailable', reason: 'no-comparable-days', incompleteDays: 2 }, tradesPerMonth: { current: 2 } });
    expect(projectGoalsProgress({ preference, entries, timeZone: 'Not/AZone', now })).toEqual({ kind: 'unavailable', reason: 'invalid-time-zone' });
    expect(projectGoalsProgress({ preference, entries, timeZone: 'UTC', now: 'yesterday' })).toEqual({ kind: 'unavailable', reason: 'invalid-now' });
  });

  it('follows the calendar of the explicit time zone, never the device', () => {
    // 21:00Z is still the 17th in UTC and 23:00 on the 17th in Berlin; 22:30Z is the 17th in UTC but already the 18th in Berlin.
    const entries = [entry('late', 'closed', '2026-09-17T21:00:00.000Z', '2026-09-17T21:30:00.000Z', '5', 'USDT')];
    expect(projectGoalsProgress({ preference, entries, timeZone: 'UTC', now: '2026-09-17T22:30:00.000Z' })).toMatchObject({ todayKey: '2026-09-17', maxTradesPerDay: { today: 1 } });
    expect(projectGoalsProgress({ preference, entries, timeZone: 'Europe/Berlin', now: '2026-09-17T22:30:00.000Z' })).toMatchObject({ todayKey: '2026-09-18', maxTradesPerDay: { today: 0 }, tradesPerMonth: { current: 1 } });
  });

  it('composes the stored preferences and the bounded history through the released owners, and reports an unconfigured time zone explicitly', async () => {
    const db = createKairosDatabase(dbName('query'));
    await openKairosDatabase(db);
    const { metadata } = createKairosRepositories(db);
    await writeGoalsPreference(metadata, { tradesPerMonthTarget: '3' }, now);
    expect(await loadGoalsProgress(db, now)).toEqual({ kind: 'time-zone-unconfigured', preference: { tradesPerMonthTarget: 3, maxTradesPerDay: null, monthlyResultTarget: null } });
    await writeVisualPnlTimeZonePreference(metadata, 'UTC', now);
    const result = await loadGoalsProgress(db, now);
    expect(result).toMatchObject({ kind: 'ready', timeZone: 'UTC', progress: { kind: 'ready', consideredEntries: 0, tradesPerMonth: { kind: 'progress', target: 3, current: 0, reached: false }, maxTradesPerDay: { kind: 'unset' }, monthlyResult: { kind: 'unset' } } });
    db.close();
  });
});
