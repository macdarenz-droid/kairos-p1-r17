import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ProfileRoute } from '../src/app/ProfileRoute';
import { defineSavedAnalysis } from '../src/app/savedAnalysisContract';
import { exportKairosBackup, type BackupDownloadPorts } from '../src/application/backup';
import { listJournalHistory } from '../src/application/journal';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
async function database() { const name = `kairos-profile-import-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });
const now = () => '2026-09-18T17:10:00.000Z';
const ports: BackupDownloadPorts = { createObjectUrl: () => 'blob:kairos/x', revokeObjectUrl: () => {}, triggerDownload: () => {} };
const route = () => screen.getByRole('region', { name: 'Profile' });
const mount = (db: Awaited<ReturnType<typeof database>>) => render(<MemoryRouter><ProfileRoute db={db} now={now} downloads={ports} readBackupFile={file => file.text()} /></MemoryRouter>);
const choose = (contents: string, name = 'other-device.json') => fireEvent.change(screen.getByLabelText('Backup file to import from'), { target: { files: [new File([contents], name, { type: 'application/json' })] } });
const closed = (symbol: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }], fees: [{ amount: '0.5', currency: 'USDT' }] } as const);

async function otherDeviceBackup(sharedSymbol: string, sharedId: string) {
  const other = await database();
  await saveManualTrade(other, closed(sharedSymbol), { now, createId: (() => { let i = 0; return <T,>() => (i++ === 0 ? sharedId : `o-${sharedSymbol}-${i}`) as T; })() });
  await saveManualTrade(other, closed('ETHUSDT'), { now });
  await createKairosRepositories(other).savedAnalyses.put(defineSavedAnalysis({ id: 'a-other', market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, drawings: [], riskRewards: [], label: 'Other plan' }));
  const exported = await exportKairosBackup(other, new Date(now()));
  if (!exported.ok) throw new Error('fixture');
  return exported.file.contents;
}

describe('P32.2 Profile trade import control (P33.2: saved records travel with the trades)', () => {
  it('previews the trades this device lacks, adds exactly them on confirmation and reports it', async () => {
    const db = await database();
    const shared = await saveManualTrade(db, closed('BTCUSDT'), { now, createId: (() => { let i = 0; return <T,>() => (i++ === 0 ? 'shared-btc' : `l-${i}`) as T; })() });
    if (!shared.ok) throw new Error('fixture');
    const backup = await otherDeviceBackup('BTCUSDT', 'shared-btc');
    mount(db);
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('idle'));
    choose(backup);
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('preview'));
    expect(route().querySelector('[data-profile-import-new]')!.getAttribute('data-profile-import-new')).toBe('2');
    expect(route().querySelector('[data-profile-import-new] p')!.textContent).toBe('other-device.json was exported 2026-09-18 17:10:00 UTC. It holds 1 trade and 0 practice trades this device does not have, with 2 fills, 1 fee and 0 plans; 1 trade already here will be left as they are.');
    expect(route().querySelector('[data-profile-import-records]')!.textContent).toBe('It also holds 1 saved analysis and 0 saved snapshots this device does not have; 0 saved records already here will be left as they are.');
    expect(await db.trades.count()).toBe(1);
    expect(await db.savedAnalyses.count()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add these records' }));
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('done'));
    expect(screen.getByRole('status').textContent).toBe('Added 1 trade from other-device.json with 2 fills, 1 fee and 0 plans, plus 1 saved analysis and 0 saved snapshots. Imported trades show their source as Import.');
    expect(await createKairosRepositories(db).savedAnalyses.get('a-other')).toMatchObject({ id: 'a-other', label: 'Other plan' });
    expect((await db.trades.toArray()).map(trade => [trade.symbol, trade.source]).sort()).toEqual([['BTCUSDT', 'manual'], ['ETHUSDT', 'import']]);
    expect((await listJournalHistory(db)).map(entry => entry.trade.symbol).sort()).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect((screen.getByLabelText('Backup file to import from') as HTMLInputElement).disabled).toBe(false);
  });

  it('refuses a non-backup, lets the user cancel a preview and disables adding when nothing is new', async () => {
    const db = await database();
    await saveManualTrade(db, closed('BTCUSDT'), { now, createId: (() => { let i = 0; return <T,>() => (i++ === 0 ? 'shared-btc' : `l-${i}`) as T; })() });
    const backup = await otherDeviceBackup('BTCUSDT', 'shared-btc');
    mount(db);
    choose('{"hello":true}', 'notes.json');
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('refused'));
    expect(screen.getByRole('alert').textContent).toBe('That file is not a Kairos backup (FORMAT_NAME_MISMATCH). Nothing was changed.');
    choose(backup);
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('preview'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(route().getAttribute('data-profile-import')).toBe('idle');
    expect(await db.trades.count()).toBe(1);
    const own = await exportKairosBackup(db, new Date(now()));
    if (!own.ok) throw new Error('fixture');
    choose(own.file.contents, 'same-device.json');
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('preview'));
    expect(route().querySelector('[data-profile-import-new]')!.getAttribute('data-profile-import-new')).toBe('0');
    expect((screen.getByRole('button', { name: 'Add these records' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a write failure with nothing added', async () => {
    const db = await database();
    const backup = await otherDeviceBackup('BTCUSDT', 'shared-btc');
    mount(db);
    choose(backup);
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('preview'));
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    fireEvent.click(screen.getByRole('button', { name: 'Add these records' }));
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('failed'));
    expect(screen.getByRole('alert').textContent).toBe('Kairos could not write the imported trades. Nothing was added.');
    vi.restoreAllMocks();
    expect(await db.trades.count()).toBe(0);
  });
});

describe('P33.2 Profile import of saved records', () => {
  it('adds only the saved records this device lacks when the backup holds no new trade, keeping local labels', async () => {
    const db = await database();
    await createKairosRepositories(db).savedAnalyses.put(defineSavedAnalysis({ id: 'a-shared', market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, drawings: [], riskRewards: [], label: 'Mine' }));
    const other = await database();
    const repositories = createKairosRepositories(other);
    await repositories.savedAnalyses.put(defineSavedAnalysis({ id: 'a-shared', market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, drawings: [], riskRewards: [], label: 'Theirs' }));
    await repositories.savedAnalyses.put(defineSavedAnalysis({ id: 'a-new', market: { venue: 'binance-spot', instrument: 'BTCUSDT', source: 'market-reference' }, drawings: [], riskRewards: [] }));
    const exported = await exportKairosBackup(other, new Date(now()));
    if (!exported.ok) throw new Error('fixture');
    mount(db);
    choose(exported.file.contents, 'library.json');
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('preview'));
    expect(route().querySelector('[data-profile-import-new]')!.getAttribute('data-profile-import-new')).toBe('1');
    expect(route().querySelector('[data-profile-import-records]')!.textContent).toBe('It also holds 1 saved analysis and 0 saved snapshots this device does not have; 1 saved record already here will be left as they are.');
    fireEvent.click(screen.getByRole('button', { name: 'Add these records' }));
    await waitFor(() => expect(route().getAttribute('data-profile-import')).toBe('done'));
    expect(screen.getByRole('status').textContent).toBe('Added 0 trades from library.json with 0 fills, 0 fees and 0 plans, plus 1 saved analysis and 0 saved snapshots. Imported trades show their source as Import.');
    expect((await createKairosRepositories(db).savedAnalyses.listAll()).map(record => [record.id, record.label ?? null]).sort()).toEqual([['a-new', null], ['a-shared', 'Mine']]);
    expect(await db.trades.count()).toBe(0);
  });
});
