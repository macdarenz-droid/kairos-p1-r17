import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { TradeId } from '../src/domain/trades';
import { renderTradePage, tradePageHeading, tradePagePart } from './fixtures/tradePage';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-coach-line-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;
const PART = 'Plan and what happened';
/** The sentences of the page's "Plan and what happened", in order. */
const sentences = () => Array.from(screen.getByRole('region', { name: PART }).querySelectorAll('p'), line => line.textContent);
const STOP = 'Your stop was 95, and you closed at 90 on average, beyond it.';
const SIZE = 'You planned a size of 1 and traded 3.';
const plan = { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' };
const closed = (symbol: string, entryQuantity: string, exitPrice: string) => ({
  symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', plan,
  executions: [{ type: 'entry', price: '100', quantity: entryQuantity, executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: exitPrice, quantity: entryQuantity, executedAt: '2026-09-18T10:00:00.000Z' }],
} as const);

describe('T-041a the coach line on a closed trade, now "Plan and what happened" on its page (T-060c)', () => {
  it('says when a closed Journal trade went past its stop or was bigger than planned', async () => {
    const db = await database();
    const ids: TradeId[] = [];
    for (const input of [
      closed('BTCUSDT', '3', '90'),
      closed('ETHUSDT', '1', '110'),
      { symbol: 'SOLUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T11:00:00.000Z', plan: { plannedQuantity: '1' }, executions: [{ type: 'entry', price: '100', quantity: '3', executedAt: '2026-09-18T11:00:00.000Z' }] } as const,
    ]) {
      const saved = await saveManualTrade(db, input);
      expect(saved.ok).toBe(true);
      if (saved.ok) ids.push(saved.tradeId);
    }
    const [btc, eth, sol] = ids;
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    cleanup();

    renderTradePage(db, btc!);
    await tradePageHeading('BTCUSDT · Long');
    expect(tradePagePart(PART).getByRole('heading', { name: PART })).toBeTruthy();
    expect(tradePagePart(PART).getByText(STOP)).toBeTruthy();
    expect(tradePagePart(PART).getByText(SIZE)).toBeTruthy();
    cleanup();

    // A stop kept and the size planned are said too (the page gives a sentence for every verdict), but nothing flags it.
    renderTradePage(db, eth!);
    await tradePageHeading('ETHUSDT · Long');
    expect(sentences()).toEqual(['Your stop was 95, and you closed at 110 on average, without reaching it.', 'You traded the size you planned: 1.']);
    expect(screen.queryByText('Your coach')).toBeNull();
    cleanup();

    // An open trade has no result to compare with its plan yet.
    renderTradePage(db, sol!);
    await tradePageHeading('SOLUSDT · Long');
    expect(screen.queryByRole('region', { name: PART })).toBeNull();
    expect(screen.queryByText('Your coach')).toBeNull();
  });

  it('says it for paper trades but never for replay trades in Practice', async () => {
    const db = await database();
    const paper = await savePracticeTrade(db, closed('BTCUSDT', '3', '90'));
    const replay = await savePracticeTrade(db, { ...closed('ETHUSDT', '3', '90'), source: 'replay' });
    expect(paper.ok).toBe(true);
    expect(replay.ok).toBe(true);
    if (!paper.ok || !replay.ok) return;
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(within(card('ETHUSDT')).getByText('From replay')).toBeTruthy());
    cleanup();

    renderTradePage(db, paper.tradeId, { scope: 'practice' });
    await tradePageHeading('BTCUSDT · Long');
    expect(tradePagePart(PART).getByText(STOP)).toBeTruthy();
    expect(tradePagePart(PART).getByText(SIZE)).toBeTruthy();
    cleanup();

    // A replay trade's entries and exits came from the candles, so its page says nothing about the plan.
    renderTradePage(db, replay.tradeId, { scope: 'practice' });
    await tradePageHeading('ETHUSDT · Long');
    expect(screen.queryByRole('region', { name: PART })).toBeNull();
    expect(screen.queryByText('Your coach')).toBeNull();
  });
});
