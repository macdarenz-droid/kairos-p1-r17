import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadCoachNotes } from '../src/application/coach/loadCoachNotes';
import type { CoachNote } from '../src/application/coach/coachNotes';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import { writeGoalsPreference } from '../src/application/goals';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-coach-notes-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const now = '2026-09-18T12:00:00.000Z';
const SEPT = '2026-09-01T00:00:00.000Z';
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now); }

type Plan = { plannedEntryPrice?: string; plannedStopPrice?: string; plannedQuantity?: string };
function closedTrade(symbol: string, side: 'long' | 'short', plan: Plan | null, entry: [string, string], exit: [string, string], closedAt: string, openedAt = SEPT) {
  return {
    symbol, marketType: 'crypto', side, status: 'closed', grossPnlCurrency: 'USDT', openedAt, closedAt, ...(plan ? { plan } : {}),
    executions: [{ type: 'entry', price: entry[0], quantity: entry[1], executedAt: openedAt }, { type: 'exit', price: exit[0], quantity: exit[1], executedAt: closedAt }],
  } as const;
}
async function save(db: KairosDatabase, input: Parameters<typeof saveManualTrade>[1]): Promise<TradeId> {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error('fixture');
  return saved.tradeId as TradeId;
}
async function review(db: KairosDatabase, tradeId: TradeId, mistakeIds: string[], answers: { itemId: string; answer: 'yes' | 'no' }[] = [], scope: 'real' | 'practice' = 'real') {
  const saved = await saveTradeDiscipline(db, { tradeId, scope, half: 'review', answers, mistakeIds, note: '' });
  if (!saved.ok) throw new Error(`fixture ${saved.reason}`);
}
async function strategy(db: KairosDatabase, name: string, rules: Parameters<typeof saveStrategy>[1]['rules']) {
  const saved = await saveStrategy(db, { id: null, name, rules });
  if (!saved.ok) throw new Error('fixture');
  return saved.strategy;
}
async function follow(db: KairosDatabase, tradeId: TradeId, strategyId: string) {
  const saved = await saveTradeDiscipline(db, { tradeId, scope: 'real', half: 'strategy', strategyId, answers: [] });
  if (!saved.ok) throw new Error('fixture');
}
async function ready(db: KairosDatabase, scope?: 'real' | 'practice') {
  const result = await loadCoachNotes(db, { now, ...(scope ? { scope } : {}) });
  if (result.kind !== 'ready') throw new Error(result.kind);
  return result;
}
const note = <K extends CoachNote['kind']>(notes: readonly CoachNote[], kind: K) => notes.find(item => item.kind === kind) as Extract<CoachNote, { kind: K }>;
const symbols = (trades: readonly { symbol: string }[]) => trades.map(trade => trade.symbol);

