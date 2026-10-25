import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, exportKairosBackup, prepareBackupRestore } from '../src/application/backup';
import { getJournalHistoryEntry, listJournalHistoryPage, type JournalHistoryCursor } from '../src/application/journal';
import { openDraftTrade, saveManualTrade, updateTradeExecution } from '../src/application/trades';
import { createKairosBackupEnvelope, KAIROS_BACKUP_FORMAT_NAME, parseKairosBackup } from '../src/data/backup';
import {
  KAIROS_DATABASE_MIGRATIONS, KAIROS_V15_STORES, createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, registerKairosMigrations, type KairosDatabase,
} from '../src/data/database';
import { TRADE_NOTE_MAX_LENGTH, tradeJournalAt, validateTradeRecord, type TradeId, type TradeRecord } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-journal-order-v15-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const trade = (id: string, fields: Partial<TradeRecord>): TradeRecord => ({
  id: id as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', source: 'manual',
  openedAt: null, closedAt: null, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-20T08:00:00.000Z', ...fields,
});
const draft = trade('t-draft', { createdAt: '2026-10-05T08:00:00.000Z' });
const open = trade('t-open', { status: 'open', openedAt: '2026-10-03T08:00:00.000Z' });
const closed = trade('t-closed', { status: 'closed', openedAt: '2026-10-02T08:00:00.000Z', closedAt: '2026-10-02T09:00:00.000Z' });
const cancelled = trade('t-cancelled', { status: 'cancelled', createdAt: '2026-10-04T08:00:00.000Z' });

describe('T-060a when a trade happened (D259)', () => {
  it('is when it was opened, else when it was planned', () => {
    expect(tradeJournalAt(open)).toBe('2026-10-03T08:00:00.000Z');
    expect(tradeJournalAt(draft)).toBe('2026-10-05T08:00:00.000Z');
  });
});

describe('T-060a schema v15', () => {
  it('upgrades a v14 database: every trade gets its Journal date, nothing it entered changes, integrity is ready', async () => {
    const name = newName('upgrade');
    const v14 = new Dexie(name);
    registerKairosMigrations(v14, KAIROS_DATABASE_MIGRATIONS.slice(0, 14), 14);
    await v14.open();
    await v14.table('trades').bulkPut([draft, open, closed, cancelled]);
    v14.close();
    const db = createKairosDatabase(name); opened.push(db);
    expect(await openKairosDatabase(db)).toEqual({ state: 'ready', schemaVersion: 15 });
    expect(KAIROS_DATABASE_MIGRATIONS[14]).toMatchObject({ version: 15, stores: KAIROS_V15_STORES });
    const rows = new Map((await db.trades.toArray()).map(row => [row.id, row]));
    expect(rows.get(draft.id)).toEqual({ ...draft, journalAt: '2026-10-05T08:00:00.000Z' });
    expect(rows.get(open.id)).toEqual({ ...open, journalAt: '2026-10-03T08:00:00.000Z' });
    expect(rows.get(closed.id)).toEqual({ ...closed, journalAt: '2026-10-02T08:00:00.000Z' });
    expect(rows.get(cancelled.id)).toEqual({ ...cancelled, journalAt: '2026-10-04T08:00:00.000Z' });
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
    // The Journal reads them in that order: draft (planned 5 Oct), cancelled (4 Oct), open (3 Oct), closed (2 Oct).
    expect((await listJournalHistoryPage(db)).entries.map(entry => entry.trade.id)).toEqual([draft.id, cancelled.id, open.id, closed.id]);
  });

  it('stamps every write: a new trade, "I\'m in", and a frozen record put straight into the table', async () => {
    const db = await current('writes');
    const saved = await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'draft' }, { now: () => '2026-10-10T08:00:00.000Z' });
    if (!saved.ok) throw new Error('save');
    expect((await db.trades.get(saved.tradeId))?.journalAt).toBe('2026-10-10T08:00:00.000Z');
    const entry = await getJournalHistoryEntry(db, saved.tradeId);
    if (entry === null) throw new Error('read');
    const inTrade = await openDraftTrade(db, { expected: entry, openedAt: '2026-10-11T09:30:00.000Z', executions: [], fees: [] }, { now: () => '2026-10-11T09:31:00.000Z' });
    expect(inTrade.ok).toBe(true);
    expect((await db.trades.get(saved.tradeId))?.journalAt).toBe('2026-10-11T09:30:00.000Z');
    await db.trades.put(Object.freeze(trade('t-frozen', { createdAt: '2026-10-12T08:00:00.000Z' })));
    expect((await db.trades.get('t-frozen' as TradeId))?.journalAt).toBe('2026-10-12T08:00:00.000Z');
  });
});

