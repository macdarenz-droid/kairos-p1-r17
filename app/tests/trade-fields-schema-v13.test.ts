import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, commitTradeImport, exportKairosBackup, prepareBackupRestore, prepareTradeImport } from '../src/application/backup';
import { tradeRevision } from '../src/application/trades/tradeRevision';
import { createKairosBackupEnvelope, KAIROS_BACKUP_FORMAT_NAME, parseKairosBackup } from '../src/data/backup';
import {
  KAIROS_DATABASE_MIGRATIONS, KAIROS_V13_STORES, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, registerKairosMigrations, type KairosDatabase,
} from '../src/data/database';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import {
  normalizeTradeTags, validateTradeFields, validateTradePlanFields, type DecimalString, type TradeId, type TradePlanId, type TradePlanRecord, type TradeRecord,
} from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-fields-v13-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const at = '2026-10-20T08:00:00.000Z';
const old: TradeRecord = { id: 'trade-v12' as TradeId, symbol: 'ESZ6', marketType: 'futures', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USD', openedAt: at, closedAt: '2026-10-20T09:00:00.000Z', createdAt: at, updatedAt: at };
/** A trade with every U11 field (D237–D239). */
const full: TradeRecord = { ...old, id: 'trade-v13' as TradeId, contractSize: '50' as DecimalString, exchange: 'CME', tags: ['breakout', 'London open'], leverage: '10' as DecimalString };
const plan: TradePlanRecord = {
  id: 'plan-v13' as TradePlanId, tradeId: full.id, plannedEntryPrice: '5000' as DecimalString, plannedStopPrice: '4990' as DecimalString, plannedTargetPrice: '5030' as DecimalString,
  plannedQuantity: '1' as DecimalString, reason: 'Broke the opening range on volume.', createdAt: at, updatedAt: at,
};

describe('T-056a the trade fields, written one way and checked once', () => {
  it('tags are trimmed, their spaces joined, repeats in another case left out, and at most 10 of 24 characters', () => {
    expect(normalizeTradeTags(['  breakout ', 'London   open', 'Breakout', '', 'news'])).toEqual({ ok: true, tags: ['breakout', 'London open', 'news'] });
    expect(normalizeTradeTags(Array.from({ length: 11 }, (_, i) => `tag ${i}`))).toEqual({ ok: false, reason: 'too-many' });
    expect(normalizeTradeTags(['x'.repeat(25)])).toEqual({ ok: false, reason: 'too-long' });
    expect(normalizeTradeTags(['x'.repeat(24)]).ok).toBe(true);
  });

  it('each field is absent or right: a positive contract size and leverage of at most 1000, a short name, tags in their one form, a short reason', () => {
    expect(validateTradeFields(full).ok).toBe(true);
    expect(validateTradeFields(old).ok).toBe(true);
    for (const [fields, reason] of [
      [{ contractSize: '0' }, 'invalid-contract-size'], [{ contractSize: '-5' }, 'invalid-contract-size'],
      [{ exchange: 'x'.repeat(41) }, 'invalid-exchange'], [{ exchange: ' CME' }, 'invalid-exchange'], [{ exchange: '' }, 'invalid-exchange'],
      [{ tags: ['Breakout', 'breakout'] }, 'invalid-tags'], [{ tags: [' padded'] }, 'invalid-tags'],
      // Review r1: no tags is an absent key, never an empty list; where it was traded is one line.
      [{ tags: [] }, 'invalid-tags'], [{ exchange: 'CME\nGlobex' }, 'invalid-exchange'], [{ exchange: 'CME  Globex' }, 'invalid-exchange'],
      [{ leverage: '0' }, 'invalid-leverage'], [{ leverage: '1000.5' }, 'invalid-leverage'], [{ leverage: '1001' }, 'invalid-leverage'],
    ] as const) expect(validateTradeFields(fields as never), JSON.stringify(fields)).toEqual({ ok: false, reason });
    expect(validateTradeFields({ leverage: '1000' as DecimalString }).ok).toBe(true);
    expect(validateTradeFields({ leverage: '999.99' as DecimalString }).ok).toBe(true);
    expect(validateTradePlanFields(plan).ok).toBe(true);
    expect(validateTradePlanFields({ reason: 'x'.repeat(501) })).toEqual({ ok: false, reason: 'invalid-plan-reason' });
  });

  it('a stale edit is refused once another tab adds a contract size: the revision covers the new fields', () => {
    const snapshot = (trade: TradeRecord) => tradeRevision({ trade, executions: [], fees: [] });
    expect(snapshot({ ...old, contractSize: '50' as DecimalString })).not.toBe(snapshot(old));
    expect(snapshot({ ...old, tags: ['news'] })).not.toBe(snapshot(old));
  });
});

describe('T-056a schema v13', () => {
  it('upgrades a v12 database, keeping every row unchanged, and finds a trade by any of its tags', async () => {
    const name = newName('upgrade');
    const v12 = new Dexie(name);
    registerKairosMigrations(v12, KAIROS_DATABASE_MIGRATIONS.slice(0, 12), 12);
    await v12.open();
    await v12.table('trades').put(old);
    await v12.table('metadata').put({ key: 'preferences.goals.v1', value: '{"version":1}', updatedAt: at });
    v12.close();
    const db = createKairosDatabase(name); opened.push(db);
    expect(await openKairosDatabase(db)).toEqual({ state: 'ready', schemaVersion: 13 });
    expect(await db.trades.toArray()).toEqual([old]);
    expect(KAIROS_DATABASE_MIGRATIONS[12]).toEqual({ version: 13, stores: KAIROS_V13_STORES });
    await db.trades.put(full);
    await db.tradePlans.put(plan);
    expect((await db.trades.where('tags').equals('London open').toArray()).map(trade => trade.id)).toEqual([full.id]);
    expect((await db.trades.where('tags').equals('breakout').toArray()).map(trade => trade.id)).toEqual([full.id]);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    // A stored value that breaks a field's rule fails the integrity check.
    await db.trades.put({ ...full, id: 'trade-bad' as TradeId, tags: ['Breakout', 'breakout'] });
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(false);
  });
});

describe('T-056a backup format 11', () => {
  it('a backup with every new field exports as format 11 (schema 13), restores and verifies with them all', async () => {
    const source = await current('source');
    await source.trades.put(full);
    await source.tradePlans.put(plan);
    await source.trades.put(old);
    const exported = await exportKairosBackup(source, new Date(at));
    if (!exported.ok) throw new Error('export failed');
    expect(parseKairosBackup(exported.file.contents)).toMatchObject({ formatVersion: 11, databaseSchemaVersion: 13, recordCounts: { trades: 2, tradePlans: 1 } });
    const target = await current('target');
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(target, prepared.restore)).ok).toBe(true);
    expect(await target.trades.get(full.id)).toEqual(full);
    expect(await target.trades.get(old.id)).toEqual(old);
    expect(Object.keys((await target.trades.get(old.id))!)).not.toContain('contractSize');
    expect(await target.tradePlans.get(plan.id)).toEqual(plan);
  });

  it('a merge import keeps the new fields and refuses a trade whose field breaks its rule', async () => {
    const source = await current('merge-source');
    await source.trades.put(full);
    await source.tradePlans.put(plan);
    const exported = await exportKairosBackup(source, new Date(at));
    if (!exported.ok) throw new Error('export failed');
    const target = await current('merge-target');
    const prepared = await prepareTradeImport(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitTradeImport(target, prepared.import)).ok).toBe(true);
    expect(await target.trades.get(full.id)).toMatchObject({ contractSize: '50', exchange: 'CME', tags: ['breakout', 'London open'], leverage: '10' });
    expect(await target.tradePlans.get(plan.id)).toMatchObject({ reason: plan.reason });
    const repeated = createKairosBackupEnvelope({ metadata: [], trades: [{ ...full, id: 'trade-repeated-tags' as TradeRecord['id'], tags: ['breakout', 'Breakout'] }] });
    expect(await prepareTradeImport(target, JSON.stringify(repeated))).toMatchObject({ ok: false, reason: 'backup-unreadable', code: 'INVALID_PAYLOAD' });
    expect(await target.trades.get('trade-repeated-tags' as TradeRecord['id'])).toBeUndefined();
  });

  it('refuses a format 11 backup with a field that breaks its rule', () => {
    const bad = (trade: Record<string, unknown>) => {
      const envelope = createKairosBackupEnvelope({ metadata: [], trades: [trade as unknown as TradeRecord] });
      return () => parseKairosBackup(JSON.stringify(envelope));
    };
    for (const fields of [{ contractSize: '0' }, { leverage: '0' }, { tags: Array.from({ length: 11 }, (_, i) => `tag ${i}`) }, { exchange: 'x'.repeat(41) }]) {
      expect(bad({ ...full, ...fields }), JSON.stringify(fields)).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    }
    const badPlan = createKairosBackupEnvelope({ metadata: [], trades: [full], tradePlans: [{ ...plan, reason: 'x'.repeat(501) }] });
    expect(() => parseKairosBackup(JSON.stringify(badPlan))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
  });

  it('a format 10 backup still restores, keeping its discipline record, rate and news', async () => {
    const savedAt = '2026-09-19T08:00:00.000Z';
    const discipline: TradeDisciplineRecord = {
      id: 'discipline-v10' as TradeDisciplineId, tradeId: old.id, preTradeChecklist: [{ itemId: 'plan-written', label: 'I wrote down my plan', answer: 'yes' }],
      postTradeReview: [], mistakes: [], note: '', checklistCompletedAt: at, reviewedAt: null, createdAt: at, updatedAt: at,
    };
    const rate: ExchangeRateRecord = { id: exchangeRateId('ecb', 'EUR', 'USD', '2026-09-18'), source: 'ecb', from: 'EUR', to: 'USD', day: '2026-09-18', rateDay: '2026-09-18', rate: '1.146' as DecimalString, savedAt };
    const news: EconomicEventRecord = { id: economicEventId('typed', 'cpi'), source: 'typed', title: 'US CPI', currency: 'USD', startsAt: '2026-09-24T12:30:00.000Z', impact: 'high', expected: '3.1%', previous: '2.9%', actual: null, savedAt, fetchedAt: null };
    const format10 = JSON.stringify({
      formatName: KAIROS_BACKUP_FORMAT_NAME, formatVersion: 10, appVersion: 'old', buildId: 'old', exportedAt: '2026-09-21T00:00:00.000Z', databaseSchemaVersion: 12,
      recordCounts: { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, exchangeRates: 1, economicEvents: 1, total: 4 },
      payload: { metadata: [], trades: [old], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [discipline], exchangeRates: [rate], economicEvents: [news] },
    });
    expect(parseKairosBackup(format10)).toMatchObject({ formatVersion: 11, databaseSchemaVersion: 13, recordCounts: { trades: 1, tradeDiscipline: 1, exchangeRates: 1, economicEvents: 1, total: 4 } });
    const db = await current('format10');
    const prepared = await prepareBackupRestore(db, format10);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.tradeDiscipline.toArray()).toEqual([discipline]);
    expect(await db.exchangeRates.toArray()).toEqual([rate]);
    expect(await db.economicEvents.toArray()).toEqual([news]);
  });
});
