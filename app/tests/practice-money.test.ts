import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, prepareBackupRestore, prepareTradeImport } from '../src/application/backup';
import { savePracticeTrade } from '../src/application/practice';
import {
  loadPracticeMoney, parsePracticeMoneyInput, practiceMoneyMetadataKey, projectPracticeMoney, readPracticeMoney, savePracticeMoney,
} from '../src/application/practice/practiceMoney';
import { saveManualTrade } from '../src/application/trades';
import { summarizeVisualPnlAggregation, type VisualPnlOutcomeProjection } from '../src/application/visual-pnl';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DecimalString } from '../src/domain/trades';

const names: string[] = [];
async function database(label: string): Promise<KairosDatabase> {
  const name = `kairos-practice-money-${label}-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-25T12:00:00.000Z';
const money = (startAmount: string, currency: string) => ({ startAmount: startAmount as DecimalString, currency });
const result = (amount: string | null, currency: string | null, outcome: VisualPnlOutcomeProjection['outcome'] = amount === null ? 'unavailable' : amount.startsWith('-') ? 'loss' : 'profit'): VisualPnlOutcomeProjection =>
  ({ outcome, label: 'Profit', amount: amount as DecimalString | null, currency, source: 'net-pnl' }) as VisualPnlOutcomeProjection;
const closed = (symbol: string, day: string, exitPrice: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: `${day}T09:00:00.000Z`, closedAt: `${day}T10:00:00.000Z`, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: `${day}T09:00:00.000Z` }, { type: 'exit', price: exitPrice, quantity: '1', executedAt: `${day}T10:00:00.000Z` }] } as const);
async function seedTrades(db: KairosDatabase) {
  const saved = [
    await saveManualTrade(db, closed('BTCUSDT', '2026-09-17', '150')),
    await savePracticeTrade(db, closed('ETHUSDT', '2026-09-18', '10')),
    await savePracticeTrade(db, { symbol: 'SOLUSDT', marketType: 'crypto', side: 'short', status: 'open', openedAt: '2026-09-18T11:00:00.000Z' }),
  ];
  if (!saved.every((item) => item.ok)) throw new Error('fixture');
}

describe('P26.2 practice money input', () => {
  it('trims and capitalises a valid input', () => {
    const parsed = parsePracticeMoneyInput({ startAmount: ' 10000 ', currency: ' usdt ' });
    expect(parsed).toEqual({ ok: true, money: { startAmount: '10000', currency: 'USDT' } });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.ok && Object.isFrozen(parsed.money)).toBe(true);
  });

  it('refuses a bad amount before a bad currency', () => {
    for (const startAmount of ['', '0', '-5', '1,000', 'abc', '1234567890123', '1.123456789']) {
      expect(parsePracticeMoneyInput({ startAmount, currency: 'USDT' })).toEqual({ ok: false, reason: 'start-amount-invalid' });
    }
    for (const currency of ['', 'US D', '$', '100', 'ABCDEFGHIJKLM']) {
      expect(parsePracticeMoneyInput({ startAmount: '1000', currency })).toEqual({ ok: false, reason: 'currency-invalid' });
    }
    expect(parsePracticeMoneyInput({ startAmount: '0', currency: '$' })).toEqual({ ok: false, reason: 'start-amount-invalid' });
  });
});

describe('P26.2 practice money storage', () => {
  it('saves one metadata record and reads it back', async () => {
    const db = await database('save');
    expect(await savePracticeMoney(db, { startAmount: '1000', currency: 'usdt' }, { now })).toEqual({ ok: true, money: money('1000', 'USDT') });
    const records = await db.metadata.toArray();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ key: practiceMoneyMetadataKey, updatedAt: now() });
    expect(JSON.parse(records[0].value)).toEqual({ version: 1, startAmount: '1000', currency: 'USDT' });
    expect(await readPracticeMoney(createKairosRepositories(db).metadata)).toEqual(money('1000', 'USDT'));
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });

  it('writes nothing on a refusal and reports a storage failure', async () => {
    const db = await database('refuse');
    expect(await savePracticeMoney(db, { startAmount: '0', currency: 'USDT' }, { now })).toEqual({ ok: false, type: 'validation-error', reason: 'start-amount-invalid' });
    expect(await db.metadata.count()).toBe(0);
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await savePracticeMoney(db, { startAmount: '1000', currency: 'USDT' }, { now })).toEqual({ ok: false, type: 'storage-error', reason: 'practice-money-save-failed' });
  });

  it('reads damaged records as not set and never rewrites them', async () => {
    const values = [
      'not json',
      JSON.stringify({ version: 2, startAmount: '1000', currency: 'USDT' }),
      JSON.stringify({ version: 1, startAmount: '0', currency: 'USDT' }),
      JSON.stringify({ version: 1, startAmount: '1000', currency: 'usdt' }),
      JSON.stringify({ version: 1, startAmount: '1000', currency: 'USDT', extra: 1 }),
    ];
    for (const value of values) {
      const db = await database('damaged');
      await db.metadata.put({ key: practiceMoneyMetadataKey, value, updatedAt: now() });
      expect(await readPracticeMoney(createKairosRepositories(db).metadata)).toBeNull();
      expect((await db.metadata.get(practiceMoneyMetadataKey))?.value).toBe(value);
      expect((await inspectKairosDatabaseIntegrity(db)).coreOk).toBe(true);
    }
  });
});

describe('P26.2 projectPracticeMoney', () => {
  const usdt = money('1000', 'USDT');
  it('is not set without money, and the start when nothing closed', () => {
    expect(projectPracticeMoney(null, summarizeVisualPnlAggregation([]))).toEqual({ kind: 'not-set' });
    expect(projectPracticeMoney(usdt, summarizeVisualPnlAggregation([]))).toEqual({
      kind: 'ready', money: usdt, closedTrades: 0, resultSoFar: '0', currentAmount: '1000', outcome: 'breakeven', startSteps: 20, currentSteps: 20,
    });
  });

  it('adds the result after fees and sizes the bars', () => {
    expect(projectPracticeMoney(usdt, summarizeVisualPnlAggregation([result('-90', 'USDT')]))).toMatchObject({ kind: 'ready', currentAmount: '910', outcome: 'loss', startSteps: 20, currentSteps: 18 });
    expect(projectPracticeMoney(money('100', 'USDT'), summarizeVisualPnlAggregation([result('50', 'USDT')]))).toMatchObject({ currentAmount: '150', outcome: 'profit', startSteps: 13, currentSteps: 20 });
    expect(projectPracticeMoney(money('50', 'USDT'), summarizeVisualPnlAggregation([result('-90', 'USDT')]))).toMatchObject({ currentAmount: '-40', currentSteps: 0 });
  });

  it('says why when the total cannot be shown', () => {
    expect(projectPracticeMoney(money('1000', 'EUR'), summarizeVisualPnlAggregation([result('10', 'USDT')]))).toMatchObject({ kind: 'unavailable', reason: 'other-currency', resultCurrency: 'USDT' });
    expect(projectPracticeMoney(usdt, summarizeVisualPnlAggregation([result('10', null)]))).toMatchObject({ kind: 'unavailable', reason: 'missing-currency', resultCurrency: null });
    expect(projectPracticeMoney(usdt, summarizeVisualPnlAggregation([result(null, null)]))).toMatchObject({ kind: 'unavailable', reason: 'trade-without-result' });
    expect(projectPracticeMoney(usdt, summarizeVisualPnlAggregation([result('10', 'USDT'), result('5', 'EUR')]))).toMatchObject({ kind: 'unavailable', reason: 'mixed-currencies', closedTrades: 2 });
  });
});

describe('P26.2 loadPracticeMoney', () => {
  it('counts closed practice trades only', async () => {
    const db = await database('load');
    await seedTrades(db);
    expect(await loadPracticeMoney(db)).toEqual({ kind: 'not-set' });
    await savePracticeMoney(db, { startAmount: '1000', currency: 'USDT' }, { now });
    expect(await loadPracticeMoney(db)).toMatchObject({ kind: 'ready', closedTrades: 1, resultSoFar: '-90', currentAmount: '910' });
  });
});

describe('P26.2 practice money in backups', () => {
  async function exportOf(db: KairosDatabase): Promise<string> {
    const exported = await exportKairosBackup(db, new Date('2026-09-25T13:00:00.000Z'));
    if (!exported.ok) throw new Error('export failed');
    return exported.file.contents;
  }
  async function restore(db: KairosDatabase, contents: string) {
    const prepared = await prepareBackupRestore(db, contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
  }

  it('travels in a backup and a restore replaces it', async () => {
    const source = await database('backup-source');
    await savePracticeMoney(source, { startAmount: '1000', currency: 'USDT' }, { now });
    const target = await database('backup-target');
    await restore(target, await exportOf(source));
    expect(await readPracticeMoney(createKairosRepositories(target).metadata)).toEqual(money('1000', 'USDT'));

    const empty = await database('backup-empty');
    await restore(target, await exportOf(empty));
    expect(await readPracticeMoney(createKairosRepositories(target).metadata)).toBeNull();
  });

  it('keeps this device money on a merge import and counts the imported practice trade', async () => {
    const other = await database('merge-source');
    await savePracticeMoney(other, { startAmount: '500', currency: 'EUR' }, { now });
    const trade = await savePracticeTrade(other, closed('ETHUSDT', '2026-09-18', '10'));
    if (!trade.ok) throw new Error('fixture');
    const db = await database('merge-target');
    await savePracticeMoney(db, { startAmount: '1000', currency: 'USDT' }, { now });
    const prepared = await prepareTradeImport(db, await exportOf(other));
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitTradeImport(db, prepared.import)).ok).toBe(true);
    expect(await readPracticeMoney(createKairosRepositories(db).metadata)).toEqual(money('1000', 'USDT'));
    expect(await loadPracticeMoney(db)).toMatchObject({ kind: 'ready', closedTrades: 1, currentAmount: '910' });
  });
});
