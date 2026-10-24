import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JOURNAL_HISTORY_SOURCES, listJournalHistory } from '../src/application/journal';
import { openDraftTrade, saveManualTrade } from '../src/application/trades';
import { updateOpenManualTrade } from '../src/application/trades/updateOpenManualTrade';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { TradeId } from '../src/domain/trades';
import { tradePageHref } from '../src/features/journal/tradeAddress';
import { renderTradePage, tradePageHeading, tradePagePart } from './fixtures/tradePage';

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

  it('shows "Update trade" and "I\'m in" for imported trades in Journal, and neither in Practice', async () => {
    const db = await database();
    const open = await importedTrade(db, 'BTCUSDT', 'open');
    const draft = await importedTrade(db, 'ETHUSDT', 'draft');

    const journal = renderTradePage(db, open);
    await act(async () => { await journal.router.navigate('/journal'); });
    const card = (symbol: string) => screen.getByText(symbol, { selector: '.kairos-history-card__topline strong' }).closest('li')!;
    await waitFor(() => expect(card('BTCUSDT')).toBeTruthy());
    fireEvent.click(within(card('BTCUSDT')).getByRole('link'));
    await tradePageHeading('BTCUSDT · Long');
    expect(tradePagePart('Change this trade').getByRole('button', { name: 'Update trade' })).toBeTruthy();
    await act(async () => { await journal.router.navigate(-1); });
    await waitFor(() => expect(card('ETHUSDT')).toBeTruthy());
    fireEvent.click(within(card('ETHUSDT')).getByRole('link'));
    await tradePageHeading('ETHUSDT · Long');
    expect(tradePagePart('Change this trade').getByRole('button', { name: "I'm in" })).toBeTruthy();
    journal.unmount();

    const practice = renderTradePage(db, open, { scope: 'practice' });
    await screen.findByRole('heading', { level: 1, name: "This trade isn't in your journal." });
    expect(screen.queryByRole('button', { name: 'Update trade' })).toBeNull();
    await act(async () => { await practice.router.navigate(tradePageHref(draft, 'practice')); });
    await screen.findByRole('heading', { level: 1, name: "This trade isn't in your journal." });
    expect(screen.queryByRole('button', { name: "I'm in" })).toBeNull();
    await act(async () => { await practice.router.navigate('/practice'); });
    await waitFor(() => expect(screen.getByRole('region', { name: 'Practice' }).getAttribute('data-practice-status')).toBe('ready'));
    expect(screen.queryByRole('button', { name: 'Update trade' })).toBeNull();
    expect(screen.queryByRole('button', { name: "I'm in" })).toBeNull();
  });
});
