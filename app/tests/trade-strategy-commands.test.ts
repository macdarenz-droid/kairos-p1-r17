import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, prepareBackupRestore, prepareTradeImport } from '../src/application/backup';
import { loadTradeDiscipline, saveTradeDiscipline } from '../src/application/discipline';
import { deleteStrategy, saveStrategy, strategyDraftFrom } from '../src/application/discipline/strategies';
import { deleteTradeRecord } from '../src/application/trades';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, runKairosAtomicWrite, type KairosDatabase } from '../src/data/database';
import type { Strategy, TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId, TradeRecord, TradeSource, TradeStatus } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-strategy-commands-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const T1 = '2026-09-25T10:00:00.000Z', T2 = '2026-09-25T11:00:00.000Z', T3 = '2026-09-25T12:00:00.000Z';
let ids = 0;
const deps = (at = T1) => ({ now: () => at, createId: () => `discipline-${++ids}` as TradeDisciplineId });

function trade(id: string, status: TradeStatus, source: TradeSource = 'manual'): TradeRecord {
  return {
    id: id as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status, source, grossPnlCurrency: 'USDT',
    openedAt: status === 'draft' ? null : '2026-09-24T08:00:00.000Z', closedAt: status === 'closed' ? '2026-09-24T09:00:00.000Z' : null,
    createdAt: '2026-09-24T08:00:00.000Z', updatedAt: '2026-09-24T09:00:00.000Z',
  } as TradeRecord;
}
async function seed(db: KairosDatabase, ...records: TradeRecord[]) {
  await runKairosAtomicWrite(db, ['trades'], async ({ repositories }) => { for (const record of records) await repositories.trades.put(record); });
}
async function strategies(db: KairosDatabase): Promise<{ breakout: Strategy; pullback: Strategy }> {
  const breakout = await saveStrategy(db, { id: null, name: 'Breakout', rules: [
    { id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' }, { id: 'stop', kind: 'stop-planned' }, { id: 'wait', kind: 'written', label: 'I wait for a close above the line' },
  ] }, { now: () => T1 });
  const pullback = await saveStrategy(db, { id: null, name: 'Pullback', rules: [{ id: 'calm', kind: 'written', label: 'I stay calm' }] }, { now: () => T1 });
  if (!breakout.ok || !pullback.ok) throw new Error('fixture');
  return { breakout: breakout.strategy, pullback: pullback.strategy };
}
const choose = (tradeId: string, strategyId: string | null, answers: { itemId: string; answer: 'yes' | 'no' }[] = [], scope: 'real' | 'practice' = 'real') =>
  ({ tradeId: tradeId as TradeId, scope, half: 'strategy' as const, strategyId, answers });
async function ok(result: ReturnType<typeof saveTradeDiscipline>): Promise<TradeDisciplineRecord> {
  const saved = await result;
  if (!saved.ok) throw new Error(saved.reason);
  return saved.record;
}

describe('T-040d choose the strategy a trade follows', () => {
  it('chooses, keeps it through a checklist, ticks written rules, and removes it', async () => {
    const db = await database();
    const { breakout } = await strategies(db);
    await seed(db, trade('open-1', 'open'));
    const chosen = await saveTradeDiscipline(db, choose('open-1', breakout.id), deps(T1));
    if (!chosen.ok) throw new Error(chosen.reason);
    expect(chosen.created).toBe(true);
    expect(chosen.record.strategy).toEqual({ strategyId: breakout.id, revision: 1, name: 'Breakout', rules: breakout.rules, answers: [], linkedAt: T1 });
    expect(chosen.record).toMatchObject({ checklistCompletedAt: null, reviewedAt: null });

    const withChecklist = await ok(saveTradeDiscipline(db, { tradeId: 'open-1' as TradeId, scope: 'real', half: 'checklist', answers: [{ itemId: 'plan-written', answer: 'yes' }] }, deps(T2)));
    expect(withChecklist.strategy).toEqual(chosen.record.strategy);

    const ticked = await ok(saveTradeDiscipline(db, choose('open-1', breakout.id, [{ itemId: 'wait', answer: 'yes' }]), deps(T3)));
    expect(ticked.strategy).toEqual({ ...chosen.record.strategy, answers: [{ ruleId: 'wait', answer: 'yes' }] });

    const removed = await ok(saveTradeDiscipline(db, choose('open-1', null), deps(T3)));
    expect('strategy' in removed).toBe(false);
    expect(removed.preTradeChecklist).toEqual(withChecklist.preTradeChecklist);
  });

  it('keeps the snapshot until another strategy is chosen', async () => {
    const db = await database();
    const { breakout, pullback } = await strategies(db);
    await seed(db, trade('open-1', 'open'));
    await ok(saveTradeDiscipline(db, choose('open-1', breakout.id), deps(T1)));
    const draft = strategyDraftFrom(breakout);
    const changed = await saveStrategy(db, { ...draft, rules: draft.rules.map(rule => (rule.kind === 'max-risk' ? { ...rule, amount: '40' } : rule)) }, { now: () => T2 });
    expect(changed.ok && changed.strategy.revision).toBe(2);
    const kept = await ok(saveTradeDiscipline(db, choose('open-1', breakout.id), deps(T2)));
    expect(kept.strategy).toMatchObject({ revision: 1, linkedAt: T1, rules: [{ id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' }, expect.anything(), expect.anything()] });
    await ok(saveTradeDiscipline(db, choose('open-1', pullback.id), deps(T2)));
    const again = await ok(saveTradeDiscipline(db, choose('open-1', breakout.id), deps(T3)));
    expect(again.strategy).toMatchObject({ revision: 2, linkedAt: T3, answers: [], rules: [{ id: 'risk', kind: 'max-risk', amount: '40', currency: 'USDT' }, expect.anything(), expect.anything()] });
  });

  it.each([
    ['an unknown strategy', (b: Strategy) => choose('open-1', 'ghost'), { type: 'not-found', reason: 'strategy-not-found' }],
    ['an answer on a checked rule', (b: Strategy) => choose('open-1', b.id, [{ itemId: 'risk', answer: 'yes' }]), { type: 'validation-error', reason: 'unknown-item' }],
    ['an answer on no rule', (b: Strategy) => choose('open-1', b.id, [{ itemId: 'nope', answer: 'yes' }]), { type: 'validation-error', reason: 'unknown-item' }],
    ['the same answer twice', (b: Strategy) => choose('open-1', b.id, [{ itemId: 'wait', answer: 'yes' }, { itemId: 'wait', answer: 'no' }]), { type: 'validation-error', reason: 'duplicate-item' }],
    ['no strategy with an answer', () => choose('open-1', null, [{ itemId: 'wait', answer: 'yes' }]), { type: 'validation-error', reason: 'unknown-item' }],
    ['no strategy on a trade with no record', () => choose('open-1', null), { type: 'validation-error', reason: 'nothing-to-save' }],
    ['a missing trade', (b: Strategy) => choose('missing', b.id), { type: 'not-found', reason: 'trade-not-found' }],
    ['a practice trade from the Journal', (b: Strategy) => choose('paper-1', b.id), { type: 'not-allowed', reason: 'trade-not-in-scope' }],
  ] as const)('refuses %s and writes nothing', async (_label, input, expected) => {
    const db = await database();
    const { breakout } = await strategies(db);
    await seed(db, trade('open-1', 'open'), trade('paper-1', 'open', 'paper'));
    expect(await saveTradeDiscipline(db, input(breakout), deps())).toEqual({ ok: false, ...expected });
    expect(await db.tradeDiscipline.count()).toBe(0);
  });

  it('works at any status and for a replay trade in practice', async () => {
    const db = await database();
    const { breakout } = await strategies(db);
    await seed(db, trade('draft-1', 'draft'), trade('closed-1', 'closed'), trade('cancelled-1', 'cancelled'), trade('replay-1', 'closed', 'replay'));
    for (const id of ['draft-1', 'closed-1', 'cancelled-1']) expect((await saveTradeDiscipline(db, choose(id, breakout.id), deps())).ok).toBe(true);
    expect((await saveTradeDiscipline(db, choose('replay-1', breakout.id, [], 'practice'), deps())).ok).toBe(true);
  });

  it('keeps the mark when the strategy is deleted', async () => {
    const db = await database();
    const { breakout } = await strategies(db);
    await seed(db, trade('open-1', 'open'));
    const record = await ok(saveTradeDiscipline(db, choose('open-1', breakout.id), deps()));
    expect((await deleteStrategy(db, breakout.id)).ok).toBe(true);
    expect(await db.trades.count()).toBe(1);
    const loaded = await loadTradeDiscipline(db, ['open-1' as TradeId]);
    expect(loaded.ok && loaded.records.get('open-1' as TradeId)?.strategy).toEqual(record.strategy);
  });

  it('follows its trade through delete, merge import, restore and integrity', async () => {
    const db = await database();
    const { breakout } = await strategies(db);
    await seed(db, trade('closed-1', 'closed'), trade('closed-2', 'closed'));
    const record = await ok(saveTradeDiscipline(db, choose('closed-1', breakout.id, [{ itemId: 'wait', answer: 'no' }]), deps()));
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    const exported = await exportKairosBackup(db, new Date(T2));
    if (!exported.ok) throw new Error('export failed');

    const merged = await database();
    const importing = await prepareTradeImport(merged, exported.file.contents);
    if (!importing.ok) throw new Error('import prepare failed');
    expect(importing.import.preview.discipline).toBe(1);
    expect((await commitTradeImport(merged, importing.import)).ok).toBe(true);
    expect(await merged.tradeDiscipline.toArray()).toEqual([record]);

    const restored = await database();
    const prepared = await prepareBackupRestore(restored, exported.file.contents);
    if (!prepared.ok) throw new Error('restore prepare failed');
    expect((await commitBackupRestore(restored, prepared.restore)).ok).toBe(true);
    expect(await restored.tradeDiscipline.toArray()).toEqual([record]);

    const deleted = await deleteTradeRecord(db, 'closed-1' as TradeId);
    expect(deleted.ok && deleted.removed.discipline).toBe(1);
    expect(await db.tradeDiscipline.count()).toBe(0);
  });
});
