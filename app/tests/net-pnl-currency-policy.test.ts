import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { assessNetPnlCurrencyCompatibility } from '../src/domain/calculations';

const d = (value: string) => value as DecimalString;

describe('P11.19 Net P&L currency comparability policy', () => {
  it('allows authoritative zero fees without inventing currency evidence', () => {
    expect(assessNetPnlCurrencyCompatibility(d('0.00'), null, null)).toEqual({
      ok: true,
      compatible: true,
      basis: 'zero-fees',
    });
  });

  it('allows non-zero composition only when explicit currencies match', () => {
    expect(assessNetPnlCurrencyCompatibility(d('1.25'), 'AUD', 'AUD')).toEqual({
      ok: true,
      compatible: true,
      basis: 'same-currency',
    });
  });

  it('blocks non-zero fees when gross P&L currency evidence is missing', () => {
    expect(assessNetPnlCurrencyCompatibility(d('1'), null, 'USD')).toEqual({
      ok: true,
      compatible: false,
      reason: 'missing-gross-pnl-currency',
    });
  });

  it('blocks non-zero fees when fee currency evidence is missing', () => {
    expect(assessNetPnlCurrencyCompatibility(d('1'), 'USD', null)).toEqual({
      ok: true,
      compatible: false,
      reason: 'missing-fee-currency',
    });
  });

  it('blocks unlike currencies instead of silently subtracting them', () => {
    expect(assessNetPnlCurrencyCompatibility(d('1'), 'USD', 'AUD')).toEqual({
      ok: true,
      compatible: false,
      reason: 'currency-mismatch',
    });
  });

  it('rejects malformed fee decimals', () => {
    expect(assessNetPnlCurrencyCompatibility(d('not-a-decimal'), 'USD', 'USD')).toEqual({
      ok: false,
      reason: 'invalid-decimal',
    });
  });
});
