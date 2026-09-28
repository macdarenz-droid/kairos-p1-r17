import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, prepareBackupRestore, prepareTradeImport } from '../src/application/backup';
import {
  deleteStrategy, exampleStrategyDraft, loadStrategies, saveStrategy, strategiesPreferenceMetadataKey, strategyDraftFrom, type StrategyDraft,
} from '../src/application/discipline/strategies';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createStrategyRuleId, type Strategy } from '../src/domain/discipline';

const names: string[] = [];
async function database(label: string): Promise<KairosDatabase> {
  const name = `kairos-strategies-${label}-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-09-25T10:00:00.000Z';
const later = () => '2026-09-25T11:00:00.000Z';
const stored = async (db: KairosDatabase) => (await db.metadata.get(strategiesPreferenceMetadataKey))?.value;

const breakoutDraft = (): StrategyDraft => ({
  id: null,
  name: ' Breakout ',
  rules: [
    { id: 'risk', kind: 'max-risk', amount: ' 50 ', currency: ' usdt ' },
    { id: 'markets', kind: 'markets', symbols: 'btc/usdt, ETHUSDT\neth-usdt' },
    { id: 'wait', kind: 'written', label: '  I wait for a close above the line  ' },
  ],
});
const simple = (name: string): StrategyDraft => ({ id: null, name, rules: [{ id: createStrategyRuleId(), kind: 'stop-planned' }] });

async function savedBreakout(db: KairosDatabase): Promise<Strategy> {
  const result = await saveStrategy(db, breakoutDraft(), { now });
  if (!result.ok) throw new Error(result.reason);
  return result.strategy;
}

describe('T-040b strategies on this device', () => {
  it('reads none from an empty database and writes nothing', async () => {
    const db = await database('empty');
    expect(await loadStrategies(db)).toEqual({ ok: true, strategies: [] });
    expect(await db.metadata.count()).toBe(0);
  });

  it('saves a new strategy with its rules cleaned up', async () => {
    const db = await database('new');
    const result = await saveStrategy(db, breakoutDraft(), { now });
    expect(result).toMatchObject({ ok: true, changed: true, strategy: { name: 'Breakout', revision: 1 } });
    if (!result.ok) return;
    expect(result.strategy.rules).toEqual([
      { id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' },
      { id: 'markets', kind: 'markets', symbols: ['BTCUSDT', 'ETHUSDT'] },
      { id: 'wait', kind: 'written', label: 'I wait for a close above the line' },
    ]);
    expect(JSON.parse((await stored(db))!)).toMatchObject({ version: 1 });
    expect(await loadStrategies(db)).toEqual({ ok: true, strategies: [result.strategy] });
  });

  it('counts a change as a new revision, and an unchanged save as nothing', async () => {
    const db = await database('change');
    const saved = await savedBreakout(db);
    const draft = strategyDraftFrom(saved);
    const changed = await saveStrategy(db, { ...draft, rules: draft.rules.map(rule => (rule.kind === 'max-risk' ? { ...rule, amount: '40' } : rule)) }, { now: later });
    if (!changed.ok) throw new Error(changed.reason);
    expect(changed.strategy.revision).toBe(2);
    expect(changed.strategy.rules.map(rule => rule.id)).toEqual(saved.rules.map(rule => rule.id));
    const updatedAt = (await db.metadata.get(strategiesPreferenceMetadataKey))!.updatedAt;
    const again = await saveStrategy(db, strategyDraftFrom(changed.strategy), { now: () => '2026-09-25T12:00:00.000Z' });
    expect(again).toMatchObject({ ok: true, changed: false, strategy: { revision: 2 } });
    expect((await db.metadata.get(strategiesPreferenceMetadataKey))!.updatedAt).toBe(updatedAt);
  });

  it.each([
    ['name-required', (): StrategyDraft => ({ ...breakoutDraft(), name: '' }), null],
    ['currency-invalid', (): StrategyDraft => ({ ...breakoutDraft(), rules: [{ id: 'r', kind: 'max-risk', amount: '50', currency: 'US D' }] }), 0],
    ['amount-invalid', (): StrategyDraft => ({ ...breakoutDraft(), name: 'Other', rules: [{ id: 's', kind: 'stop-planned' }, { id: 'r', kind: 'max-risk', amount: 'abc', currency: 'USDT' }] }), 1],
    ['duplicate-name', (): StrategyDraft => ({ ...breakoutDraft(), name: 'breakout' }), null],
    ['rules-required', (): StrategyDraft => ({ ...breakoutDraft(), name: 'Other', rules: [] }), null],
    ['duplicate-rule-kind', (): StrategyDraft => ({ ...breakoutDraft(), name: 'Other', rules: [{ id: 'a', kind: 'max-risk', amount: '1', currency: 'USDT' }, { id: 'b', kind: 'max-risk', amount: '2', currency: 'USDT' }] }), 1],
  ] as const)('refuses %s and writes nothing', async (reason, draft, rule) => {
    const db = await database('refuse');
    await savedBreakout(db);
    const before = await stored(db);
    expect(await saveStrategy(db, draft(), { now: later })).toEqual({ ok: false, type: 'validation-error', reason, rule });
    expect(await stored(db)).toBe(before);
  });

  it('refuses a 21st strategy and an unknown one', async () => {
    const db = await database('limits');
    for (let i = 0; i < 20; i += 1) expect((await saveStrategy(db, simple(`Plan ${i}`), { now })).ok).toBe(true);
    const before = await stored(db);
    expect(await saveStrategy(db, simple('Plan 20'), { now: later })).toEqual({ ok: false, type: 'validation-error', reason: 'too-many-strategies', rule: null });
    expect(await saveStrategy(db, { ...simple('Ghost'), id: 'ghost' }, { now: later })).toEqual({ ok: false, type: 'not-found', reason: 'strategy-not-found' });
    expect(await stored(db)).toBe(before);
  });

  it('deletes one strategy and never touches a trade', async () => {
    const db = await database('delete');
    const breakout = await savedBreakout(db);
    await saveStrategy(db, simple('Pullback'), { now });
    await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-09-18T08:00:00.000Z' });
    const trades = await db.trades.count(), discipline = await db.tradeDiscipline.count();
    const result = await deleteStrategy(db, breakout.id, { now: later });
    expect(result.ok && result.strategies.map(strategy => strategy.name)).toEqual(['Pullback']);
    expect(await deleteStrategy(db, 'ghost')).toEqual({ ok: false, type: 'not-found', reason: 'strategy-not-found' });
    expect(await db.trades.count()).toBe(trades);
    expect(await db.tradeDiscipline.count()).toBe(discipline);
  });

  it.each([
    ['bad JSON', 'not json'],
    ['another version', '{"version":2,"strategies":[]}'],
    ['a duplicate id', JSON.stringify({ version: 1, strategies: [{ id: 'a', name: 'A', revision: 1, rules: [{ id: 'r', kind: 'stop-planned' }] }, { id: 'a', name: 'B', revision: 1, rules: [{ id: 'r', kind: 'stop-planned' }] }] })],
  ])('reads %s as no strategies and leaves it as it is', async (_label, value) => {
    const db = await database('damaged');
    await db.metadata.put({ key: strategiesPreferenceMetadataKey, value, updatedAt: now() });
    expect(await loadStrategies(db)).toEqual({ ok: true, strategies: [] });
    expect(await stored(db)).toBe(value);
    expect((await inspectKairosDatabaseIntegrity(db)).coreOk).toBe(true);
  });

  it('offers one plain example to copy', async () => {
    const db = await database('example');
    const result = await saveStrategy(db, exampleStrategyDraft(), { now });
    expect(result.ok && result.strategy.rules.map(rule => rule.kind)).toEqual(['min-reward-to-risk', 'stop-planned', 'checklist-complete', 'written']);
    const [first, second] = [exampleStrategyDraft(), exampleStrategyDraft()];
    expect(first.rules.map(rule => rule.id)).not.toEqual(second.rules.map(rule => rule.id));
  });

  it('travels in a full restore, and a merge import leaves them alone', async () => {
    const source = await database('backup-source');
    const breakout = await savedBreakout(source);
    const exported = await exportKairosBackup(source, new Date(now()));
    if (!exported.ok) throw new Error('export failed');
    const target = await database('backup-target');
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(target, prepared.restore)).ok).toBe(true);
    expect(await loadStrategies(target)).toEqual({ ok: true, strategies: [breakout] });

    const other = await database('other');
    await saveStrategy(other, simple('Other plan'), { now });
    await saveManualTrade(other, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-09-18T08:00:00.000Z' });
    const otherBackup = await exportKairosBackup(other, new Date(now()));
    if (!otherBackup.ok) throw new Error('export failed');
    const importing = await prepareTradeImport(source, otherBackup.file.contents);
    if (!importing.ok) throw new Error('import prepare failed');
    expect((await commitTradeImport(source, importing.import)).ok).toBe(true);
    expect(await loadStrategies(source)).toEqual({ ok: true, strategies: [breakout] });
  });

  it('reports a storage failure', async () => {
    const db = await database('failure');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await saveStrategy(db, breakoutDraft(), { now })).toEqual({ ok: false, type: 'storage-error', reason: 'strategies-save-failed' });
  });
});
