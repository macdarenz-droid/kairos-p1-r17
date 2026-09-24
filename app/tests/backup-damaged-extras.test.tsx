import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfileRoute } from '../src/app/ProfileRoute';
import { commitBackupRestore, exportKairosBackup, prepareBackupRestore, type BackupDownloadPorts } from '../src/application/backup';
import { createKairosBackupEnvelope, serializeKairosBackup } from '../src/data/backup';
import {
  assertKairosCoreIntegrity,
  createKairosDatabase,
  DatabaseIntegrityError,
  inspectKairosDatabaseIntegrity,
  openKairosDatabase,
  runKairosAtomicWrite,
  type KairosDatabase,
} from '../src/data/database';
import type { TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-t030-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return db;
}
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const tradeId = 'trade-t030' as TradeId;
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-19T08:00:00.000Z', closedAt: '2026-09-19T09:30:00.000Z', createdAt: '2026-09-19T08:00:00.000Z', updatedAt: '2026-09-19T09:30:00.000Z' };
const orphanDiscipline: TradeDisciplineRecord = {
  id: 'discipline-orphan' as TradeDisciplineId,
  tradeId: 'missing-trade' as TradeId,
  preTradeChecklist: [{ key: 'plan-written', answer: 'yes' }, { key: 'risk-defined', answer: 'yes' }, { key: 'stop-placed', answer: 'no' }],
  postTradeReview: [{ key: 'followed-plan', answer: 'no' }, { key: 'emotions-in-check', answer: 'yes' }],
  mistakes: ['moved-stop', 'early-exit'],
  note: 'Moved the stop after a wick; exited before the target.',
  checklistCompletedAt: '2026-09-19T07:55:00.000Z',
  reviewedAt: '2026-09-19T10:00:00.000Z',
  createdAt: '2026-09-19T07:55:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
};

async function seedTrade(db: KairosDatabase, record: TradeRecord = trade) {
  await runKairosAtomicWrite(db, ['trades'], async ({ repositories }) => { await repositories.trades.put(record); });
}
async function damageExtras(db: KairosDatabase) {
  await db.tradeDiscipline.put(orphanDiscipline);
  await db.savedAnalyses.put({ id: 'broken-analysis', market: null, drawings: 'nope' } as never);
}
async function damageTrade(db: KairosDatabase) {
  await db.trades.put({ ...trade, id: 'bad-trade' as TradeId, symbol: '' } as TradeRecord);
}
const validBackup = () => serializeKairosBackup(createKairosBackupEnvelope({
  metadata: [{ key: 'preferences.goals.v1', value: '{"version":1}', updatedAt: '2026-09-17T07:59:00.000Z' }],
  trades: [trade],
  exportedAt: new Date('2026-09-17T08:00:00.000Z'),
}));

describe('T-030 integrity tiers', () => {
  it('marks journal checks core and extra-store checks secondary; only core failures block', async () => {
    const db = await database();
    await seedTrade(db);
    await damageExtras(db);
    const report = await inspectKairosDatabaseIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.coreOk).toBe(true);
    expect(report.checks.find(check => check.id === 'trade-record-shape')?.tier).toBe('core');
    expect(report.checks.filter(check => !check.ok).map(check => [check.id, check.tier])).toEqual([
      ['saved-analysis-record-shape', 'secondary'],
      ['trade-discipline-reference-integrity', 'secondary'],
    ]);
    await expect(assertKairosCoreIntegrity(db)).resolves.toMatchObject({ coreOk: true });
    await damageTrade(db);
    await expect(assertKairosCoreIntegrity(db)).rejects.toThrow(DatabaseIntegrityError);
  });
});

describe('T-030 backup export skips damaged extras', () => {
  it('an orphan discipline record and a malformed saved analysis: export succeeds with 1 + 1 skipped, and that backup restores cleanly', async () => {
    const db = await database();
    await seedTrade(db);
    await damageExtras(db);
    const exported = await exportKairosBackup(db, new Date('2026-09-20T10:00:00.000Z'));
    expect(exported).toMatchObject({ ok: true, skipped: { savedAnalyses: 1, savedTimeAssistedSnapshots: 0, tradeDiscipline: 1 } });
    if (!exported.ok) throw new Error('export');
    expect(await db.savedAnalyses.count()).toBe(1);
    expect(await db.tradeDiscipline.count()).toBe(1);

    const target = await database();
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    expect(prepared).toMatchObject({ ok: true, restore: { recoveryKind: 'backup' } });
    if (!prepared.ok) throw new Error('prepare');
    await expect(commitBackupRestore(target, prepared.restore)).resolves.toMatchObject({ ok: true, restored: { restoredTradeRecords: 1, restoredSavedAnalysisRecords: 0, verifiedAfterReload: true } });
    expect((await inspectKairosDatabaseIntegrity(target)).ok).toBe(true);
  });

  it('a trade with a bad record: export is still refused with integrity-error', async () => {
    const db = await database();
    await seedTrade(db);
    await damageTrade(db);
    await expect(exportKairosBackup(db, new Date('2026-09-20T10:00:00.000Z'))).resolves.toMatchObject({ ok: false, type: 'integrity-error', failedChecks: ['trade-record-shape'] });
  });
});

describe('T-030 restore with damaged current data', () => {
  it('prepares with a raw recovery copy, then restores a valid backup and verifies it', async () => {
    const db = await database();
    await seedTrade(db);
    await damageTrade(db);
    const prepared = await prepareBackupRestore(db, validBackup());
    expect(prepared).toMatchObject({ ok: true, restore: { recoveryKind: 'raw' } });
    if (!prepared.ok) throw new Error('prepare');
    const raw = JSON.parse(prepared.restore.recoveryFile.contents);
    expect(raw.format).toBe('kairos-raw-recovery');
    expect(raw.stores.trades.map((row: TradeRecord) => row.id).sort()).toEqual(['bad-trade', tradeId]);
    expect(prepared.restore.recoveryFile.fileName).toMatch(/^kairos-raw-recovery-/);

    await expect(commitBackupRestore(db, prepared.restore)).resolves.toMatchObject({ ok: true, restored: { restoredTradeRecords: 1, verifiedAfterReload: true } });
    expect((await inspectKairosDatabaseIntegrity(db)).ok).toBe(true);
  });
});

describe('T-030 Profile messages', () => {
  const downloads: BackupDownloadPorts = { createObjectUrl: () => 'blob:kairos/1', revokeObjectUrl: () => undefined, triggerDownload: () => undefined };
  const mount = (db: KairosDatabase) => render(<MemoryRouter><ProfileRoute db={db} now={() => '2026-09-20T10:00:00.000Z'} downloads={downloads} readBackupFile={file => file.text()} /></MemoryRouter>);

  it('says how many damaged items a backup left out', async () => {
    const db = await database();
    await seedTrade(db);
    await damageExtras(db);
    mount(db);
    fireEvent.click(await screen.findByRole('button', { name: 'Download backup' }));
    expect(await screen.findByText('Backup saved. 2 saved items were damaged and left out; they are still on this device.')).toBeInTheDocument();
  });

  it('warns that the current data has a problem before a restore', async () => {
    const db = await database();
    await seedTrade(db);
    await damageTrade(db);
    mount(db);
    fireEvent.change(await screen.findByLabelText('Backup file'), { target: { files: [new File([validBackup()], 'backup.json', { type: 'application/json' })] } });
    expect(await screen.findByText('Your current data has a problem. Download the raw copy first; it may not restore.')).toBeInTheDocument();
  });
});
