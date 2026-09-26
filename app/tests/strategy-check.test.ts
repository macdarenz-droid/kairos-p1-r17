import { describe, expect, it } from 'vitest';
import { checkSavedTradeStrategy, checkTradeStrategy, previewTradeStrategyCheck, projectStrategyRuleBars, type TradeStrategyCheckInput } from '../src/application/discipline/strategyCheck';
import { latestTradePlan } from '../src/application/trade-visualizer/tradeVisualizerFacts';
import { createEmptyManualTradeDraft } from '../src/application/trades/manualTradeDraft';
import type { Strategy, StrategyRule, TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { DecimalString, TradeId, TradePlanId, TradePlanRecord, TradeRecord } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
const R: StrategyRule[] = [
  { id: 'r1', kind: 'max-risk', amount: d('50'), currency: 'USDT' },
  { id: 'r2', kind: 'min-reward-to-risk', ratio: d('2') },
  { id: 'r3', kind: 'stop-planned' },
  { id: 'r4', kind: 'checklist-complete' },
  { id: 'r5', kind: 'markets', symbols: ['BTCUSDT', 'ETHUSDT'] },
  { id: 'r6', kind: 'written', label: 'I wait for a close above the line' },
];
const base: TradeStrategyCheckInput = {
  rules: R, answers: [], symbol: 'btc/usdt', side: 'long', status: 'open', priceCurrency: 'USDT',
  plan: { entry: d('100'), stop: d('95'), target: d('110'), quantity: d('10') }, checklist: null,
};
const withPlan = (plan: Partial<TradeStrategyCheckInput['plan']>, rest: Partial<TradeStrategyCheckInput> = {}) => ({ ...base, ...rest, plan: { ...base.plan, ...plan } });
const result = (input: TradeStrategyCheckInput, id: string) => checkTradeStrategy(input).results.find(item => item.ruleId === id)!;
const deepFrozen = (value: unknown): boolean => typeof value !== 'object' || value === null || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));

