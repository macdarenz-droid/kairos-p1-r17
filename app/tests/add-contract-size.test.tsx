import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalysisRoute } from '../src/app/AnalysisRoute';
import { JournalRoute } from '../src/app/JournalRoute';
import { tradeReviewHref } from '../src/app/ReviewTradeLink';
import { getJournalHistoryEntry } from '../src/application/journal';
import { loadTradeReview } from '../src/application/journal/loadTradeReview';
import { projectTradePicture } from '../src/application/trade-visualizer/tradePicture';
import { addTradeContractSize, canAddTradeContractSize, saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString, TradeId, TradeRecord } from '../src/domain/trades';
import { TradePictureCandleLoaderContext, type TradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const at = '2026-09-21T14:00:00.000Z', end = '2026-09-21T15:00:00.000Z';
const WORDS = 'Add how much one point is worth to see this result.';
/** An e-mini trade saved before its point value was known: long one contract from 5000 to 5010, in USD. */
const es = (overrides: Partial<SaveManualTradeInput> = {}): SaveManualTradeInput => ({
  symbol: 'ESZ6', marketType: 'futures', side: 'long', status: 'closed', openedAt: at, closedAt: end, grossPnlCurrency: 'USD',
  plan: { plannedEntryPrice: '5000', plannedStopPrice: '4990', plannedTargetPrice: null, plannedQuantity: '1' },
  executions: [{ type: 'entry', price: '5000', quantity: '1', executedAt: at }, { type: 'exit', price: '5010', quantity: '1', executedAt: end }],
  ...overrides,
} as SaveManualTradeInput);

async function database(...inputs: SaveManualTradeInput[]): Promise<{ db: KairosDatabase; ids: TradeId[] }> {
  const name = `kairos-add-point-value-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  const ids: TradeId[] = [];
  for (const input of inputs) {
    const saved = await saveManualTrade(db, input);
    if (!saved.ok) throw new Error(`fixture ${JSON.stringify(saved)}`);
    ids.push(saved.tradeId as TradeId);
  }
  return { db, ids };
}
async function snapshot(db: KairosDatabase, id: TradeId) {
  const entry = await getJournalHistoryEntry(db, id);
  if (!entry) throw new Error('missing');
  return { trade: entry.trade, executions: entry.executions, fees: entry.fees };
}
const offline: TradePictureCandleLoader = async () => ({ ok: false, why: 'no-candles', retryAfterSeconds: null, note: null });
const fact = (root: HTMLElement, term: string) => [...root.querySelectorAll('dl > div')].find(div => div.querySelector('dt')?.textContent?.startsWith(term)) as HTMLElement | undefined;

describe('T-056d adding how much one point is worth to a saved trade', () => {
  it('is offered only for a futures or options trade with none and no stablecoin price', () => {
    const trade = (overrides: Partial<TradeRecord>) => ({ marketType: 'futures', grossPnlCurrency: 'USD', ...overrides }) as TradeRecord;
    expect(canAddTradeContractSize(trade({}))).toBe(true);
    expect(canAddTradeContractSize(trade({ marketType: 'options' }))).toBe(true);
    expect(canAddTradeContractSize(trade({ grossPnlCurrency: 'USDT' }))).toBe(false);
    expect(canAddTradeContractSize(trade({ contractSize: '50' as DecimalString }))).toBe(false);
    expect(canAddTradeContractSize(trade({ marketType: 'crypto' }))).toBe(false);
  });

  it('adds it once in one write, never changes it, and refuses a stale edit or a value that is not a positive number', async () => {
    const { db, ids } = await database(es(), es({ symbol: 'BTCUSDT', marketType: 'crypto', grossPnlCurrency: 'USDT' }));
    const before = await snapshot(db, ids[0]!);
    expect(await addTradeContractSize(db, { expected: before, contractSize: '0' })).toMatchObject({ ok: false, type: 'validation-error', field: 'contractSize' });
    expect(await addTradeContractSize(db, { expected: before, contractSize: 'abc' })).toMatchObject({ ok: false, type: 'validation-error' });
    expect(await addTradeContractSize(db, { expected: await snapshot(db, ids[1]!), contractSize: '5' })).toEqual({ ok: false, type: 'update-conflict', reason: 'not-futures-or-options' });

    expect(await addTradeContractSize(db, { expected: before, contractSize: '50' }, () => '2026-09-22T08:00:00.000Z')).toEqual({ ok: true, tradeId: ids[0], contractSize: '50' });
    const after = await snapshot(db, ids[0]!);
    // Only the point value and the edit time changed; the fills and fees are untouched.
    expect(after.trade).toEqual({ ...before.trade, contractSize: '50', updatedAt: '2026-09-22T08:00:00.000Z' });
    expect(after.executions).toEqual(before.executions);
    expect((await getJournalHistoryEntry(db, ids[0]!))?.metrics).toMatchObject({ grossPnl: '500', netPnl: '500' });

    // A second time, from the same screen or a fresh one, is refused and the first value stays.
    expect(await addTradeContractSize(db, { expected: before, contractSize: '20' })).toEqual({ ok: false, type: 'update-conflict', reason: 'contract-size-recorded' });
    expect(await addTradeContractSize(db, { expected: after, contractSize: '20' })).toEqual({ ok: false, type: 'update-conflict', reason: 'contract-size-recorded' });
    expect((await db.trades.get(ids[0]!))?.contractSize).toBe('50');
  });

  it('refuses an edit started before another tab changed the trade', async () => {
    const { db, ids } = await database(es());
    const before = await snapshot(db, ids[0]!);
    await db.trades.update(ids[0]!, { updatedAt: '2026-09-21T16:00:00.000Z' });
    expect(await addTradeContractSize(db, { expected: before, contractSize: '50' })).toEqual({ ok: false, type: 'update-conflict', reason: 'trade-changed' });
    expect((await db.trades.get(ids[0]!))?.contractSize).toBeUndefined();
  });
});

describe('T-056d on the Journal card', () => {
  async function journal(db: KairosDatabase) {
    const view = render(<TradePictureCandleLoaderContext.Provider value={offline}><MemoryRouter><JournalRoute db={db} /></MemoryRouter></TradePictureCandleLoaderContext.Provider>);
    await waitFor(() => expect(view.container.querySelector('.kairos-history-card')).not.toBeNull());
    return view;
  }

  it('offers it only where needed, says why a value is refused, and once saved shows the result with focus on it', async () => {
    const { db } = await database(es(), es({ symbol: 'BTCUSDT-PERP', grossPnlCurrency: 'USDT' }), es({ symbol: 'NQZ6', contractSize: '20' }));
    const { container } = await journal(db);
    await waitFor(() => expect(container.querySelectorAll('.kairos-history-card')).toHaveLength(3));
    const bySymbol = (symbol: string) => [...container.querySelectorAll<HTMLElement>('.kairos-history-card')].find(item => item.querySelector('strong')?.textContent === symbol)!;
    // A crypto perpetual priced in USDT is 1 a point, and NQZ6 has its own: neither is offered it.
    expect(screen.getAllByRole('button', { name: 'Add how much one point is worth' })).toHaveLength(1);
    const card = bySymbol('ESZ6');
    expect(within(card).getByText(WORDS)).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Add how much one point is worth' }));
    const field = within(card).getByLabelText('Each point is worth');
    expect(field).toHaveFocus();
    expect(await axeViolations(card)).toEqual([]);

    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(field).toHaveAccessibleDescription(expect.stringContaining('Enter how much one point is worth, such as 50.')));
    expect(field).toHaveFocus();

    fireEvent.change(field, { target: { value: '50' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bySymbol('ESZ6').querySelector('.kairos-history-card__outcome')).toHaveTextContent('+500 USD'));
    const saved = bySymbol('ESZ6');
    await waitFor(() => expect(fact(saved, 'Result after fees')).toHaveFocus());
    expect(within(saved).queryByText(WORDS)).toBeNull();
    expect(within(saved).queryByRole('button', { name: 'Add how much one point is worth' })).toBeNull();
  });

  it('Cancel closes it and returns focus to its button', async () => {
    const { db } = await database(es());
    const { container } = await journal(db);
    const card = container.querySelector<HTMLElement>('.kairos-history-card')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Add how much one point is worth' }));
    fireEvent.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(within(card).getByRole('button', { name: 'Add how much one point is worth' })).toHaveFocus();
    expect(within(card).queryByLabelText('Each point is worth')).toBeNull();
  });

  it('shows at most 3 tags as chips, then how many more', async () => {
    const { db } = await database(es({ tags: ['breakout', 'London open', 'news', 'A+', 'revenge'] }), es({ symbol: 'NQZ6', tags: ['scalp'] }));
    const { container } = await journal(db);
    await waitFor(() => expect(container.querySelectorAll('.kairos-history-card')).toHaveLength(2));
    const chips = screen.getAllByRole('list', { name: 'Tags' }).map(list => within(list).getAllByRole('listitem').map(item => item.textContent));
    expect(chips).toContainEqual(['breakout', 'London open', 'news', '+2 more tags']);
    expect(chips).toContainEqual(['scalp']);
  });
});

describe('T-056d on the trade review and the picture', () => {
  const full = () => es({ contractSize: '50', exchange: 'CME', leverage: '10', tags: ['breakout', 'London open'], plan: { plannedEntryPrice: '5000', plannedStopPrice: '4990', plannedTargetPrice: null, plannedQuantity: '1', reason: 'Retest of the high after the open.' } });

  it("the review shows each point's worth, where you traded, leverage, tags and why", async () => {
    const { db, ids } = await database(full());
    const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute db={db} load={id => loadTradeReview(id, db)} /> }], { initialEntries: [tradeReviewHref(ids[0]!)] });
    render(<RouterProvider router={router} />);
    const overview = await screen.findByRole('region', { name: 'Trade overview' });
    expect(fact(overview, 'Each point is worth')?.querySelector('dd')).toHaveTextContent('50 USD');
    expect(fact(overview, 'Where you traded')?.querySelector('dd')).toHaveTextContent('CME');
    expect(fact(overview, 'Leverage')?.querySelector('dd')).toHaveTextContent('10×');
    expect(fact(overview, 'Tags')?.querySelector('dd')).toHaveTextContent('breakout, London open');
    expect(within(screen.getByRole('region', { name: 'Saved plan' })).getByText('Retest of the high after the open.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add how much one point is worth' })).toBeNull();
  });

  it('the review offers it, and once saved shows the result with focus on it', async () => {
    const { db, ids } = await database(es());
    const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute db={db} load={id => loadTradeReview(id, db)} /> }], { initialEntries: [tradeReviewHref(ids[0]!)] });
    render(<RouterProvider router={router} />);
    const region = await screen.findByRole('region', { name: 'Recorded result' });
    expect(within(region).getByText(WORDS)).toBeInTheDocument();
    fireEvent.click(within(region).getByRole('button', { name: 'Add how much one point is worth' }));
    fireEvent.change(within(region).getByLabelText('Each point is worth'), { target: { value: '50' } });
    fireEvent.click(within(region).getByRole('button', { name: 'Save' }));
    const after = await waitFor(() => {
      const shown = screen.getByRole('region', { name: 'Recorded result' });
      expect(shown.querySelector('.kairos-review__result')).toHaveTextContent('500 USD');
      return shown;
    });
    await waitFor(() => expect(after.querySelector('.kairos-review__result')).toHaveFocus());
    expect(within(after).queryByText(WORDS)).toBeNull();
    expect(await axeViolations(after)).toEqual([]);
  });

  it('the picture lists where you traded, the leverage and why, only when saved', async () => {
    const { db, ids } = await database(full(), es({ symbol: 'NQZ6' }));
    const rows = async (id: TradeId) => projectTradePicture({ ...(await getJournalHistoryEntry(db, id))!, candles: null, now: '2026-09-22T00:00:00.000Z' }).info;
    const filled = await rows(ids[0]!);
    expect(filled.find(row => row.key === 'exchange')).toMatchObject({ label: 'Where you traded', text: 'CME' });
    expect(filled.find(row => row.key === 'leverage')).toMatchObject({ label: 'Leverage', text: '10×' });
    expect(filled.find(row => row.key === 'reason')).toMatchObject({ label: "Why I'm taking it", text: 'Retest of the high after the open.' });
    expect(filled.find(row => row.key === 'point-value')).toMatchObject({ text: '50 USD' });
    const empty = (await rows(ids[1]!)).map(row => row.key);
    for (const key of ['exchange', 'leverage', 'reason']) expect(empty).not.toContain(key);
  });
});
