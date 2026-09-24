import { describe, expect, it } from 'vitest';
import { summarizeVisualPnlAggregation, type VisualPnlOutcomeProjection } from '../src/application/visual-pnl';
import { parseDecimalString } from '../src/domain/trades';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid fixture decimal: ${value}`);
  return parsed.value;
}

function projection(
  outcome: VisualPnlOutcomeProjection['outcome'],
  amount: VisualPnlOutcomeProjection['amount'],
  currency: VisualPnlOutcomeProjection['currency'],
): VisualPnlOutcomeProjection {
  return Object.freeze({
    outcome,
    label: outcome === 'profit' ? 'Profit' : outcome === 'loss' ? 'Loss' : outcome === 'breakeven' ? 'Break-even' : 'Not available',
    amount,
    currency,
    source: amount === null ? 'none' : 'net-pnl',
  });
}

describe('P13.5 Visual P&L aggregation summary', () => {
  it('sums comparable same-currency evidence through the decimal kernel', () => {
    expect(summarizeVisualPnlAggregation([
      projection('profit', dec('10.25'), 'USD'),
      projection('loss', dec('-3.1'), 'USD'),
      projection('breakeven', dec('0'), 'USD'),
    ])).toEqual({
      available: true,
      currency: 'USD',
      total: '7.15',
      outcome: 'profit',
      tradeCount: 3,
    });
  });

  it('classifies an exact zero aggregate as breakeven', () => {
    expect(summarizeVisualPnlAggregation([
      projection('profit', dec('2.5'), 'AUD'),
      projection('loss', dec('-2.5'), 'AUD'),
    ])).toMatchObject({ available: true, currency: 'AUD', total: '0', outcome: 'breakeven' });
  });

  it('does not aggregate mixed currencies', () => {
    expect(summarizeVisualPnlAggregation([
      projection('profit', dec('10'), 'USD'),
      projection('profit', dec('10'), 'AUD'),
    ])).toEqual({
      available: false,
      currency: null,
      total: null,
      outcome: null,
      tradeCount: 2,
      reason: 'mixed-currencies',
    });
  });

  it('does not aggregate unavailable trade evidence', () => {
    expect(summarizeVisualPnlAggregation([
      projection('profit', dec('10'), 'USD'),
      projection('unavailable', null, null),
    ])).toMatchObject({ available: false, reason: 'unavailable-trade-outcome', tradeCount: 2 });
  });
});