describe('T-040e the rule check', () => {
  it('judges the base trade', () => {
    const check = checkTradeStrategy(base);
    expect(check.results.map(item => [item.ruleId, item.verdict, item.reason])).toEqual([
      ['r1', 'kept', 'within'], ['r2', 'kept', 'at-least'], ['r3', 'kept', 'planned'], ['r4', 'unknown', 'not-yet'], ['r5', 'kept', 'listed'], ['r6', 'unknown', 'not-answered'],
    ]);
    expect(check.results[0]).toMatchObject({ risk: '50', bars: { firstSteps: 10, secondSteps: 10 } });
    expect(check.results[1]).toMatchObject({ ratio: '2', shownRatio: '2' });
    expect(check.results[2]).toMatchObject({ stop: '95' });
    expect(check.results[4]).toMatchObject({ symbol: 'BTCUSDT' });
    expect(check).toMatchObject({ kept: 4, broken: 0, unknown: 2, total: 6 });
    expect(deepFrozen(check)).toBe(true);
  });

  it('checks the most you risk, only in the same currency', () => {
    expect(result(withPlan({ quantity: d('11') }), 'r1')).toMatchObject({ verdict: 'broken', reason: 'over', risk: '55', bars: { firstSteps: 10, secondSteps: 9 } });
    expect(result({ ...base, priceCurrency: null }, 'r1')).toMatchObject({ verdict: 'unknown', reason: 'no-currency', risk: '50', bars: null });
    expect(result({ ...base, priceCurrency: 'EUR' }, 'r1')).toMatchObject({ verdict: 'unknown', reason: 'other-currency', tradeCurrency: 'EUR' });
    expect(result(withPlan({ quantity: null }), 'r1')).toMatchObject({ verdict: 'unknown', reason: 'plan-incomplete' });
    const tiny = { ...withPlan({ entry: d('0.0000125'), stop: d('0.000012'), quantity: d('1000000') }), rules: [{ id: 'r1', kind: 'max-risk', amount: d('0.5'), currency: 'USDT' } as StrategyRule] };
    expect(result(tiny, 'r1')).toMatchObject({ verdict: 'kept', risk: '0.5' });
  });

  it('checks the least reward for what you risk', () => {
    expect(result(withPlan({ target: d('104') }), 'r2')).toMatchObject({ verdict: 'broken', reason: 'below', ratio: '0.8' });
    const uneven = result(withPlan({ entry: d('100'), stop: d('97'), target: d('107') }), 'r2');
    expect(uneven).toMatchObject({ verdict: 'kept', shownRatio: '2.33' });
    expect(uneven.kind === 'min-reward-to-risk' && uneven.ratio!.startsWith('2.333')).toBe(true);
    const short = { ...base, side: 'short' as const };
    expect(result(short, 'r2')).toMatchObject({ verdict: 'unknown', reason: 'levels-not-ordered' });
    expect(result(short, 'r1')).toMatchObject({ risk: '50' });
    expect(result({ ...base, side: null }, 'r2')).toMatchObject({ verdict: 'unknown', reason: 'plan-incomplete' });
  });

  it('breaks the stop rule when the plan has no stop', () => {
    const input = withPlan({ stop: null });
    expect(result(input, 'r3')).toMatchObject({ verdict: 'broken', reason: 'no-stop' });
    expect(result(input, 'r1')).toMatchObject({ verdict: 'unknown', reason: 'plan-incomplete' });
    expect(result(input, 'r2')).toMatchObject({ verdict: 'unknown', reason: 'plan-incomplete' });
  });

  it('checks the checklist, and never breaks it when there is none', () => {
    expect(result({ ...base, checklist: { ticked: 5, asked: 5, complete: true } }, 'r4')).toMatchObject({ verdict: 'kept', reason: 'every-step' });
    expect(result({ ...base, checklist: { ticked: 3, asked: 5, complete: false } }, 'r4')).toMatchObject({ verdict: 'broken', reason: 'steps-missed', ticked: 3, asked: 5 });
    expect(result({ ...base, status: 'closed' }, 'r4')).toMatchObject({ verdict: 'unknown', reason: 'no-checklist' });
    expect(result({ ...base, status: 'cancelled' }, 'r4')).toMatchObject({ verdict: 'unknown', reason: 'cancelled' });
    expect(result({ ...base, status: null }, 'r4')).toMatchObject({ verdict: 'unknown' });
  });

  it('checks the market and the written rules', () => {
    expect(result({ ...base, symbol: 'SOLUSDT' }, 'r5')).toMatchObject({ verdict: 'broken', reason: 'not-listed' });
    expect(result({ ...base, symbol: '' }, 'r5')).toMatchObject({ verdict: 'unknown', reason: 'no-market' });
    expect(result({ ...base, answers: [{ ruleId: 'r6', answer: 'yes' }] }, 'r6')).toMatchObject({ verdict: 'kept', reason: 'said-yes' });
    expect(result({ ...base, answers: [{ ruleId: 'r6', answer: 'no' }] }, 'r6')).toMatchObject({ verdict: 'broken', reason: 'said-no' });
  });

  it('never counts missing data as kept or broken, except a plan with no stop', () => {
    const check = checkTradeStrategy({ rules: R, answers: [], symbol: '', side: null, status: null, priceCurrency: null, plan: { entry: null, stop: null, target: null, quantity: null }, checklist: null });
    expect(check.results.map(item => item.verdict)).toEqual(['unknown', 'unknown', 'broken', 'unknown', 'unknown', 'unknown']);
  });
});

