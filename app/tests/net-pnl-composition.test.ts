import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { calculateComparableNetPnl } from '../src/domain/calculations';

const d = (value: string) => value as DecimalString;

describe('P11.20 Net P&L currency-aware composition primitive', () => {
  it('subtracts zero fees without inventing currency evidence', () => {
    expect(calculateComparableNetPnl(d('125.50'), d('0.00'), null, null)).toEqual({
      ok: true,
      available: true,
      netPnl: '125.5',
      currency: null,
      basis: 'zero-fees',
    });
  });

  it('subtracts same-currency fees exactly', () => {
    expect(calculateComparableNetPnl(d('125.50'), d('1.25'), 'AUD', 'AUD')).toEqual({
      ok: true,
      available: true,
      netPnl: '124.25',
      currency: 'AUD',
      basis: 'same-currency',
    });
  });

  it('preserves negative net P&L exactly', () => {
    expect(calculateComparableNetPnl(d('-10'), d('1.5'), 'USD', 'USD')).toEqual({
      ok: true,
      available: true,
      netPnl: '-11.5',
      currency: 'USD',
      basis: 'same-currency',
    });
  });

  it('keeps composition unavailable when gross P&L currency evidence is missing', () => {
    expect(calculateComparableNetPnl(d('10'), d('1'), null, 'USD')).toEqual({
      ok: true,
      available: false,
      reason: 'missing-gross-pnl-currency',
    });
  });

  it('keeps composition unavailable when fee currency evidence is missing', () => {
    expect(calculateComparableNetPnl(d('10'), d('1'), 'USD', null)).toEqual({
      ok: true,
      available: false,
      reason: 'missing-fee-currency',
    });
  });

  it('keeps composition unavailable when currencies differ', () => {
    expect(calculateComparableNetPnl(d('10'), d('1'), 'USD', 'AUD')).toEqual({
      ok: true,
      available: false,
      reason: 'currency-mismatch',
    });
  });

  it('rejects malformed gross P&L decimals', () => {
    expect(calculateComparableNetPnl(d('bad'), d('1'), 'USD', 'USD')).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });

  it('rejects malformed fee decimals before composition', () => {
    expect(calculateComparableNetPnl(d('10'), d('bad'), 'USD', 'USD')).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });
});
