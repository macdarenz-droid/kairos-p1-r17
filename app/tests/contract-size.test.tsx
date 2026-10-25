import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AnalysisRoute } from '../src/app/AnalysisRoute';
import { JournalRoute } from '../src/app/JournalRoute';
import { tradeReviewHref } from '../src/app/ReviewTradeLink';
import { checkSavedTradeStrategy, previewTradeStrategyCheck } from '../src/application/discipline/strategyCheck';
import { describeStrategyRuleResult } from '../src/application/discipline/strategyWords';
import { getJournalHistoryEntry } from '../src/application/journal';
import { loadTradeReview } from '../src/application/journal/loadTradeReview';
import { summarizeTradeOutcomes } from '../src/application/performance/performanceSummary';
import { projectTradeClosedPart } from '../src/application/performance/tradeClosedPart';
import { projectTradeMoneyAtRisk, projectTradeTimesRisked } from '../src/application/performance/tradeRisk';
import { projectTradePicture } from '../src/application/trade-visualizer/tradePicture';
import { createEmptyManualTradeDraft } from '../src/application/trades/manualTradeDraft';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { calculateTradeMetrics, resolveContractSize } from '../src/domain/calculations';
import type { StrategyId, StrategyRuleId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { DecimalString, TradeId } from '../src/domain/trades';
import { describeTradePicture } from '../src/features/journal/TradePictureCard';
import { TradePictureCandleLoaderContext, type TradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';
import { renderTradePage, tradePageHeading } from './fixtures/tradePage';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

const at = '2026-09-21T14:00:00.000Z', end = '2026-09-21T15:00:00.000Z';
const WORDS = 'Add how much one point is worth to see this result.';
/** One e-mini-style contract, long from 5000 to 5010, stop 4990, priced in USD. */
const es = (overrides: Partial<SaveManualTradeInput> = {}): SaveManualTradeInput => ({
  symbol: 'ESZ6', marketType: 'futures', side: 'long', status: 'closed', openedAt: at, closedAt: end, grossPnlCurrency: 'USD',
  plan: { plannedEntryPrice: '5000', plannedStopPrice: '4990', plannedTargetPrice: '5020', plannedQuantity: '1' },
  executions: [{ type: 'entry', price: '5000', quantity: '1', executedAt: at }, { type: 'exit', price: '5010', quantity: '1', executedAt: end }],
  fees: [],
  ...overrides,
} as SaveManualTradeInput);

/** Saves each trade and, where given, adds its contract size the way a backup or T-056c's form would hold it. */
async function database(...trades: Array<[SaveManualTradeInput, string | null]>): Promise<{ db: KairosDatabase; ids: TradeId[] }> {
  const name = `kairos-contract-size-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  const ids: TradeId[] = [];
  for (const [input, contractSize] of trades) {
    const saved = await saveManualTrade(db, input);
    if (!saved.ok) throw new Error(`fixture ${JSON.stringify(saved)}`);
    if (contractSize !== null) await db.trades.update(saved.tradeId as TradeId, { contractSize: contractSize as DecimalString });
    ids.push(saved.tradeId as TradeId);
  }
  return { db, ids };
}
async function entryOf(input: SaveManualTradeInput, contractSize: string | null) {
  const { db, ids } = await database([input, contractSize]);
  const entry = await getJournalHistoryEntry(db, ids[0]!);
  if (!entry) throw new Error('missing entry');
  return entry;
}
const picture = (entry: Awaited<ReturnType<typeof entryOf>>) => projectTradePicture({ ...entry, candles: null, now: '2026-09-22T00:00:00.000Z' });
const info = (entry: Awaited<ReturnType<typeof entryOf>>, key: string) => picture(entry).info.find(row => row.key === key) ?? null;

describe('T-056b how much one point is worth: one owner', () => {
  it('is 1 where size is already in units, the saved value for futures and options, 1 for a stablecoin perpetual, else missing', () => {
    for (const marketType of ['stock', 'forex', 'crypto', 'other'] as const) {
      expect(resolveContractSize({ marketType, grossPnlCurrency: 'USD' })).toEqual({ ok: true, value: '1', basis: 'not-needed' });
    }
    expect(resolveContractSize({ marketType: 'futures', grossPnlCurrency: 'USD', contractSize: '50' as DecimalString })).toEqual({ ok: true, value: '50', basis: 'saved' });
    expect(resolveContractSize({ marketType: 'options', grossPnlCurrency: 'USDT', contractSize: '100' as DecimalString })).toEqual({ ok: true, value: '100', basis: 'saved' });
    for (const coin of ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'DAI']) {
      expect(resolveContractSize({ marketType: 'futures', grossPnlCurrency: coin, contractSize: null })).toEqual({ ok: true, value: '1', basis: 'stablecoin' });
    }
    expect(resolveContractSize({ marketType: 'futures', grossPnlCurrency: 'USD', contractSize: null })).toEqual({ ok: false, reason: 'needs-contract-size' });
    expect(resolveContractSize({ marketType: 'options', grossPnlCurrency: null })).toEqual({ ok: false, reason: 'needs-contract-size' });
  });
});

describe('T-056b results with the contract size', () => {
  it('one contract from 5000 to 5010 at 50 USD a point makes 500 USD, the same in the Journal and on the picture', async () => {
    const entry = await entryOf(es(), '50');
    expect(entry.metrics).toMatchObject({ grossPnl: '500', netPnl: '500', netPnlCurrency: 'USD', averageEntryPrice: '5000', needsContractSize: false });
    expect(entry.visualPnl).toMatchObject({ outcome: 'profit', amount: '500' });
    expect(info(entry, 'result')).toMatchObject({ value: '500', text: '500 USD' });
    expect(info(entry, 'result-before-fees')).toMatchObject({ value: '500' });
    expect(info(entry, 'point-value')).toMatchObject({ value: '50', text: '50 USD' });
  });

  it('a short with fees takes the fees off the bigger result', async () => {
    const short = es({
      side: 'short', plan: { plannedEntryPrice: '5010', plannedStopPrice: '5020', plannedTargetPrice: '4990', plannedQuantity: '2' },
      executions: [{ type: 'entry', price: '5010', quantity: '2', executedAt: at }, { type: 'exit', price: '5000', quantity: '2', executedAt: end }],
      fees: [{ amount: '4.5', currency: 'USD' }],
    });
    const entry = await entryOf(short, '50');
    expect(entry.metrics).toMatchObject({ grossPnl: '1000', totalFees: '4.5', netPnl: '995.5' });
  });

  it('the closed part of a partly closed trade is times the contract size too, and needs it like the result', async () => {
    const partly = es({ executions: [{ type: 'entry', price: '5000', quantity: '2', executedAt: at }, { type: 'exit', price: '5010', quantity: '1', executedAt: end }] });
    const withSize = await entryOf(partly, '50');
    expect(projectTradeClosedPart(withSize)).toMatchObject({ available: true, outcome: 'profit', resultBeforeFees: '500', currency: 'USD' });
    const without = await entryOf(partly, null);
    expect(projectTradeClosedPart(without)).toEqual({ available: false, reason: 'needs-contract-size' });
    expect(without.metrics?.needsContractSize).toBe(false);
  });

  it('a futures trade priced in USDT with no contract size keeps its result (a crypto perpetual)', async () => {
    const perp = es({
      symbol: 'BTCUSDT-PERP', grossPnlCurrency: 'USDT', plan: { plannedEntryPrice: '60000', plannedStopPrice: '59800', plannedTargetPrice: null, plannedQuantity: '0.5' },
      executions: [{ type: 'entry', price: '60000', quantity: '0.5', executedAt: at }, { type: 'exit', price: '60100', quantity: '0.5', executedAt: end }],
    });
    const entry = await entryOf(perp, null);
    expect(entry.metrics).toMatchObject({ grossPnl: '50', netPnl: '50', needsContractSize: false });
    expect(info(entry, 'point-value')).toMatchObject({ value: '1', text: '1 USDT (crypto perpetual)' });
    expect(projectTradeMoneyAtRisk(entry)).toMatchObject({ available: true, amount: '100' });
  });

  it('a USD futures trade with none has no result, never price × size, and says what to add', async () => {
    const entry = await entryOf(es(), null);
    expect(entry.metrics).toMatchObject({ grossPnl: null, netPnl: null, averageEntryPrice: '5000', averageExitPrice: '5010', state: 'realized', needsContractSize: true });
    expect(entry.metricsError).toBeNull();
    expect(entry.visualPnl.outcome).toBe('unavailable');
    expect(info(entry, 'result')).toEqual({ key: 'result', label: 'Result after fees', value: null, unit: null, text: WORDS });
    expect(info(entry, 'result-before-fees')).toMatchObject({ value: null, text: WORDS });
    expect(info(entry, 'point-value')).toMatchObject({ value: null, text: 'Not saved yet' });
    expect(info(entry, 'average-entry')).toMatchObject({ value: '5000' });
    expect(picture(entry).missing).toContainEqual({ part: 'result', message: WORDS });
    expect(projectTradeMoneyAtRisk(entry)).toEqual({ available: false, basis: 'as-traded', reason: 'needs-contract-size' });
    expect(info(entry, 'money-at-risk')).toMatchObject({ value: null, text: 'Not available: add how much one point is worth' });
  });

  it('options at 100 a point: 2.5 to 3.1 on one contract makes 60', async () => {
    const option = es({
      symbol: 'SPY 500C', marketType: 'options', plan: { plannedEntryPrice: '2.5', plannedStopPrice: '2', plannedTargetPrice: null, plannedQuantity: '1' },
      executions: [{ type: 'entry', price: '2.5', quantity: '1', executedAt: at }, { type: 'exit', price: '3.1', quantity: '1', executedAt: end }],
    });
    const entry = await entryOf(option, '100');
    expect(entry.metrics).toMatchObject({ grossPnl: '60', netPnl: '60' });
    expect(projectTradeMoneyAtRisk(entry)).toMatchObject({ available: true, amount: '50' });
  });

  it('money at risk and × what you risked are both times the contract size, as traded and as planned', async () => {
    const entry = await entryOf(es(), '50');
    expect(projectTradeMoneyAtRisk(entry)).toMatchObject({ available: true, basis: 'as-traded', amount: '500', currency: 'USD' });
    expect(projectTradeTimesRisked(entry)).toMatchObject({ available: true, value: '1', result: '500', moneyAtRisk: '500' });
    expect(info(entry, 'actual-r')).toMatchObject({ text: '+1× what you risked' });
    const planned = await entryOf(es({ status: 'draft', openedAt: null, closedAt: null, executions: [] }), '50');
    expect(projectTradeMoneyAtRisk(planned)).toMatchObject({ available: true, basis: 'as-planned', amount: '500' });
    const none = await entryOf(es(), null);
    expect(projectTradeTimesRisked(none)).toEqual({ available: false, reason: 'needs-contract-size' });
    expect(picture(none).missing).toContainEqual({ part: 'actual-r', message: 'No × what you risked: add how much one point is worth.' });
  });

  it('the strategy "most risk" rule reads the same contract size, saved and in the form', async () => {
    const rule = { id: 'rule-most' as StrategyRuleId, kind: 'max-risk' as const, amount: '400' as DecimalString, currency: 'USD' };
    const record = (tradeId: TradeId) => ({
      id: `discipline-${tradeId}`, tradeId, preTradeChecklist: [], postTradeReview: [], mistakes: [], note: '', checklistCompletedAt: null, reviewedAt: null, createdAt: at, updatedAt: at,
      strategy: { strategyId: 's' as StrategyId, revision: 1, name: 'ES plan', rules: [rule], answers: [] },
    }) as unknown as TradeDisciplineRecord;
    const withSize = await entryOf(es(), '50');
    const kept = checkSavedTradeStrategy(withSize.trade, withSize.plans, record(withSize.trade.id))!.results[0]!;
    expect(kept).toMatchObject({ verdict: 'broken', reason: 'over', risk: '500' });
    const without = await entryOf(es(), null);
    const unknown = checkSavedTradeStrategy(without.trade, without.plans, record(without.trade.id))!.results[0]!;
    expect(unknown).toMatchObject({ verdict: 'unknown', reason: 'needs-contract-size', risk: null });
    expect(describeStrategyRuleResult(unknown)).toBe('Risk: add how much one point is worth so Kairos can check it.');

    const strategy = { id: 's' as StrategyId, name: 'ES plan', rules: [rule] } as unknown as Parameters<typeof previewTradeStrategyCheck>[2];
    const draft = { ...createEmptyManualTradeDraft(), symbol: 'ESZ6', side: 'long' as const, priceCurrency: 'USD', plan: { plannedEntryPrice: '5000', plannedStopPrice: '4990', plannedTargetPrice: '', plannedQuantity: '1' } };
    expect(previewTradeStrategyCheck({ ...draft, marketType: 'futures' }, 'closed', strategy).results[0]).toMatchObject({ verdict: 'unknown', reason: 'needs-contract-size' });
    expect(previewTradeStrategyCheck({ ...draft, marketType: 'futures', priceCurrency: 'USDT' }, 'closed', strategy).results[0]).toMatchObject({ verdict: 'unknown', reason: 'other-currency', risk: '10' });
    expect(previewTradeStrategyCheck({ ...draft, marketType: 'stock' }, 'closed', strategy).results[0]).toMatchObject({ verdict: 'kept', reason: 'within', risk: '10' });
  });

  it('the period numbers count a trade with no contract size as "no result", never 0', async () => {
    const { db, ids } = await database([es(), '50'], [es({ symbol: 'NQZ6' }), null]);
    const entries = await Promise.all(ids.map(id => getJournalHistoryEntry(db, id)));
    expect(summarizeTradeOutcomes(entries.map(entry => entry!))).toMatchObject({ tradeCount: 2, won: 1, noResult: 1, resultCount: 1 });
  });
});

describe('T-056b the words where the result would be', () => {
  const offline: TradePictureCandleLoader = async () => ({ ok: false, why: 'no-candles', retryAfterSeconds: null, note: null });

  it('the trade page says what to add, for the result and for a closed part; the Journal row keeps a result it has', async () => {
    const partly = es({ symbol: 'NQZ6', executions: [{ type: 'entry', price: '5000', quantity: '2', executedAt: at }, { type: 'exit', price: '5010', quantity: '1', executedAt: end }] });
    const { db, ids } = await database([es(), null], [partly, null], [es({ symbol: 'YMZ6' }), '5']);
    const wrap = (node: ReactNode) => <TradePictureCandleLoaderContext.Provider value={offline}>{node}</TradePictureCandleLoaderContext.Provider>;
    const recordedResult = async (id: TradeId, symbol: string) => {
      renderTradePage(db, id, { wrap });
      await tradePageHeading(`${symbol} · Long`);
      return screen.getByRole('region', { name: 'Recorded result' });
    };
    const esz = await recordedResult(ids[0]!, 'ESZ6');
    expect(within(esz).getByText(WORDS)).toBeInTheDocument();
    cleanup();
    const nqz = await recordedResult(ids[1]!, 'NQZ6');
    expect(within(nqz).queryByText(WORDS)).toBeNull();
    expect(nqz.querySelector('.kairos-review__closed-part')).toHaveTextContent('Closed part: add how much one point is worth to see its result.');
    cleanup();
    const ymz = await recordedResult(ids[2]!, 'YMZ6');
    expect(within(ymz).queryByText(WORDS)).toBeNull();
    cleanup();

    const { container } = render(<TradePictureCandleLoaderContext.Provider value={offline}><MemoryRouter><JournalRoute db={db} /></MemoryRouter></TradePictureCandleLoaderContext.Provider>);
    await waitFor(() => expect(container.querySelectorAll('.kairos-history-card')).toHaveLength(3));
    const card = (symbol: string) => [...container.querySelectorAll<HTMLElement>('.kairos-history-card')].find(item => item.querySelector('strong')?.textContent === symbol)!;
    expect(card('YMZ6').querySelector('.kairos-history-card__outcome')).toHaveTextContent('+50 USD');
  });

  it('the trade review "Recorded result" says it too', async () => {
    const { db, ids } = await database([es(), null]);
    const router = createMemoryRouter([{ path: '/analysis', element: <AnalysisRoute load={id => loadTradeReview(id, db)} /> }], { initialEntries: [tradeReviewHref(ids[0]!)] });
    render(<RouterProvider router={router} />);
    const region = await screen.findByRole('region', { name: 'Recorded result' });
    expect(within(region).getByText(WORDS)).toBeInTheDocument();
    expect(within(region).queryByText('Some results are not available for this trade.')).toBeNull();
  });
});

describe('T-056b review r1', () => {
  it('the picture says what to add as its own sentence for screen readers', async () => {
    const entry = await entryOf(es(), null);
    expect(describeTradePicture(picture(entry))).toBe('ESZ6 long trade, closed. Add how much one point is worth to see this result.');
    const priced = await entryOf(es(), '50');
    expect(describeTradePicture(picture(priced))).toBe('ESZ6 long trade, closed. Result after fees 500 USD. +1× what you risked.');
  });

  it('the "most risk" rule asks for the price currency first: a stablecoin currency is enough for a perpetual', () => {
    const rule = { id: 'rule-most' as StrategyRuleId, kind: 'max-risk' as const, amount: '400' as DecimalString, currency: 'USD' };
    const strategy = { id: 's' as StrategyId, name: 'ES plan', rules: [rule] } as unknown as Parameters<typeof previewTradeStrategyCheck>[2];
    const draft = { ...createEmptyManualTradeDraft(), symbol: 'ESZ6', marketType: 'futures' as const, side: 'long' as const, priceCurrency: '', plan: { plannedEntryPrice: '5000', plannedStopPrice: '4990', plannedTargetPrice: '', plannedQuantity: '1' } };
    expect(previewTradeStrategyCheck(draft, 'draft', strategy).results[0]).toMatchObject({ verdict: 'unknown', reason: 'no-currency' });
    expect(previewTradeStrategyCheck({ ...draft, priceCurrency: 'USD' }, 'draft', strategy).results[0]).toMatchObject({ verdict: 'unknown', reason: 'needs-contract-size' });
  });

  it('a point value that is not a number is named as the failure', () => {
    const fills = [
      { id: 'e', tradeId: 't', type: 'entry', price: '5000', quantity: '1', executedAt: at, createdAt: at },
      { id: 'x', tradeId: 't', type: 'exit', price: '5010', quantity: '1', executedAt: end, createdAt: end },
    ] as unknown as Parameters<typeof calculateTradeMetrics>[1];
    expect(calculateTradeMetrics('long', fills, undefined, [], undefined, undefined, undefined, { ok: true, value: 'abc' as DecimalString, basis: 'saved' }))
      .toEqual({ ok: false, reason: 'invalid-contract-size' });
  });
});