describe('T-040e checks for a saved trade and for the form', () => {
  const tradeId = 't1' as TradeId;
  const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-24T08:00:00.000Z', closedAt: null, createdAt: '2026-09-24T08:00:00.000Z', updatedAt: '2026-09-24T08:00:00.000Z' };
  const plan = (id: string, quantity: string, updatedAt: string): TradePlanRecord => ({ id: id as TradePlanId, tradeId, plannedEntryPrice: d('100'), plannedStopPrice: d('95'), plannedTargetPrice: d('110'), plannedQuantity: d(quantity), createdAt: '2026-09-24T08:00:00.000Z', updatedAt });
  const record = (overrides: Partial<TradeDisciplineRecord> = {}): TradeDisciplineRecord => ({
    id: 'dr' as TradeDisciplineId, tradeId, preTradeChecklist: [], postTradeReview: [], mistakes: [], note: '', checklistCompletedAt: null, reviewedAt: null,
    createdAt: '2026-09-24T08:00:00.000Z', updatedAt: '2026-09-24T08:00:00.000Z', ...overrides,
  });
  const mark = { strategyId: 'breakout', revision: 1, name: 'Breakout', rules: R, answers: [{ ruleId: 'r6', answer: 'yes' as const }], linkedAt: '2026-09-24T08:00:00.000Z' };

  it('is null without a strategy, and uses the latest plan, the mark and the checklist', () => {
    expect(checkSavedTradeStrategy(trade, [], record())).toBeNull();
    expect(checkSavedTradeStrategy(trade, [], null)).toBeNull();
    const plans = [plan('p1', '10', '2026-09-24T08:00:00.000Z'), plan('p2', '11', '2026-09-24T09:00:00.000Z')];
    const withChecklist = record({ strategy: mark, preTradeChecklist: [{ itemId: 'plan-written', label: 'I wrote down my plan', answer: 'yes' }], checklistCompletedAt: '2026-09-24T08:00:00.000Z' });
    const check = checkSavedTradeStrategy(trade, plans, withChecklist)!;
    expect(check.results.find(item => item.ruleId === 'r1')).toMatchObject({ risk: '55', verdict: 'broken' });
    expect(check.results.find(item => item.ruleId === 'r4')).toMatchObject({ verdict: 'kept' });
    expect(check.results.find(item => item.ruleId === 'r6')).toMatchObject({ verdict: 'kept' });
  });

  it('previews the form as typed', () => {
    const strategy: Strategy = { id: 'breakout', name: 'Breakout', revision: 1, rules: R };
    const draft = { ...createEmptyManualTradeDraft(), symbol: 'BTCUSDT', side: 'long' as const, priceCurrency: ' usdt ', plan: { plannedEntryPrice: 'abc', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '10' } };
    const preview = (overrides: object) => previewTradeStrategyCheck({ ...draft, ...overrides }, 'open', strategy);
    expect(preview({}).results[0]).toMatchObject({ verdict: 'unknown', reason: 'plan-incomplete' });
    const typed = { plan: { ...draft.plan, plannedEntryPrice: '100' } };
    expect(preview(typed).results[0]).toMatchObject({ verdict: 'kept', tradeCurrency: 'USDT' });
    expect(preview({ ...typed, priceCurrency: 'US D' }).results[0]).toMatchObject({ reason: 'no-currency' });
    expect(preview({ ...typed, side: '' }).results[1]).toMatchObject({ reason: 'plan-incomplete' });
  });
});

describe('T-040e bars and the latest plan', () => {
  it('draws the larger value as the full bar', () => {
    expect(projectStrategyRuleBars('1', '2')).toEqual({ firstSteps: 5, secondSteps: 10 });
    expect(projectStrategyRuleBars('55', '50')).toEqual({ firstSteps: 10, secondSteps: 9 });
    expect(projectStrategyRuleBars('0', '50')).toEqual({ firstSteps: 0, secondSteps: 10 });
    expect(projectStrategyRuleBars('abc', '1')).toBeNull();
  });

  it('names the plan updated last', () => {
    const tradeId = 't1' as TradeId;
    const plan = (id: string, updatedAt: string) => ({ id: id as TradePlanId, tradeId, plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null, createdAt: updatedAt, updatedAt }) as TradePlanRecord;
    expect(latestTradePlan([])).toBeNull();
    expect(latestTradePlan([plan('b', '2026-09-24T09:00:00.000Z'), plan('a', '2026-09-24T08:00:00.000Z')])?.id).toBe('b');
  });
});