async function realFixture(db: KairosDatabase) {
  await withZone(db);
  const a = await save(db, closedTrade('BTCUSDT', 'long', { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' }, ['100', '3'], ['90', '3'], '2026-09-02T10:00:00.000Z'));
  const b = await save(db, closedTrade('ETHUSDT', 'long', { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '2' }, ['100', '2'], ['110', '2'], '2026-09-05T10:00:00.000Z'));
  await save(db, closedTrade('SOLUSDT', 'short', { plannedEntryPrice: '100', plannedStopPrice: '105', plannedQuantity: '1' }, ['100', '1'], ['108', '1'], '2026-09-08T10:00:00.000Z'));
  const e = await save(db, closedTrade('XRPUSDT', 'long', null, ['1', '10'], ['1.1', '10'], '2026-09-10T10:00:00.000Z'));
  await save(db, closedTrade('ADAUSDT', 'long', { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' }, ['100', '3'], ['90', '3'], '2026-08-20T10:00:00.000Z', '2026-08-01T00:00:00.000Z'));
  await save(db, { symbol: 'DOTUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', executions: [{ type: 'entry', price: '5', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }] });
  await review(db, a, ['moved-stop']);
  await review(db, b, ['moved-stop']);
  const breakout = await strategy(db, 'Breakout', [{ id: 'stop', kind: 'stop-planned' }]);
  await follow(db, e, breakout.id);
  await follow(db, b, breakout.id);
  expect((await writeGoalsPreference(createKairosRepositories(db).metadata, { maxTradesPerDay: '1' }, now)).ok).toBe(true);
}

describe('T-041b the coach notes', () => {
  it('finds the six notes of this month from their owners', async () => {
    const db = await database();
    await realFixture(db);
    const before = [await db.trades.count(), await db.tradeDiscipline.count(), await db.metadata.count()];
    const result = await ready(db);
    expect([await db.trades.count(), await db.tradeDiscipline.count(), await db.metadata.count()]).toEqual(before);
    expect(result.monthKey).toBe('2026-09');
    const { notes } = result;
    expect(notes.map(item => item.kind)).toEqual(['daily-limit', 'stop-passed', 'size-over-plan', 'strategy-rules-broken', 'mistake-repeated', 'reviews-missing']);

    expect(note(notes, 'daily-limit')).toMatchObject({ limit: 1, today: 1, exceeded: false });
    const stop = note(notes, 'stop-passed');
    expect(stop.trades.map(({ symbol, stop: s, averageExit }) => ({ symbol, stop: s, averageExit }))).toEqual([
      { symbol: 'BTCUSDT', stop: '95', averageExit: '90' },
      { symbol: 'SOLUSDT', stop: '105', averageExit: '108' },
    ]);
    const size = note(notes, 'size-over-plan');
    expect(size.trades.map(({ symbol, planned, traded }) => ({ symbol, planned, traded }))).toEqual([{ symbol: 'BTCUSDT', planned: '1', traded: '3' }]);
    const broken = note(notes, 'strategy-rules-broken');
    expect(symbols(broken.trades)).toEqual(['XRPUSDT']);
    expect(broken.trades[0]!.strategyName).toBe('Breakout');
    expect(broken.trades[0]!.broken.map(item => [item.kind, item.verdict, (item as { reason: string }).reason])).toEqual([['stop-planned', 'broken', 'no-stop']]);
    const mistake = note(notes, 'mistake-repeated');
    expect(mistake).toMatchObject({ itemId: 'moved-stop', label: 'Moved my stop', count: 2 });
    expect(symbols(mistake.trades)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(mistake.trades).toHaveLength(mistake.count);
    const reviews = note(notes, 'reviews-missing');
    expect(reviews).toMatchObject({ reviewedCount: 2, closedCount: 4, percent: 50 });
    expect(symbols(reviews.trades)).toEqual(['SOLUSDT', 'XRPUSDT']);
    expect(reviews.trades).toHaveLength(reviews.closedCount - reviews.reviewedCount);

    const named = notes.flatMap(item => ('trades' in item ? symbols(item.trades) : []));
    expect(named).not.toContain('ADAUSDT');
    expect(named).not.toContain('DOTUSDT');
    expect(Object.isFrozen(notes)).toBe(true);
    for (const item of notes) {
      expect(Object.isFrozen(item)).toBe(true);
      if ('trades' in item) { expect(Object.isFrozen(item.trades)).toBe(true); for (const trade of item.trades) expect(Object.isFrozen(trade)).toBe(true); }
    }
  });

  it('says when the daily limit was passed', async () => {
    const db = await database();
    await realFixture(db);
    await save(db, { symbol: 'LINKUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '5', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }] });
    expect(note((await ready(db)).notes, 'daily-limit')).toMatchObject({ limit: 1, today: 2, exceeded: true });
  });

  it('keeps practice apart, never judges replay trades and has no daily limit', async () => {
    const db = await database();
    await realFixture(db);
    const practice = closedTrade('BTCUSDT', 'long', { plannedStopPrice: '95', plannedQuantity: '1' }, ['100', '1'], ['90', '1'], '2026-09-12T10:00:00.000Z');
    expect((await savePracticeTrade(db, practice)).ok).toBe(true);
    expect((await savePracticeTrade(db, { ...practice, symbol: 'ETHUSDT', source: 'replay' })).ok).toBe(true);
    const { notes } = await ready(db, 'practice');
    expect(notes.map(item => item.kind)).toEqual(['stop-passed', 'reviews-missing']);
    expect(symbols(note(notes, 'stop-passed').trades)).toEqual(['BTCUSDT']);
    expect(note(notes, 'reviews-missing')).toMatchObject({ reviewedCount: 0, closedCount: 2 });
    const real = (await ready(db)).notes;
    expect(symbols(note(real, 'stop-passed').trades)).toEqual(['BTCUSDT', 'SOLUSDT']);
    expect(real.flatMap(item => ('trades' in item ? item.trades.map(trade => trade.closedAt) : []))).not.toContain('2026-09-12T10:00:00.000Z');
  });

  it('never makes a note from missing facts', async () => {
    const db = await database();
    await withZone(db);
    const yes = [{ itemId: KAIROS_DEFAULT_DISCIPLINE_LISTS.review[0].id, answer: 'yes' as const }];
    const f = await save(db, closedTrade('BTCUSDT', 'long', null, ['100', '1'], ['90', '1'], '2026-09-02T10:00:00.000Z'));
    const g = await save(db, closedTrade('ETHUSDT', 'long', { plannedStopPrice: '95', plannedQuantity: '1' }, ['94', '1'], ['90', '1'], '2026-09-03T10:00:00.000Z'));
    const h = await save(db, closedTrade('SOLUSDT', 'long', { plannedQuantity: '1' }, ['100', '1'], ['110', '1'], '2026-09-04T10:00:00.000Z'));
    await review(db, f, ['no-plan'], yes);
    await review(db, g, [], yes);
    await review(db, h, [], yes);
    const risky = await strategy(db, 'Careful', [{ id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' }]);
    await follow(db, h, risky.id);
    expect((await ready(db)).notes).toEqual([]);
  });

  it('has no notes without closed trades, and refuses without a time zone or a valid time', async () => {
    const db = await database();
    expect(await loadCoachNotes(db, { now })).toEqual({ kind: 'time-zone-unconfigured' });
    await withZone(db);
    expect((await ready(db)).notes).toEqual([]);
    expect(await loadCoachNotes(db, { now: 'not a time' })).toEqual({ kind: 'unavailable', reason: 'invalid-now' });
  });
});