describe('T-060a backup format 13', () => {
  it('leaves the Journal date out, carries the note, and restores with the date stamped again and verified', async () => {
    const source = await current('export');
    const noted = { ...closed, note: 'Entered late; the plan was fine.' };
    await source.trades.bulkPut([noted, draft]);
    const exported = await exportKairosBackup(source, new Date('2026-10-24T08:00:00.000Z'));
    if (!exported.ok) throw new Error('export');
    const parsed = parseKairosBackup(exported.file.contents);
    expect(parsed).toMatchObject({ formatVersion: 13, databaseSchemaVersion: 15, recordCounts: { trades: 2 } });
    expect(parsed.payload.trades.every(row => !('journalAt' in row))).toBe(true);
    expect(parsed.payload.trades.find(row => row.id === closed.id)?.note).toBe('Entered late; the plan was fine.');
    // Review r1: a file that carries a Journal date was not written by Kairos; it is refused before anything is replaced.
    const file = JSON.parse(exported.file.contents) as { payload: { trades: Record<string, unknown>[] } };
    file.payload.trades[0] = { ...file.payload.trades[0], journalAt: '2030-01-01T00:00:00.000Z' };
    expect(() => parseKairosBackup(JSON.stringify(file))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    const target = await current('restore');
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error(prepared.type);
    expect(await commitBackupRestore(target, prepared.restore)).toMatchObject({ ok: true });
    expect(await target.trades.get(closed.id)).toEqual({ ...noted, journalAt: '2026-10-02T08:00:00.000Z' });
    expect((await target.trades.get(draft.id))?.journalAt).toBe('2026-10-05T08:00:00.000Z');
  });

  it('still restores a format 12 backup, and refuses one whose trade carries a note', async () => {
    const counts = { metadata: 0, trades: 1, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, tradeDiscipline: 0, exchangeRates: 0, economicEvents: 0, total: 1 };
    const format12 = (row: TradeRecord) => JSON.stringify({
      formatName: KAIROS_BACKUP_FORMAT_NAME, formatVersion: 12, appVersion: 'old', buildId: 'old', exportedAt: '2026-10-20T08:00:00.000Z', databaseSchemaVersion: 14,
      recordCounts: counts, payload: { metadata: [], trades: [row], tradePlans: [], tradeExecutions: [], tradeFees: [], savedAnalyses: [], savedTimeAssistedSnapshots: [], tradeDiscipline: [], exchangeRates: [], economicEvents: [] },
    });
    expect(parseKairosBackup(format12(open))).toMatchObject({ formatVersion: 13, databaseSchemaVersion: 15, recordCounts: { trades: 1 } });
    expect(() => parseKairosBackup(format12({ ...open, note: 'Not in format 12.' }))).toThrow(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    const target = await current('format12');
    const prepared = await prepareBackupRestore(target, format12(open));
    if (!prepared.ok) throw new Error(prepared.type);
    expect(await commitBackupRestore(target, prepared.restore)).toMatchObject({ ok: true });
    expect((await target.trades.get(open.id))?.journalAt).toBe('2026-10-03T08:00:00.000Z');
    // A fresh current envelope is format 13.
    expect(createKairosBackupEnvelope({ metadata: [] })).toMatchObject({ formatVersion: 13, databaseSchemaVersion: 15 });
  });

  it('checks a note: trimmed text of 1 to 2,000 characters', () => {
    expect(validateTradeRecord({ ...open, note: 'x'.repeat(TRADE_NOTE_MAX_LENGTH) }).ok).toBe(true);
    for (const note of ['', '  padded', 'x'.repeat(TRADE_NOTE_MAX_LENGTH + 1)]) expect(validateTradeRecord({ ...open, note }).ok, note.slice(0, 10)).toBe(false);
  });
});

describe('T-060a the Journal in the order trades happened', () => {
  it('fixing a fee on an old trade never moves it to the top', async () => {
    const db = await current('fee-fix');
    const older = await saveManualTrade(db, {
      symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-10-01T08:00:00.000Z', closedAt: '2026-10-01T09:00:00.000Z',
      executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-10-01T08:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-10-01T09:00:00.000Z' }],
      fees: [{ amount: '1', currency: 'USDT' }],
    }, { now: () => '2026-10-01T09:05:00.000Z' });
    const newer = await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: '2026-10-05T08:00:00.000Z' }, { now: () => '2026-10-05T08:05:00.000Z' });
    if (!older.ok || !newer.ok) throw new Error('save');
    const entry = await getJournalHistoryEntry(db, older.tradeId);
    if (entry === null) throw new Error('read');
    const fixed = await updateTradeExecution(db, { expected: entry, fee: { id: entry.fees[0]!.id, amount: '1.5', currency: 'USDT' } }, { now: () => '2026-10-20T08:00:00.000Z' });
    expect(fixed.ok).toBe(true);
    expect((await listJournalHistoryPage(db)).entries.map(row => row.trade.id)).toEqual([newer.tradeId, older.tradeId]);
  });

  it('review r1: the Open list reads only open trades, however many closed trades are newer', async () => {
    const db = await current('status');
    const closedRows = Array.from({ length: 400 }, (_, index) => trade(`t-c${String(index).padStart(3, '0')}`, { status: 'closed', openedAt: '2026-10-09T08:00:00.000Z', closedAt: '2026-10-09T09:00:00.000Z' }));
    const openRows = [1, 2, 3].map(day => trade(`t-o${day}`, { status: 'open', openedAt: `2026-10-0${day}T08:00:00.000Z` }));
    await db.trades.bulkPut([...closedRows, ...openRows]);
    const steps = vi.spyOn(IDBCursor.prototype, 'continue');
    const page = await listJournalHistoryPage(db, { status: 'open' });
    expect(page.entries.map(row => row.trade.id)).toEqual(['t-o3', 't-o2', 't-o1']);
    const onTrades = (cursor: IDBCursor) => { const source = cursor.source as IDBIndex | IDBObjectStore; return ('objectStore' in source ? source.objectStore : source).name === 'trades'; };
    expect(steps.mock.contexts.filter(cursor => onTrades(cursor as IDBCursor)).length).toBeLessThan(10);
    const older = await listJournalHistoryPage(db, { status: 'closed', before: { journalAt: '2026-10-09T08:00:00.000Z', id: 't-c002' as TradeId } });
    expect(older.entries.map(row => row.trade.id)).toEqual(['t-c001', 't-c000']);
  });

  it('pages trades with the same date by id, each once', async () => {
    const db = await current('ties');
    const same = '2026-10-07T08:00:00.000Z';
    const rows = Array.from({ length: 205 }, (_, index) => trade(`t-${String(index).padStart(3, '0')}`, { status: 'open', openedAt: same }));
    await db.trades.bulkPut(rows);
    const seen: string[] = [];
    let before: JournalHistoryCursor | null = null;
    do {
      const page = await listJournalHistoryPage(db, { before });
      seen.push(...page.entries.map(row => row.trade.id));
      before = page.nextCursor;
    } while (before !== null);
    expect(seen).toEqual(rows.map(row => row.id).sort().reverse());
  });
});
