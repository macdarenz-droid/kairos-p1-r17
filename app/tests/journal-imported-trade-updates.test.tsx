import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { JOURNAL_HISTORY_SOURCES, listJournalHistory } from '../src/application/journal';
import { openDraftTrade, saveManualTrade } from '../src/application/trades';
import { updateOpenManualTrade } from '../src/application/trades/updateOpenManualTrade';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { TradeId } from '../src/domain/trades';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-imported-updates-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  await openKairosDatabase(db);
  return db;
}
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const openedAt = '2026-09-20T09:00:00.000Z';
const closedAt = '2026-09-20T10:00:00.000Z';
const plan = { plannedEntryPrice: '100', plannedStopPrice: '90', plannedTargetPrice: '130', plannedQuantity: '2' };

async function importedTrade(db: KairosDatabase, symbol: string, status: 'open' | 'draft'): Promise<TradeId> {
  const saved = await saveManualTrade(db, status === 'open'
    ? { symbol, marketType: 'crypto', side: 'long', status, openedAt, plan, executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: openedAt }] }
    : { symbol, marketType: 'crypto', side: 'long', status, plan });
  if (!saved.ok) throw new Error('fixture');
  const trade = (await db.trades.get(saved.tradeId))!;
  await db.trades.put({ ...trade, source: 'import' });
  return saved.tradeId;
}

async function entryFor(db: KairosDatabase, id: TradeId) {
  const entry = (await listJournalHistory(db)).find(item => item.trade.id === id);
  if (!entry) throw new Error('fixture entry');
  return entry;
}

describe('T-004 imported trades can be updated like manual ones', () => {
  it('adds an exit to an open imported trade and closes it', async () => {
    const db = await database();
    const id = await importedTrade(db, 'BTCUSDT', 'open');
    const expected = await entryFor(db, id);
    const result = await updateOpenManualTrade(db, {
      expected, status: 'closed', closedAt,
      executions: [{ type: 'exit', price: '120', quantity: '2', executedAt: closedAt }], fees: [],
      allowedSources: JOURNAL_HISTORY_SOURCES.real,
    });
    expect(result).toMatchObject({ ok: true, tradeId: id });
    expect(await db.trades.get(id)).toMatchObject({ source: 'import', status: 'closed', closedAt });
    expect(await db.tradeExecutions.where('tradeId').equals(id).count()).toBe(2);
  });

  it('opens an imported draft trade', async () => {
    const db = await database();
    const id = await importedTrade(db, 'ETHUSDT', 'draft');
    const trade = (await db.trades.get(id))!;
    const result = await openDraftTrade(db, {
      expected: { trade, executions: [], fees: [] }, openedAt, grossPnlCurrency: 'USDT',
      executions: [{ type: 'entry', price: '101', quantity: '2', executedAt: openedAt }], fees: [],
      allowedSources: JOURNAL_HISTORY_SOURCES.real,
    });
    expect(result).toMatchObject({ ok: true, tradeId: id });
    expect(await db.trades.get(id)).toMatchObject({ source: 'import', status: 'open', openedAt });
  });

  it('shows "Update trade" and "Open this trade" for imported trades in Journal, and neither in Practice', async () => {
    const db = await database();
    await importedTrade(db, 'BTCUSDT', 'open');
    await importedTrade(db, 'ETHUSDT', 'draft');

    const journal = render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    const card = (symbol: string) => screen.getByText(symbol, { selector: '.kairos-history-card__topline strong' }).closest('li')!;
    await waitFor(() => expect(card('BTCUSDT')).toBeTruthy());
    expect(within(card('BTCUSDT')).getByRole('button', { name: 'Update trade' })).toBeTruthy();
    expect(within(card('ETHUSDT')).getByRole('button', { name: 'Open this trade' })).toBeTruthy();
    journal.unmount();

    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Practice' }).getAttribute('data-practice-status')).toBe('ready'));
    expect(screen.queryByRole('button', { name: 'Update trade' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open this trade' })).toBeNull();
  });
});
