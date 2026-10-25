import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalysisRoute } from '../src/app/AnalysisRoute';
import { JournalRoute } from '../src/app/JournalRoute';
import { tradeReviewHref } from '../src/app/ReviewTradeLink';
import { findGlossaryEntry } from '../src/application/learn/glossary';
import { loadTradeReview } from '../src/application/journal/loadTradeReview';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { TradePictureCandleLoaderContext, type TradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';
import { axeViolations } from './fixtures/axe';
import { renderTradePage, tradePageHeading } from './fixtures/tradePage';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const at = '2026-09-20T09:00:00.000Z', end = '2026-09-20T10:00:00.000Z';
/** Stop 90, entry 2 at 102, exit 1 at 110, fee 0.3 USDT: half the trade has an exit. */
const partly = (overrides: Partial<SaveManualTradeInput> = {}): SaveManualTradeInput => ({
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt: at, closedAt: end, grossPnlCurrency: 'USDT',
  plan: { plannedEntryPrice: '102', plannedStopPrice: '90', plannedTargetPrice: null, plannedQuantity: '2' },
  executions: [{ type: 'entry', price: '102', quantity: '2', executedAt: at }, { type: 'exit', price: '110', quantity: '1', executedAt: end }],
  fees: [{ amount: '0.3', currency: 'USDT' }],
  ...overrides,
} as SaveManualTradeInput);
/** A flat trade the day before: every entry has its exit. */
const dayBefore = '2026-09-19T09:00:00.000Z', dayBeforeEnd = '2026-09-19T10:00:00.000Z';
const flat = (): SaveManualTradeInput => partly({
  symbol: 'ETHUSDT', openedAt: dayBefore, closedAt: dayBeforeEnd,
  executions: [{ type: 'entry', price: '102', quantity: '2', executedAt: dayBefore }, { type: 'exit', price: '110', quantity: '2', executedAt: dayBeforeEnd }],
});
const CLOSED_PART_TEXT = 'Kairos has no exit for the other 1: add it to see the full result.';
const WORDS = '1 of 2 closed, before fees. Kairos has no exit for the other 1: add it to see the full result. Kairos closes your oldest entries first. Fees so far: 0.3 USDT.';
const hintName = 'What does "Money at risk" mean?';

async function database(...inputs: SaveManualTradeInput[]): Promise<{ db: KairosDatabase; ids: string[] }> {
  const name = `kairos-card-closed-part-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  const ids: string[] = [];
  for (const input of inputs) {
    const saved = await saveManualTrade(db, input);
    if (!saved.ok) throw new Error(`fixture ${JSON.stringify(saved)}`);
    ids.push(saved.tradeId);
  }
  return { db, ids };
}
const offline: TradePictureCandleLoader = async () => ({ ok: false, why: 'no-candles', retryAfterSeconds: null, note: null });
async function journal(db: KairosDatabase, count: number): Promise<HTMLElement[]> {
  const { container } = render(<TradePictureCandleLoaderContext.Provider value={offline}><MemoryRouter><JournalRoute db={db} /></MemoryRouter></TradePictureCandleLoaderContext.Provider>);
  await waitFor(() => expect(container.querySelectorAll('.kairos-history-card')).toHaveLength(count));
  return [...container.querySelectorAll<HTMLElement>('.kairos-history-card')];
}
const fact = (card: HTMLElement, term: string) => {
  const row = [...card.querySelectorAll('dl > div')].find(div => div.querySelector('dt')?.textContent?.startsWith(term));
  return row?.querySelector('dd')?.textContent ?? null;
};

/** A trade's own page (U15, D261): the closed part and money at risk live in its "Recorded result"; the Journal's row is one link. */
async function recordedResult(db: KairosDatabase, id: string, symbol: string): Promise<HTMLElement> {
  renderTradePage(db, id, { wrap: node => <TradePictureCandleLoaderContext.Provider value={offline}>{node}</TradePictureCandleLoaderContext.Provider> });
  await tradePageHeading(`${symbol} · Long`);
  return screen.getByRole('region', { name: 'Recorded result' });
}

describe('T-050g the closed part and money at risk on the trade page', () => {
  it('shows the closed part of a partly closed trade and its money at risk; a flat trade has no closed-part line', async () => {
    const { db, ids } = await database(partly(), flat());
    const cards = await journal(db, 2);
    const row = cards.find(card => card.querySelector('strong')?.textContent === 'BTCUSDT')!;
    expect(row.querySelector('.kairos-history-card__outcome')).toHaveTextContent('Not available');
    cleanup();

    const region = await recordedResult(db, ids[0]!, 'BTCUSDT');
    const line = region.querySelector<HTMLElement>('.kairos-review__closed-part');
    expect(line).not.toBeNull();
    const result = line!.querySelector('[data-outcome="profit"]');
    expect(result).toHaveTextContent('Closed part');
    expect(result).toHaveTextContent('+8 USDT');
    expect(within(line!).getByText(WORDS)).toBeInTheDocument();
    expect(fact(region, 'Money at risk')).toBe('24 USDT');
    expect(await axeViolations(document.body)).toEqual([]);
    cleanup();

    const flatRegion = await recordedResult(db, ids[1]!, 'ETHUSDT');
    expect(flatRegion.querySelector('.kairos-review__closed-part')).toBeNull();
    expect(fact(flatRegion, 'Money at risk')).toBe('24 USDT');
  });

  it('explains "Money at risk" on the trade page, and on no row of the list', async () => {
    const { db, ids } = await database(partly(), flat());
    const cards = await journal(db, 2);
    for (const card of cards) expect(within(card).queryByRole('button', { name: hintName })).toBeNull();
    cleanup();
    await recordedResult(db, ids[0]!, 'BTCUSDT');
    fireEvent.click(screen.getByRole('button', { name: hintName }));
    const dialog = screen.getByRole('dialog', { name: 'Money at risk' });
    await waitFor(() => expect(within(dialog).getByText(findGlossaryEntry('money-at-risk')!.term.explanation)).toBeInTheDocument());
  });

  it('works out a futures trade like crypto', async () => {
    const { db, ids } = await database(partly({ symbol: 'BTCUSDT-PERP', marketType: 'futures' }));
    const region = await recordedResult(db, ids[0]!, 'BTCUSDT-PERP');
    expect(fact(region, 'Money at risk')).toBe('24 USDT');
  });

  it('shows the same in Analysis → a saved trade', async () => {
    const { db, ids } = await database(partly());
    const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute load={id => loadTradeReview(id, db)} /> }], { initialEntries: [tradeReviewHref(ids[0])] });
    render(<RouterProvider router={router} />);
    const region = await screen.findByRole('region', { name: 'Recorded result' });
    const line = region.querySelector<HTMLElement>('.kairos-review__closed-part');
    expect(line?.querySelector('[data-outcome="profit"]')).toHaveTextContent('+8 USDT');
    expect(within(region).getByText(WORDS)).toBeInTheDocument();
    expect(fact(region, 'Money at risk')).toBe('24 USDT');
    expect(within(region).getByText(new RegExp(CLOSED_PART_TEXT.replace(/[.:]/g, '\\$&')))).toBeInTheDocument();
    expect(await axeViolations(region)).toEqual([]);
  });
});
