import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfileRoute } from '../src/app/ProfileRoute';
import type { BackupDownloadPorts } from '../src/application/backup';
import { createKairosDatabase, openKairosDatabase, runKairosAtomicWrite, type KairosDatabase } from '../src/data/database';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';
import type { TradeId, TradeRecord } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-t046b-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return db;
}
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const trade: TradeRecord = { id: 'trade-t046b' as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T08:00:00.000Z', closedAt: '2026-09-18T09:30:00.000Z', createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T09:30:00.000Z' };
const damagedEvent = { id: economicEventId('typed', 'bad'), source: 'typed', title: '', currency: 'USD', startsAt: '2026-09-24T12:30:00.000Z', impact: 'high', expected: null, previous: null, actual: null, savedAt: '2026-09-20T08:00:00.000Z' } as EconomicEventRecord;

describe('T-046b Profile export note', () => {
  const downloads: BackupDownloadPorts = { createObjectUrl: () => 'blob:kairos/1', revokeObjectUrl: () => undefined, triggerDownload: () => undefined };

  it('counts a damaged news event left out of the backup', async () => {
    const db = await database();
    await runKairosAtomicWrite(db, ['trades'], async ({ repositories }) => { await repositories.trades.put(trade); });
    await db.economicEvents.put(damagedEvent);
    render(<MemoryRouter><ProfileRoute db={db} now={() => '2026-09-20T10:00:00.000Z'} downloads={downloads} readBackupFile={file => file.text()} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Download backup' }));
    expect(await screen.findByText('Backup saved. 1 saved item was damaged and left out; it is still on this device.')).toBeInTheDocument();
  });
});
