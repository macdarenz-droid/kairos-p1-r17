import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { listJournalHistoryPage, type JournalHistoryCursor, type JournalHistoryEntry } from '../src/application/journal';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createTradeDomainId, type TradeId, type TradeRecord, type TradeSource, type TradeStatus } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-history-page-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

function trade(updatedAt: string, status: TradeStatus, source: TradeSource): TradeRecord {
  return {
    id: createTradeDomainId<TradeId>(), symbol: 'X', marketType: 'crypto', side: 'long', status, source,
    openedAt: null, closedAt: status === 'closed' ? updatedAt : null, createdAt: updatedAt, updatedAt,
  } as TradeRecord;
}

async function walk(db: KairosDatabase, options: { scope?: 'real' | 'practice'; status?: TradeStatus } = {}) {
  const pages: (readonly JournalHistoryEntry[])[] = [];
  let before: JournalHistoryCursor | null = null;
  let lastCursor: JournalHistoryCursor | null = null;
  do {
    const page = await listJournalHistoryPage(db, { ...options, before });
    pages.push(page.entries);
    lastCursor = page.nextCursor;
    before = page.nextCursor;
  } while (before !== null && pages.length < 10);
  return { pages, lastCursor };
}

describe('listJournalHistoryPage', () => {
  it('walks every real trade once, newest first, across a shared updatedAt at the page edge', async () => {
    const db = await database();
    const base = Date.parse('2026-09-01T00:00:00.000Z');
    // Newest-first positions 99, 100 and 101 (1-based) share one updatedAt, so the page edge falls inside the tie.
    const stamp = (position: number) => new Date(base - (position >= 98 && position <= 100 ? 98 : position) * 1_000).toISOString();
    const real = Array.from({ length: 233 }, (_, position) => trade(stamp(position), position % 2 === 0 ? 'closed' : 'cancelled', 'manual'));
    const paper = Array.from({ length: 5 }, (_, index) => trade(new Date(base + index * 1_000).toISOString(), 'closed', 'paper'));
    await db.trades.bulkPut([...real, ...paper]);

    const { pages, lastCursor } = await walk(db);
    expect(pages.map(page => page.length)).toEqual([100, 100, 33]);
    expect(lastCursor).toBeNull();
    const ids = pages.flat().map(entry => entry.trade.id);
    expect(new Set(ids).size).toBe(233);
    const expected = [...real].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)).map(row => row.id);
    expect(ids).toEqual(expected);
  });

  it('pages one status, and keeps practice trades in their own scope', async () => {
    const db = await database();
    const base = Date.parse('2026-09-01T00:00:00.000Z');
    await db.trades.bulkPut([
      ...Array.from({ length: 230 }, (_, index) => trade(new Date(base + index * 1_000).toISOString(), index % 2 === 0 ? 'closed' : 'cancelled', 'manual')),
      ...Array.from({ length: 5 }, (_, index) => trade(new Date(base + index * 1_000).toISOString(), 'closed', 'paper')),
    ]);
    const closed = await walk(db, { status: 'closed' });
    expect(closed.pages.map(page => page.length)).toEqual([100, 15]);
    expect(closed.pages.flat().every(entry => entry.trade.status === 'closed' && entry.trade.source === 'manual')).toBe(true);
    const practice = await listJournalHistoryPage(db, { scope: 'practice' });
    expect(practice.entries.map(entry => entry.trade.source)).toEqual(['paper', 'paper', 'paper', 'paper', 'paper']);
    expect(practice.nextCursor).toBeNull();
  });
});
