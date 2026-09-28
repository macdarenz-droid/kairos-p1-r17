import { describe, expect, it } from 'vitest';
import { checkTradeStrategy, type TradeStrategyCheckInput } from '../src/application/discipline/strategyCheck';
import { describeStrategyRuleResult } from '../src/application/discipline/strategyWords';
import type { StrategyRule } from '../src/domain/discipline';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
const rule: StrategyRule = { id: 'r1', kind: 'max-risk', amount: d('50'), currency: 'USDT' } as StrategyRule;
const base: TradeStrategyCheckInput = {
  rules: [rule], answers: [], symbol: 'btc/usdt', side: 'long', status: 'open', priceCurrency: 'USDT',
  plan: { entry: d('100'), stop: d('95'), target: d('110'), quantity: d('10') }, checklist: null,
};
const maxRisk = (input: TradeStrategyCheckInput) => checkTradeStrategy(input).results[0]!;

describe('T-050b the "most risk" rule reads the money-at-risk owner', () => {
  it('a stop on the wrong side cannot be checked', () => {
    const result = maxRisk({ ...base, side: 'short' });
    expect(result).toMatchObject({ verdict: 'unknown', reason: 'levels-not-ordered', risk: null });
    expect(describeStrategyRuleResult(result)).toBe("Risk: your stop is at or on the wrong side of your entry, so Kairos can't check it.");
  });

  it('no direction yet is an incomplete plan', () => {
    const result = maxRisk({ ...base, side: null });
    expect(result).toMatchObject({ verdict: 'unknown', reason: 'plan-incomplete', risk: null });
    expect(describeStrategyRuleResult(result)).toBe('Risk: add the direction and your planned entry, stop and quantity so Kairos can check it.');
  });

  it('the long plan still risks 50', () => {
    expect(maxRisk(base)).toMatchObject({ verdict: 'kept', reason: 'within', risk: '50' });
  });
});
