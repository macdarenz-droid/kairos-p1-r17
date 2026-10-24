import { describe, expect, it } from 'vitest';
import {
  assessVisualPnlAggregationEligibility,
  type VisualPnlOutcomeProjection,
} from '../src/application/visual-pnl';
import type { DecimalString } from '../src/domain/trades';

function projection(
  outcome: 'profit' | 'loss' | 'breakeven',
  amount: string,
  currency: string | null,
): VisualPnlOutcomeProjection {
  return Object.freeze({
    outcome,
    label: outcome === 'profit' ? 'Profit' : outcome === 'loss' ? 'Loss' : 'Break-even',
    amount: amount as DecimalString,
    currency,
    source: 'net-pnl',
  });
}

describe('P13.4 Visual P&L aggregation eligibility', () => {
  it('allows same-currency authoritative amounts without aggregating them', () => {
    const result = assessVisualPnlAggregationEligibility([
      projection('profit', '12.50', 'USD'),
      projection('loss', '-2.25', 'USD'),
      projection('breakeven', '0', 'USD'),
    ]);

    expect(result).toEqual({
      eligible: true,
      currency: 'USD',
      amounts: ['12.50', '-2.25', '0'],
    });
  });

  it('blocks mixed currencies rather than inferring FX comparability', () => {
    expect(assessVisualPnlAggregationEligibility([
      projection('profit', '10', 'USD'),
      projection('profit', '20', 'AUD'),
    ])).toEqual({
      eligible: false,
      currency: null,
      amounts: [],
      reason: 'mixed-currencies',
    });
  });

  it('blocks otherwise-valid values when currency evidence is missing', () => {
    expect(assessVisualPnlAggregationEligibility([
      projection('profit', '10', null),
    ])).toEqual({
      eligible: false,
      currency: null,
      amounts: [],
      reason: 'missing-currency-evidence',
    });
  });

  it('blocks unavailable outcomes and empty sets', () => {
    const unavailable: VisualPnlOutcomeProjection = Object.freeze({
      outcome: 'unavailable', label: 'Not available', amount: null, currency: null, source: 'none',
    });
    expect(assessVisualPnlAggregationEligibility([unavailable])).toMatchObject({
      eligible: false,
      reason: 'unavailable-trade-outcome',
    });
    expect(assessVisualPnlAggregationEligibility([])).toMatchObject({
      eligible: false,
      reason: 'no-trades',
    });
  });

  it('compares currency evidence exactly instead of normalizing or guessing', () => {
    expect(assessVisualPnlAggregationEligibility([
      projection('profit', '1', 'USD'),
      projection('profit', '2', 'usd'),
    ])).toMatchObject({ eligible: false, reason: 'mixed-currencies' });
  });
});
