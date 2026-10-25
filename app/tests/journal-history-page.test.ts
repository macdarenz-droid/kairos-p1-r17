import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import { listJournalHistoryPage, type JournalHistoryCursor, type JournalHistoryEntry } from '../src/application/journal';
import type { JournalFilters } from '../src/application/journal/journalFilters';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createTradeDomainId, type MarketType, type TradeId, type TradeRecord, type TradeSource, type TradeStatus } from '../src/domain/trades';

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

async function walk(db: KairosDatabase, options: { scope?: 'real' | 'practice'; status?: TradeStatus; filters?: JournalFilters; timeZone?: string } = {}) {
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

// ---------------------------------------------------------------------------------------------------------------------
// T-060e: the search and filters (U15, D262). Built from the owners' own commands, so the trades are what the app saves.
// ---------------------------------------------------------------------------------------------------------------------

const NO_FILTERS: JournalFilters = { q: null, status: null, from: null, to: null, market: null, side: null, result: null, strategy: null, mistake: null, source: null };
const only = (partial: Partial<JournalFilters>): JournalFilters => ({ ...NO_FILTERS, ...partial });
const idsOf = (entries: readonly JournalHistoryEntry[]) => entries.map(entry => entry.trade.id);
const symbolsOf = (entries: readonly JournalHistoryEntry[]) => entries.map(entry => entry.trade.symbol);
const hourAfter = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString();

/** A closed trade with an entry and an exit, one unit, so its result is known: short trades gain when the exit is lower. */
function withFills(symbol: string, openedAt: string, side: 'long' | 'short', entry: string, exit: string, marketType: MarketType = 'crypto', currency = 'USDT'): SaveManualTradeInput {
  const closedAt = hourAfter(openedAt);
  return {
    symbol, marketType, side, status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: entry, quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
  } as SaveManualTradeInput;
}
async function savedReal(db: KairosDatabase, input: SaveManualTradeInput, createdAt = '2026-04-20T00:00:00.000Z'): Promise<TradeId> {
  const saved = await saveManualTrade(db, input, { now: () => createdAt });
  if (!saved.ok) throw new Error(`fixture ${input.symbol}: ${JSON.stringify(saved)}`);
  return saved.tradeId as TradeId;
}
async function savedPractice(db: KairosDatabase, input: SaveManualTradeInput, source: 'paper' | 'replay'): Promise<TradeId> {
  const saved = await savePracticeTrade(db, { ...input, source }, { now: () => '2026-04-20T00:00:00.000Z' });
  if (!saved.ok) throw new Error(`practice fixture ${input.symbol}: ${JSON.stringify(saved)}`);
  return saved.tradeId as TradeId;
}
async function markMistakes(db: KairosDatabase, tradeId: TradeId, mistakeIds: string[], scope: 'real' | 'practice' = 'real') {
  const saved = await saveTradeDiscipline(db, { tradeId, scope, half: 'review', answers: [], mistakeIds, note: '' });
  if (!saved.ok) throw new Error(`fixture review ${saved.reason}`);
}
async function followStrategy(db: KairosDatabase, tradeId: TradeId, strategyId: string) {
  const saved = await saveTradeDiscipline(db, { tradeId, scope: 'real', half: 'strategy', strategyId, answers: [] });
  if (!saved.ok) throw new Error(`fixture strategy ${saved.reason}`);
}

/** Journal dates, newest first: btcWon 10 Apr, ethLost 9, eurEven 8, aaplOpen 7, tslaDraft 6 (planned, never opened), solCancelled 5, btcShortWon 4, noFills 3. */
async function realFixture(db: KairosDatabase) {
  const btcWon = await savedReal(db, withFills('BTCUSDT', '2026-04-10T10:00:00.000Z', 'long', '100', '110'));
  const ethLost = await savedReal(db, withFills('ETHUSDT', '2026-04-09T10:00:00.000Z', 'short', '100', '110'));
  const eurEven = await savedReal(db, withFills('EURUSD', '2026-04-08T10:00:00.000Z', 'long', '1.1', '1.1', 'forex', 'USD'));
  const aaplOpen = await savedReal(db, {
    symbol: 'AAPL', marketType: 'stock', side: 'long', status: 'open', openedAt: '2026-04-07T10:00:00.000Z', grossPnlCurrency: 'USD',
    executions: [{ type: 'entry', price: '190', quantity: '1', executedAt: '2026-04-07T10:00:00.000Z' }],
  } as SaveManualTradeInput);
  const tslaDraft = await savedReal(db, { symbol: 'TSLA', marketType: 'stock', side: 'long', status: 'draft' } as SaveManualTradeInput, '2026-04-06T09:00:00.000Z');
  const solCancelled = await savedReal(db, { symbol: 'SOLUSDT', marketType: 'crypto', side: 'long', status: 'cancelled' } as SaveManualTradeInput, '2026-04-05T09:00:00.000Z');
  const btcShortWon = await savedReal(db, withFills('BTCUSDT', '2026-04-04T10:00:00.000Z', 'short', '110', '100'));
  // A closed trade nobody recorded the fills of: its result is not known, so it is neither won, lost nor even.
  const noFills = createTradeDomainId<TradeId>();
  await db.trades.put({
    id: noFills, symbol: 'NODATA', marketType: 'other', side: 'long', status: 'closed', source: 'manual',
    openedAt: '2026-04-03T10:00:00.000Z', closedAt: '2026-04-03T11:00:00.000Z', createdAt: '2026-04-03T10:00:00.000Z', updatedAt: '2026-04-03T11:00:00.000Z',
  } as TradeRecord);

  await markMistakes(db, btcWon, ['moved-stop']);
  await markMistakes(db, ethLost, ['moved-stop', 'oversized']);
  const strategy = await saveStrategy(db, { id: null, name: 'Breakout', rules: [{ id: 'stop', kind: 'stop-planned' }] });
  if (!strategy.ok) throw new Error('fixture strategy');
  await followStrategy(db, btcWon, strategy.strategy.id);
  await followStrategy(db, eurEven, strategy.strategy.id);
  return { btcWon, ethLost, eurEven, aaplOpen, tslaDraft, solCancelled, btcShortWon, noFills, breakout: strategy.strategy.id as string };
}

const page = (db: KairosDatabase, filters: Partial<JournalFilters>, options: { scope?: 'real' | 'practice'; timeZone?: string } = {}) =>
  walk(db, { scope: 'real', ...options, filters: only(filters) });
async function matching(db: KairosDatabase, filters: Partial<JournalFilters>, options: { scope?: 'real' | 'practice'; timeZone?: string } = {}): Promise<TradeId[]> {
  const { pages, lastCursor } = await page(db, filters, options);
  expect(lastCursor).toBeNull();
  return idsOf(pages.flat());
}

describe('T-060e filters', () => {
  it('finds a symbol however it is typed: capitals, spaces and "/" are ignored', async () => {
    const db = await database();
    const ids = await realFixture(db);
    expect(await matching(db, { q: 'btc/ usdt' })).toEqual([ids.btcWon, ids.btcShortWon]);
    expect(await matching(db, { q: 'BTCUSDT' })).toEqual([ids.btcWon, ids.btcShortWon]);
    expect(await matching(db, { q: ' btc / USDT ' })).toEqual([ids.btcWon, ids.btcShortWon]);
    expect(await matching(db, { q: 'eth' })).toEqual([ids.ethLost]);
    expect(await matching(db, { q: 'usdt' })).toEqual([ids.btcWon, ids.ethLost, ids.solCancelled, ids.btcShortWon]);
    expect(await matching(db, { q: 'doge' })).toEqual([]);
  });

  it('filters by status, each alone', async () => {
    const db = await database();
    const ids = await realFixture(db);
    expect(await matching(db, { status: 'closed' })).toEqual([ids.btcWon, ids.ethLost, ids.eurEven, ids.btcShortWon, ids.noFills]);
    expect(await matching(db, { status: 'open' })).toEqual([ids.aaplOpen]);
    expect(await matching(db, { status: 'draft' })).toEqual([ids.tslaDraft]);
    expect(await matching(db, { status: 'cancelled' })).toEqual([ids.solCancelled]);
  });

  it('filters by market, each alone', async () => {
    const db = await database();
    const ids = await realFixture(db);
    expect(await matching(db, { market: 'crypto' })).toEqual([ids.btcWon, ids.ethLost, ids.solCancelled, ids.btcShortWon]);
    expect(await matching(db, { market: 'stock' })).toEqual([ids.aaplOpen, ids.tslaDraft]);
    expect(await matching(db, { market: 'forex' })).toEqual([ids.eurEven]);
    expect(await matching(db, { market: 'other' })).toEqual([ids.noFills]);
    expect(await matching(db, { market: 'futures' })).toEqual([]);
  });

  it('filters by side, each alone', async () => {
    const db = await database();
    const ids = await realFixture(db);
    expect(await matching(db, { side: 'short' })).toEqual([ids.ethLost, ids.btcShortWon]);
    expect(await matching(db, { side: 'long' })).toEqual([ids.btcWon, ids.eurEven, ids.aaplOpen, ids.tslaDraft, ids.solCancelled, ids.noFills]);
  });

  it('filters by what the trade made after fees: won, lost, even; an unknown result is none of them', async () => {
    const db = await database();
    const ids = await realFixture(db);
    expect(await matching(db, { result: 'won' })).toEqual([ids.btcWon, ids.btcShortWon]);
    expect(await matching(db, { result: 'lost' })).toEqual([ids.ethLost]);
    expect(await matching(db, { result: 'even' })).toEqual([ids.eurEven]);
    const everyResult = [...await matching(db, { result: 'won' }), ...await matching(db, { result: 'lost' }), ...await matching(db, { result: 'even' })];
    // The open trade, the draft, the cancelled one and the closed trade with no fills never match a result.
    for (const unknown of [ids.aaplOpen, ids.tslaDraft, ids.solCancelled, ids.noFills]) expect(everyResult).not.toContain(unknown);
    // A result needs a closed trade: another status with it finds nothing.
    expect(await matching(db, { result: 'won', status: 'open' })).toEqual([]);
    expect(await matching(db, { result: 'won', status: 'draft' })).toEqual([]);
    expect(await matching(db, { result: 'won', status: 'closed' })).toEqual([ids.btcWon, ids.btcShortWon]);
  });

  it('filters by the strategy the trade followed, and by a mistake it was marked with', async () => {
    const db = await database();
    const ids = await realFixture(db);
    expect(await matching(db, { strategy: ids.breakout })).toEqual([ids.btcWon, ids.eurEven]);
    expect(await matching(db, { strategy: 'a-strategy-nobody-followed' })).toEqual([]);
    expect(await matching(db, { mistake: 'moved-stop' })).toEqual([ids.btcWon, ids.ethLost]);
    expect(await matching(db, { mistake: 'oversized' })).toEqual([ids.ethLost]);
    expect(await matching(db, { mistake: 'late-exit' })).toEqual([]);
  });

  it('filters Practice by how the trade was made, and keeps real trades out of it', async () => {
    const db = await database();
    const real = await realFixture(db);
    const paper = await savedPractice(db, withFills('BTCUSDT', '2026-04-11T10:00:00.000Z', 'long', '100', '120'), 'paper');
    const replay = await savedPractice(db, withFills('BTCUSDT', '2026-04-12T10:00:00.000Z', 'long', '100', '90'), 'replay');
    const replay2 = await savedPractice(db, withFills('ETHUSDT', '2026-04-13T10:00:00.000Z', 'short', '100', '90'), 'replay');
    expect(await matching(db, { source: 'paper' }, { scope: 'practice' })).toEqual([paper]);
    expect(await matching(db, { source: 'replay' }, { scope: 'practice' })).toEqual([replay2, replay]);
    expect(await matching(db, {}, { scope: 'practice' })).toEqual([replay2, replay, paper]);
    // The same symbol search in each scope finds that scope's own trades only.
    expect(await matching(db, { q: 'btc' }, { scope: 'practice' })).toEqual([replay, paper]);
    expect(await matching(db, { q: 'btc' }, { scope: 'real' })).toEqual([real.btcWon, real.btcShortWon]);
    // A result filter works on practice trades too, and a mistake on one is found in Practice only.
    expect(await matching(db, { result: 'won' }, { scope: 'practice' })).toEqual([replay2, paper]);
    await markMistakes(db, replay, ['chased-entry'], 'practice');
    expect(await matching(db, { mistake: 'chased-entry' }, { scope: 'practice' })).toEqual([replay]);
    expect(await matching(db, { mistake: 'chased-entry' }, { scope: 'real' })).toEqual([]);
  });

  it('combines filters: a trade must match every one', async () => {
    const db = await database();
    const ids = await realFixture(db);
    expect(await matching(db, { market: 'crypto', side: 'short', result: 'won' })).toEqual([ids.btcShortWon]);
    expect(await matching(db, { q: 'btc', mistake: 'moved-stop' })).toEqual([ids.btcWon]);
    expect(await matching(db, { result: 'won', strategy: ids.breakout })).toEqual([ids.btcWon]);
    expect(await matching(db, { status: 'closed', mistake: 'moved-stop' })).toEqual([ids.btcWon, ids.ethLost]);
    expect(await matching(db, { status: 'closed', mistake: 'moved-stop', side: 'short' })).toEqual([ids.ethLost]);
    expect(await matching(db, { q: 'eth', result: 'won' })).toEqual([]);
    expect(await matching(db, { strategy: ids.breakout, mistake: 'oversized' })).toEqual([]);
    expect(await matching(db, { from: '2026-04-05', to: '2026-04-08', market: 'crypto' })).toEqual([ids.solCancelled]);
  });

  it('puts a trade on the Journal date: when it was opened, else when it was planned', async () => {
    const db = await database();
    const ids = await realFixture(db);
    expect(await matching(db, { from: '2026-04-08', to: '2026-04-09' })).toEqual([ids.ethLost, ids.eurEven]);
    expect(await matching(db, { from: '2026-04-09' })).toEqual([ids.btcWon, ids.ethLost]);
    expect(await matching(db, { to: '2026-04-04' })).toEqual([ids.btcShortWon, ids.noFills]);
    // The draft was never opened: it sits on the day it was planned, 6 Apr, not on the day the test ran.
    expect(await matching(db, { from: '2026-04-06', to: '2026-04-06' })).toEqual([ids.tslaDraft]);
    expect(await matching(db, { from: '2026-04-20', to: '2026-04-20' })).toEqual([]);
  });

  describe('From and To at the edge of the trader\'s time zone', () => {
    async function edgeTrades(db: KairosDatabase) {
      const place = async (symbol: string, openedAt: string) => {
        const id = createTradeDomainId<TradeId>();
        await db.trades.put({ id, symbol, marketType: 'crypto', side: 'long', status: 'open', source: 'manual', openedAt, closedAt: null, createdAt: openedAt, updatedAt: openedAt } as TradeRecord);
        return id;
      };
      return {
        // 1 Apr 07:30 in Manila (UTC+8), 31 Mar in UTC.
        manilaMorning: await place('EDGE-A', '2026-03-31T23:30:00.000Z'),
        // 1 Apr in UTC, 2 Apr 00:30 in Manila.
        utcEvening: await place('EDGE-B', '2026-04-01T16:30:00.000Z'),
        // 1 Apr 00:30 in UTC+14, 31 Mar in UTC.
        kiritimatiMidnight: await place('EDGE-C', '2026-03-31T10:30:00.000Z'),
        // 1 Apr 23:30 in UTC-12, 2 Apr in UTC.
        lastHourWest: await place('EDGE-D', '2026-04-02T11:30:00.000Z'),
        // Just outside 1 April in UTC-12 (2 Apr 00:30) and in UTC+14 (31 Mar 23:30).
        justPastWest: await place('EDGE-E', '2026-04-02T12:30:00.000Z'),
        justBeforeEast: await place('EDGE-F', '2026-03-31T09:30:00.000Z'),
      };
    }
    const april1 = { from: '2026-04-01', to: '2026-04-01' };

    it('counts the same trade on 1 April in Manila and on 31 March in UTC', async () => {
      const db = await database();
      const edge = await edgeTrades(db);
      expect(await matching(db, april1, { timeZone: 'Asia/Manila' })).toEqual([edge.manilaMorning]);
      expect(await matching(db, april1, { timeZone: 'UTC' })).toEqual([edge.utcEvening]);
      expect(await matching(db, { from: '2026-03-31', to: '2026-03-31' }, { timeZone: 'UTC' })).toEqual([edge.manilaMorning, edge.kiritimatiMidnight, edge.justBeforeEast]);
      expect(await matching(db, { from: '2026-03-31', to: '2026-03-31' }, { timeZone: 'Asia/Manila' })).toEqual([edge.kiritimatiMidnight, edge.justBeforeEast]);
    });

    it('holds the whole day in the farthest zones on either side of UTC', async () => {
      const db = await database();
      const edge = await edgeTrades(db);
      // UTC+14: 1 April starts at 10:00 UTC on 31 March.
      expect(await matching(db, april1, { timeZone: 'Pacific/Kiritimati' })).toEqual([edge.manilaMorning, edge.kiritimatiMidnight]);
      // UTC-12: 1 April ends at 12:00 UTC on 2 April.
      expect(await matching(db, april1, { timeZone: 'Etc/GMT+12' })).toEqual([edge.lastHourWest, edge.utcEvening]);
    });

    it('an open range reaches to the end, and works with the other filters', async () => {
      const db = await database();
      const edge = await edgeTrades(db);
      expect(await matching(db, { from: '2026-04-01' }, { timeZone: 'Asia/Manila' })).toEqual([edge.justPastWest, edge.lastHourWest, edge.utcEvening, edge.manilaMorning]);
      expect(await matching(db, { to: '2026-03-31' }, { timeZone: 'Asia/Manila' })).toEqual([edge.kiritimatiMidnight, edge.justBeforeEast]);
      expect(await matching(db, { ...april1, q: 'edge-a', status: 'open' }, { timeZone: 'Asia/Manila' })).toEqual([edge.manilaMorning]);
      expect(await matching(db, { ...april1, q: 'edge-a', status: 'open' }, { timeZone: 'UTC' })).toEqual([]);
    });
  });

  describe('paging with a filter', () => {
    /** 230 closed trades, newest first by index, all on distinct minutes except indexes 196 to 200, which share one (the page edge falls in that tie). */
    async function manyTrades(db: KairosDatabase, symbolOf: (index: number) => string = () => 'X') {
      const base = Date.parse('2026-04-01T00:00:00.000Z');
      const stamp = (index: number) => new Date(base - (index >= 196 && index <= 200 ? 196 : index) * 60_000).toISOString();
      const trades = Array.from({ length: 230 }, (_, index) => ({
        id: createTradeDomainId<TradeId>(), symbol: symbolOf(index), marketType: 'crypto', side: 'long', status: 'closed', source: 'manual',
        openedAt: stamp(index), closedAt: stamp(index), createdAt: stamp(index), updatedAt: stamp(index),
      } as TradeRecord));
      await db.trades.bulkPut(trades);
      return trades;
    }
    const newestFirst = (rows: readonly TradeRecord[]) => [...rows].sort((left, right) => right.openedAt!.localeCompare(left.openedAt!) || right.id.localeCompare(left.id)).map(row => row.id);

    it('pages a symbol search that matches every other trade: 100, 15, no repeats, newest first', async () => {
      const db = await database();
      const trades = await manyTrades(db, index => index % 2 === 0 ? 'BTCUSDT' : 'ETHUSDT');
      const { pages, lastCursor } = await page(db, { q: 'btc/usdt' });
      expect(pages.map(rows => rows.length)).toEqual([100, 15]);
      expect(lastCursor).toBeNull();
      const ids = idsOf(pages.flat());
      expect(new Set(ids).size).toBe(115);
      expect(ids).toEqual(newestFirst(trades.filter((_, index) => index % 2 === 0)));
      expect(symbolsOf(pages.flat()).every(symbol => symbol === 'BTCUSDT')).toBe(true);
    });

    it('pages a mistake filter that matches every other trade: 100, 15, no repeats, newest first', async () => {
      const db = await database();
      const trades = await manyTrades(db);
      for (const [index, trade] of trades.entries()) if (index % 2 === 0) await markMistakes(db, trade.id, ['oversized']);
      const first = await listJournalHistoryPage(db, { scope: 'real', filters: only({ mistake: 'oversized' }), timeZone: 'UTC', before: null });
      expect(first.entries).toHaveLength(100);
      expect(first.nextCursor).not.toBeNull();
      const lastOfFirst = first.entries[99]!.trade;
      expect(first.nextCursor!.id).toBe(lastOfFirst.id);

      const { pages, lastCursor } = await page(db, { mistake: 'oversized' });
      expect(pages.map(rows => rows.length)).toEqual([100, 15]);
      expect(lastCursor).toBeNull();
      const ids = idsOf(pages.flat());
      expect(new Set(ids).size).toBe(115);
      expect(ids).toEqual(newestFirst(trades.filter((_, index) => index % 2 === 0)));
      // The second page continues exactly after the first.
      expect(idsOf(pages[0]!)).toEqual(idsOf(first.entries));
    });

    it('finds the few matches among more trades than one read holds, down to the oldest', async () => {
      const db = await database();
      const trades = await manyTrades(db);
      const picked = [5, 205, 229];
      for (const index of picked) await markMistakes(db, trades[index]!.id, ['moved-stop']);
      const { pages, lastCursor } = await page(db, { mistake: 'moved-stop' });
      expect(pages.map(rows => rows.length)).toEqual([3]);
      expect(lastCursor).toBeNull();
      expect(idsOf(pages[0]!)).toEqual(picked.map(index => trades[index]!.id));
    });

    it('stops with no next page when the matches fill exactly one page', async () => {
      const db = await database();
      const trades = await manyTrades(db, index => index < 100 ? 'BTCUSDT' : 'ETHUSDT');
      const { pages, lastCursor } = await page(db, { q: 'btc' });
      expect(pages.map(rows => rows.length)).toEqual([100]);
      expect(lastCursor).toBeNull();
      expect(idsOf(pages[0]!)).toEqual(newestFirst(trades.slice(0, 100)));
    });
  });

  describe('with no filter', () => {
    it('lists the same page as before: every real trade newest first, and none of Practice', async () => {
      const db = await database();
      const ids = await realFixture(db);
      await savedPractice(db, withFills('BTCUSDT', '2026-04-11T10:00:00.000Z', 'long', '100', '120'), 'paper');
      const everyone = [ids.btcWon, ids.ethLost, ids.eurEven, ids.aaplOpen, ids.tslaDraft, ids.solCancelled, ids.btcShortWon, ids.noFills];
      const plain = await listJournalHistoryPage(db, { scope: 'real', before: null });
      expect(idsOf(plain.entries)).toEqual(everyone);
      expect(plain.nextCursor).toBeNull();
      // Every filter empty, with or without a time zone, is no filter at all.
      for (const options of [{ filters: NO_FILTERS }, { filters: NO_FILTERS, timeZone: 'Asia/Manila' }, { timeZone: 'Pacific/Kiritimati' }]) {
        const same = await listJournalHistoryPage(db, { scope: 'real', before: null, ...options });
        expect(idsOf(same.entries)).toEqual(everyone);
        expect(same.nextCursor).toBeNull();
      }
    });

    it('treats a status filter and the status option as the same thing', async () => {
      const db = await database();
      const ids = await realFixture(db);
      const byOption = await listJournalHistoryPage(db, { scope: 'real', status: 'closed', before: null });
      const byFilter = await listJournalHistoryPage(db, { scope: 'real', filters: only({ status: 'closed' }), before: null });
      expect(idsOf(byOption.entries)).toEqual([ids.btcWon, ids.ethLost, ids.eurEven, ids.btcShortWon, ids.noFills]);
      expect(idsOf(byFilter.entries)).toEqual(idsOf(byOption.entries));
    });

    it('still gives each entry its saved plan, fills, fees and result', async () => {
      const db = await database();
      const ids = await realFixture(db);
      const filtered = await listJournalHistoryPage(db, { scope: 'real', filters: only({ result: 'lost' }), before: null });
      const [entry] = filtered.entries;
      expect(entry!.trade.id).toBe(ids.ethLost);
      expect(entry!.executions).toHaveLength(2);
      expect(entry!.visualPnl).toMatchObject({ outcome: 'loss', amount: '-10', currency: 'USDT' });
    });
  });
});
