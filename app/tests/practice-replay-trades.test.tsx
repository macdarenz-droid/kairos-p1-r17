import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { loadTradeDiscipline } from '../src/application/discipline';
import { savePracticeTrade } from '../src/application/practice';
import { REPLAY_CANDLE_SIZES, type LoadedReplay } from '../src/application/practice/replayCandles';
import { placeReplayOrder } from '../src/application/practice/replayEngine';
import { saveReplayTrade } from '../src/application/practice/replayTrade';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';
import { HOUR, rampPrices, replayCandle } from './fixtures/replayCandles';
import { renderTradePage, tradePageHeading, tradePagePart } from './fixtures/tradePage';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-practice-replay-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;
const pageButton = async (part: string, name: string) => within(await screen.findByRole('region', { name: part })).getByRole('button', { name });

const FIRST = Date.parse('2024-02-27T12:00:00.000Z');
const RAMP = Date.parse('2024-03-01T00:00:00.000Z');
const candles = Array.from({ length: 70 }, (_, i) => replayCandle(FIRST + i * HOUR, ...rampPrices(FIRST + i * HOUR, RAMP)));
const replay: LoadedReplay = { symbol: 'BTCUSDT', quoteAsset: 'USDT', candleSize: REPLAY_CANDLE_SIZES[1], candles, startIndex: 60, source: 'Candles: Binance Spot · BTC/USDT', note: null };

async function seed(db: KairosDatabase): Promise<TradeId> {
  const placed = placeReplayOrder(candles, 60, { side: 'long', entryPrice: '100', stopPrice: '95', targetPrice: '110', quantity: '2' });
  if (!placed.ok) throw new Error(placed.reason);
  const saved = await saveReplayTrade(db, replay, 70, placed.order);
  if (!saved.ok) throw new Error('fixture');
  const paper = await savePracticeTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }] });
  if (!paper.ok) throw new Error('fixture');
  return saved.tradeId;
}

describe('T-038e replay trades on the Practice page', () => {
  it('marks a replay trade, lets it be reviewed but not edited, and keeps it out of the Journal', async () => {
    const db = await database();
    const tradeId = await seed(db);
    const { router } = renderTradePage(db, tradeId, { scope: 'practice' });
    await act(async () => { await router.navigate('/practice'); });
    await waitFor(() => expect(card('BTCUSDT')).toBeTruthy());
    expect(within(card('BTCUSDT')).getByText('From replay')).toBeTruthy();
    expect(within(card('ETHUSDT')).queryByText('From replay')).toBeNull();

    fireEvent.click(within(card('ETHUSDT')).getByRole('link'));
    await tradePageHeading('ETHUSDT · Long');
    expect(tradePagePart('Change this trade').getByRole('button', { name: 'Your entries and exits' })).toBeTruthy();
    await act(async () => { await router.navigate(-1); });
    await waitFor(() => expect(card('BTCUSDT')).toBeTruthy());
    fireEvent.click(within(card('BTCUSDT')).getByRole('link'));
    await tradePageHeading('BTCUSDT · Long');
    const review = await pageButton('Before and after the trade', 'After the trade: not reviewed yet');
    expect(tradePagePart('Change this trade').queryByRole('button', { name: 'Your entries and exits' })).toBeNull();

    fireEvent.click(review);
    const dialog = screen.getByRole('dialog', { name: 'After the trade: BTCUSDT' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: KAIROS_DEFAULT_DISCIPLINE_LISTS.review[0].label }));
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save review' })); });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await pageButton('Before and after the trade', 'After the trade: reviewed, no mistakes')).toBeTruthy();
    const loaded = await loadTradeDiscipline(db, [tradeId]);
    expect(loaded.ok && loaded.records.get(tradeId)?.reviewedAt).toBeTruthy();

    cleanup();
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'No saved trades yet' })).toBeTruthy();
    expect(screen.getByText('Your first saved trade will appear here.')).toBeTruthy();
  });
});
