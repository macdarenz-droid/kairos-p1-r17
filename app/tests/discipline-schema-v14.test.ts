import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, exportKairosBackup, prepareBackupRestore } from '../src/application/backup';
import { createKairosBackupEnvelope, KAIROS_BACKUP_FORMAT_NAME, parseKairosBackup } from '../src/data/backup';
import {
  KAIROS_DATABASE_MIGRATIONS, KAIROS_V14_STORES, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, registerKairosMigrations, type KairosDatabase,
} from '../src/data/database';
import { isTradeBeforeSaveNote, type TradeDisciplineId, type TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-discipline-v14-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const at = '2026-10-24T08:00:00.000Z';
const trade: TradeRecord = { id: 'trade-v14' as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', source: 'manual', grossPnlCurrency: 'USDT', openedAt: null, closedAt: null, createdAt: at, updatedAt: at };
const record: TradeDisciplineRecord = {
  id: 'discipline-v14' as TradeDisciplineId, tradeId: trade.id, preTradeChecklist: [{ itemId: 'plan-written', label: 'I wrote down my plan', answer: 'yes' }],
  postTradeReview: [], mistakes: [], note: '', checklistCompletedAt: at, reviewedAt: null, createdAt: at, updatedAt: at,
};
const noted: TradeDisciplineRecord = { ...record, beforeSave: { notes: ['trade-limit', 'no-stop'], reason: 'A clean setup.', at } };

describe('T-057a what "Before you save" said, checked once', () => {
  it('keeps 1 to 6 known kinds once each, a trimmed reason of up to 200 characters or none, and a canonical time', () => {
    expect(isTradeBeforeSaveNote(noted.beforeSave)).toBe(true);
    expect(isTradeBeforeSaveNote({ notes: ['trade-limit', 'recent-loss', 'no-stop', 'big-news', 'bigger-size', 'rule-broken'], reason: null, at })).toBe(true);
    expect(isTradeBeforeSaveNote({ notes: ['no-stop'], reason: 'x'.repeat(200), at })).toBe(true);
    for (const bad of [
      { notes: [], reason: null, at }, { notes: ['no-stop', 'no-stop'], reason: null, at }, { notes: ['loss-limit'], reason: null, at },
      { notes: ['no-stop'], reason: '', at }, { notes: ['no-stop'], reason: ' padded', at }, { notes: ['no-stop'], reason: 'x'.repeat(201), at },
      { notes: ['no-stop'], reason: null, at: '2026-10-24' }, { notes: 'no-stop', reason: null, at },
    ]) expect(isTradeBeforeSaveNote(bad), JSON.stringify(bad)).toBe(false);
  });
});

describe('T-057a schema v14', () => {
  it('upgrades a v13 database, keeping every discipline record unchanged, and accepts the new note', async () => {
    const name = newName('upgrade');
    const v13 = new Dexie(name);
    registerKairosMigrations(v13, KAIROS_DATABASE_MIGRATIONS.slice(0, 13), 13);
    await v13.open();
    await v13.table('trades').put(trade);
    await v13.table('tradeDiscipline').put(record);
    v13.close();
    const db = createKairosDatabase(name); opened.push(db);
    expect(await openKairosDatabase(db)).toEqual({ state: 'ready', schemaVersion: 14 });
    expect(KAIROS_DATABASE_MIGRATIONS[13]).toEqual({ version: 14, stores: KAIROS_V14_STORES });
    expect(await db.tradeDiscipline.toArray()).toEqual([record]);
    await db.tradeDiscipline.put(noted);
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    // A stored note that breaks its rule fails the integrity check.
    await db.tradeDiscipline.put({ ...noted, beforeSave: { notes: ['no-stop'], reason: ' padded', at } });
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(false);
  });
});

describe('T-057a backup format 12', () => {
  it('exports format 12 (schema 14) with the note, and restores and verifies it', async () => {
    const source = await current('source');
    await source.trades.put(trade);
    await source.tradeDiscipline.put(noted);
    const exported = await exportKairosBackup(source, new Date(at));
    if (!exported.ok) throw new Error('export failed');
    expect(parseKairosBackup(exported.file.contents)).toMatchObject({ formatVersion: 12, databaseSchemaVersion: 14, recordCounts: { trades: 1, tradeDiscipline: 1 } });
    const target = await current('target');
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(target, prepared.restore)).ok).toBe(true);
    expect(await target.tradeDiscipline.toArray()).toEqual([noted]);
  });

  it('refuses a format 12 backup with a note that breaks its rule', () => {
    const envelope = createKairosBackupEnvelope({ metadata: [], trades: [trade], tradeDiscipline: [{ ...noted, beforeSave: { notes: ['no-stop', 'no-stop'], reason: null, at } }] });
    expect(() => parseKairosBackup(JSON.stringify(envelope))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
  });

  it('a format 11 backup still restores, keeping its discipline record', async () => {
    const format11 = JSON.stringify({
      formatName: KAIROS_BACKUP_FORMAT_NAME, formatVersion: 11, appVersion: 'old', buildId: 'old', exportedAt: at, databaseSchemaVersion: 13,
      recordCounts: { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1, exchangeRates: 0, economicEvents: 0, total: 2 },
      payload: { metadata: [], trades: [trade], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [record], exchangeRates: [], economicEvents: [] },
    });
    expect(parseKairosBackup(format11)).toMatchObject({ formatVersion: 12, databaseSchemaVersion: 14, recordCounts: { trades: 1, tradeDiscipline: 1, total: 2 } });
    const db = await current('format11');
    const prepared = await prepareBackupRestore(db, format11);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.tradeDiscipline.toArray()).toEqual([record]);
  });
});
