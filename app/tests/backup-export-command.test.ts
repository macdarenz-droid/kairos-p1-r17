import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineSavedAnalysis } from '../src/app/savedAnalysisContract';
import { createBrowserBackupDownloadPorts, exportKairosBackup, handBackupFileToBrowser, kairosBackupFileNameAt, type BackupDownloadPorts, type BackupDownloadWindow, type KairosBackupFile } from '../src/application/backup';
import { parseKairosBackup } from '../src/data/backup';
import { createKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p28-1-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const eth = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const moment = new Date('2026-09-18T15:51:00.250Z');

async function seeded(label: string) {
  const db = createKairosDatabase(dbName(label));
  await db.open();
  await db.metadata.bulkPut([
    { key: 'preferences.goals.v1', value: '{"version":1}', updatedAt: '2026-09-01T00:00:00.000Z' },
    { key: 'device.activation.receipt', value: 'opaque', updatedAt: '2026-09-01T00:00:00.000Z' },
  ]);
  await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-1', market: eth, drawings: [], riskRewards: [], label: 'Alpha plan' }));
  return db;
}

describe('P28.1 backup export command', () => {
  it('names the file from the UTC export moment to the second', () => {
    expect(kairosBackupFileNameAt(moment)).toBe('kairos-backup-2026-09-18T15-51-00Z.json');
    expect(kairosBackupFileNameAt(new Date('2026-01-02T03:04:05.000Z'))).toBe('kairos-backup-2026-01-02T03-04-05Z.json');
  });

  it('exports the released V4 snapshot as one named JSON file, device metadata excluded, and writes nothing', async () => {
    const db = await seeded('export');
    const before = { metadata: await db.metadata.count(), analyses: await db.savedAnalyses.count() };
    const result = await exportKairosBackup(db, moment);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    const { file } = result;
    expect(file.fileName).toBe('kairos-backup-2026-09-18T15-51-00Z.json');
    expect(file.mediaType).toBe('application/json');
    expect(file.exportedAt).toBe('2026-09-18T15:51:00.250Z');
    expect(file.recordCounts).toEqual({ metadata: 1, trades: 0, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 1, savedTimeAssistedSnapshots: 0, tradeDiscipline: 0, total: 2 });
    expect(file.byteLength).toBe(new TextEncoder().encode(file.contents).byteLength);
    expect(Object.isFrozen(file)).toBe(true);
    const parsed = parseKairosBackup(file.contents);
    expect(parsed.formatVersion).toBe(5);
    expect(parsed.databaseSchemaVersion).toBe(6);
    expect(parsed.payload.metadata.map(record => record.key)).toEqual(['preferences.goals.v1']);
    expect(parsed.payload.savedAnalyses[0]).toMatchObject({ id: 'a-1', label: 'Alpha plan' });
    expect({ metadata: await db.metadata.count(), analyses: await db.savedAnalyses.count() }).toEqual(before);
    db.close();
  });

  it('refuses an invalid export moment before touching the database', async () => {
    const db = createKairosDatabase(dbName('moment'));
    const transaction = vi.spyOn(db, 'transaction');
    expect(await exportKairosBackup(db, new Date('not a moment'))).toEqual({ ok: false, type: 'invalid-input', reason: 'export-moment-invalid' });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('reports a failed integrity check by its check ids instead of exporting', async () => {
    const db = await seeded('integrity');
    await db.metadata.put({ key: 'broken' } as never);
    const result = await exportKairosBackup(db, moment);
    expect(result).toEqual({ ok: false, type: 'integrity-error', reason: 'database-integrity-failed', failedChecks: ['metadata-record-shape'] });
    db.close();
  });

  it('reports a storage failure as an explicit result', async () => {
    const db = await seeded('storage');
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    expect(await exportKairosBackup(db, moment)).toEqual({ ok: false, type: 'storage-error', reason: 'backup-export-failed' });
    db.close();
  });

  it('hands the file to the browser through the ports and always releases the object URL', () => {
    const file: KairosBackupFile = Object.freeze({ fileName: 'kairos-backup-2026-09-18T15-51-00Z.json', mediaType: 'application/json', contents: '{"x":1}', byteLength: 7, exportedAt: '2026-09-18T15:51:00.250Z', recordCounts: { metadata: 0, trades: 0, tradePlans: 0, tradeExecutions: 0, tradeFees: 0, savedAnalyses: 0, savedTimeAssistedSnapshots: 0, total: 0 } });
    const calls: string[] = [];
    let blob: Blob | null = null;
    const ports: BackupDownloadPorts = {
      createObjectUrl: given => { blob = given; calls.push('create'); return 'blob:kairos/1'; },
      revokeObjectUrl: url => { calls.push(`revoke:${url}`); },
      triggerDownload: (url, fileName) => { calls.push(`download:${url}:${fileName}`); },
    };
    handBackupFileToBrowser(file, ports);
    expect(calls).toEqual(['create', 'download:blob:kairos/1:kairos-backup-2026-09-18T15-51-00Z.json', 'revoke:blob:kairos/1']);
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as unknown as Blob).type).toBe('application/json');
    expect((blob as unknown as Blob).size).toBe(7);
    const failing: BackupDownloadPorts = { ...ports, triggerDownload: () => { throw new Error('blocked'); } };
    calls.splice(0);
    expect(() => handBackupFileToBrowser(file, failing)).toThrow('blocked');
    expect(calls).toEqual(['create', 'revoke:blob:kairos/1']);
  });

  it('builds the browser ports over the window URL and an invisible anchor click', () => {
    const anchor = { href: '', download: '', rel: '', style: { display: '' }, click: vi.fn(), remove: vi.fn() };
    const body = { append: vi.fn() };
    const window = { URL: { createObjectURL: vi.fn(() => 'blob:kairos/2'), revokeObjectURL: vi.fn() }, document: { createElement: vi.fn(() => anchor), body } } as unknown as BackupDownloadWindow;
    const ports = createBrowserBackupDownloadPorts(window);
    const blob = new Blob(['{}'], { type: 'application/json' });
    expect(ports.createObjectUrl(blob)).toBe('blob:kairos/2');
    ports.triggerDownload('blob:kairos/2', 'kairos-backup-x.json');
    expect(anchor).toMatchObject({ href: 'blob:kairos/2', download: 'kairos-backup-x.json', rel: 'noopener', style: { display: 'none' } });
    expect(body.append).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    ports.revokeObjectUrl('blob:kairos/2');
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:kairos/2');
  });
});
