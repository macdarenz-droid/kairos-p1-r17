import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import { loadTradePatterns } from '../src/application/patterns/loadTradePatterns';
import type { TradePattern, TradePatternsProjection } from '../src/application/patterns/tradePatterns';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeId } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-patterns-plan-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = '2026-09-18T12:00:00.000Z';
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now); }
type Plan = { plannedEntryPrice?: string; plannedStopPrice?: string; plannedQuantity?: string };
function closed(symbol: string, plan: Plan | null, size: string, exit: string, openedAt: string, closedAt: string) {
  return {
    symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt, closedAt, ...(plan ? { plan } : {}),
    executions: [{ type: 'entry', price: '100', quantity: size, executedAt: openedAt }, { type: 'exit', price: exit, quantity: size, executedAt: closedAt }],
  } as const;
}
async function save(db: KairosDatabase, input: Parameters<typeof saveManualTrade>[1]): Promise<TradeId> {
  const saved = await saveManualTrade(db, input);
  if (!saved.ok) throw new Error('fixture');
  return saved.tradeId as TradeId;
}
async function strategy(db: KairosDatabase, name: string, rules: Parameters<typeof saveStrategy>[1]['rules'], id: string | null = null) {
  const saved = await saveStrategy(db, { id, name, rules });
  if (!saved.ok) throw new Error('fixture');
  return saved.strategy;
}
async function follow(db: KairosDatabase, tradeId: TradeId, strategyId: string, at: string) {
  const saved = await saveTradeDiscipline(db, { tradeId, scope: 'real', half: 'strategy', strategyId, answers: [] }, { now: () => at });
  if (!saved.ok) throw new Error('fixture');
}
async function ready(db: KairosDatabase, scope?: 'real' | 'practice') {
  const result = await loadTradePatterns(db, { now, ...(scope ? { scope } : {}) });
  if (result.kind !== 'ready') throw new Error(result.kind);
  return result.projection;
}
const find = (projection: TradePatternsProjection, kind: TradePattern['kind']) => projection.patterns.find(item => item.kind === kind)!;
const group = (item: TradePattern, key: string) => item.groups.find(candidate => candidate.key === key)!;
const at = (day: string, time: string) => `2026-09-${day}T${time}:00.000Z`;
const plan = { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' };

describe('T-042c your plan, after a win or a loss, and your strategies', () => {
  it('adds the three discipline patterns in front, and every pattern accounts for every trade', async () => {
    const db = await database();
    await withZone(db);
    await save(db, closed('BTCUSDT', plan, '1', '110', at('01', '09:00'), at('01', '10:00')));
    await save(db, closed('ETHUSDT', plan, '3', '90', at('02', '09:00'), at('02', '10:00')));
    await save(db, closed('SOLUSDT', null, '1', '105', at('03', '09:00'), at('03', '10:00')));
    const t4 = await save(db, closed('XRPUSDT', null, '1', '95', at('04', '09:00'), at('04', '10:00')));
    const t5 = await save(db, closed('ADAUSDT', { plannedStopPrice: '95' }, '1', '100', at('05', '09:00'), at('05', '12:00')));
    await save(db, closed('DOTUSDT', null, '1', '110', at('05', '11:00'), at('05', '13:00')));
    const breakout = await strategy(db, 'Breakout', [{ id: 'stop', kind: 'stop-planned' }]);
    await follow(db, t4, breakout.id, '2026-09-04T09:00:00.000Z');
    await strategy(db, 'Breakout 2', [{ id: 'stop', kind: 'stop-planned' }], breakout.id);
    await follow(db, t5, breakout.id, '2026-09-05T09:00:00.000Z');

    const projection = await ready(db);
    expect(projection.patterns.map(item => item.kind)).toEqual(['plan', 'after-result', 'strategy', 'weekday', 'time-of-day', 'direction']);

    const planned = find(projection, 'plan');
    expect(planned.groups.map(item => item.key)).toEqual(['kept', 'broken']);
    expect(group(planned, 'kept').summary).toMatchObject({ tradeCount: 2, won: 1, breakEven: 1 });
    expect(group(planned, 'broken').summary).toMatchObject({ tradeCount: 2, lost: 2 });
    expect(planned.unplaced).toBe(2);
    expect(planned.groups.map(item => item.barSteps)).toEqual([10, 10]);

    const after = find(projection, 'after-result');
    expect(after.groups.map(item => item.key)).toEqual(['after-win', 'after-loss']);
    expect(group(after, 'after-win').summary).toMatchObject({ tradeCount: 2, lost: 2 });
    expect(group(after, 'after-win').barSteps).toBe(7);
    expect(group(after, 'after-loss').summary).toMatchObject({ tradeCount: 3, won: 2, breakEven: 1 });
    expect(group(after, 'after-loss').barSteps).toBe(10);
    expect(after.unplaced).toBe(1);

    const strategies = find(projection, 'strategy');
    expect(strategies.groups.map(item => item.key)).toEqual([`strategy:${breakout.id}`, 'no-strategy']);
    expect(strategies.groups[0]).toMatchObject({ name: 'Breakout 2', barSteps: 5 });
    expect(strategies.groups[0]!.summary).toMatchObject({ tradeCount: 2, lost: 1, breakEven: 1 });
    expect(strategies.groups[1]).toMatchObject({ name: null, barSteps: 10 });
    expect(strategies.groups[1]!.summary).toMatchObject({ tradeCount: 4, won: 3, lost: 1 });

    expect(projection.overall.tradeCount).toBe(6);
    for (const item of projection.patterns) {
      expect(item.groups.reduce((sum, candidate) => sum + candidate.summary.tradeCount, 0) + item.unplaced).toBe(6);
    }
  });

  it('does not count a trade with only unknown rules as kept', async () => {
    const db = await database();
    await withZone(db);
    const id = await save(db, closed('BTCUSDT', null, '1', '110', at('02', '09:00'), at('02', '10:00')));
    const risky = await strategy(db, 'Careful', [{ id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' }]);
    await follow(db, id, risky.id, '2026-09-02T09:00:00.000Z');
    const planned = find(await ready(db), 'plan');
    expect(planned.groups.map(item => item.summary.tradeCount)).toEqual([0, 0]);
    expect(planned.unplaced).toBe(1);
  });

  it('orders strategies by how many trades they have', async () => {
    const db = await database();
    await withZone(db);
    const alpha = await strategy(db, 'Alpha', [{ id: 'stop', kind: 'stop-planned' }]);
    const beta = await strategy(db, 'Beta', [{ id: 'stop', kind: 'stop-planned' }]);
    await follow(db, await save(db, closed('BTCUSDT', null, '1', '110', at('02', '09:00'), at('02', '10:00'))), alpha.id, '2026-09-02T09:00:00.000Z');
    await follow(db, await save(db, closed('ETHUSDT', null, '1', '110', at('03', '09:00'), at('03', '10:00'))), beta.id, '2026-09-03T09:00:00.000Z');
    await follow(db, await save(db, closed('SOLUSDT', null, '1', '110', at('04', '09:00'), at('04', '10:00'))), beta.id, '2026-09-04T09:00:00.000Z');
    const strategies = find(await ready(db), 'strategy');
    expect(strategies.groups.map(item => item.name)).toEqual(['Beta', 'Alpha']);
    expect(strategies.groups.some(item => item.key === 'no-strategy')).toBe(false);
  });

  it('keeps practice apart and never judges a replay plan', async () => {
    const db = await database();
    await withZone(db);
    const practice = closed('BTCUSDT', { plannedStopPrice: '95', plannedQuantity: '1' }, '1', '90', at('12', '09:00'), at('12', '10:00'));
    expect((await savePracticeTrade(db, practice)).ok).toBe(true);
    expect((await savePracticeTrade(db, { ...practice, source: 'replay' })).ok).toBe(true);
    const planned = find(await ready(db, 'practice'), 'plan');
    expect(group(planned, 'broken').summary.tradeCount).toBe(1);
    expect(group(planned, 'kept').summary.tradeCount).toBe(0);
    expect(planned.unplaced).toBe(1);
    expect((await ready(db)).overall.tradeCount).toBe(0);
  });

  it('says so when it cannot read the strategies', async () => {
    const db = await database();
    await withZone(db);
    await save(db, closed('BTCUSDT', plan, '1', '110', at('02', '09:00'), at('02', '10:00')));
    vi.spyOn(db.tradeDiscipline, 'where').mockImplementation(() => { throw new Error('storage'); });
    await expect(loadTradePatterns(db, { now })).rejects.toThrow(/^Your patterns could not read your strategies/);
  });
});
