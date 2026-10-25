import { describe, expect, it } from 'vitest';
import { calculateMoneyAtRisk, calculateMoneyAtRiskFromPrice } from '../src/domain/calculations/riskCalculator';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;

describe('T-050b the money-at-risk formula', () => {
  it('works out a long and a short, exactly', () => {
    expect(calculateMoneyAtRiskFromPrice('long', d('100'), d('90'), d('2'))).toEqual({ ok: true, amount: '20' });
    expect(calculateMoneyAtRisk('long', d('305'), d('90'), d('3'))).toEqual({ ok: true, amount: '35' });
    expect(calculateMoneyAtRiskFromPrice('short', d('100'), d('110'), d('2'))).toEqual({ ok: true, amount: '20' });
    expect(calculateMoneyAtRiskFromPrice('long', d('0.0000125'), d('0.000012'), d('1000000'))).toEqual({ ok: true, amount: '0.5' });
  });

  it('gives no number for a stop at or past the entry', () => {
    expect(calculateMoneyAtRiskFromPrice('long', d('100'), d('100'), d('2'))).toEqual({ ok: false, reason: 'stop-at-entry' });
    expect(calculateMoneyAtRiskFromPrice('long', d('100'), d('110'), d('2'))).toEqual({ ok: false, reason: 'stop-not-on-loss-side' });
    expect(calculateMoneyAtRiskFromPrice('short', d('100'), d('90'), d('2'))).toEqual({ ok: false, reason: 'stop-not-on-loss-side' });
  });

  it('refuses no size and anything that is not a decimal', () => {
    expect(calculateMoneyAtRisk('long', d('200'), d('90'), d('0'))).toEqual({ ok: false, reason: 'no-size' });
    expect(calculateMoneyAtRiskFromPrice('long', d('100'), d('90'), d('0'))).toEqual({ ok: false, reason: 'no-size' });
    expect(calculateMoneyAtRisk('long', d('200'), d('90'), d('abc'))).toEqual({ ok: false, reason: 'invalid-decimal' });
    expect(calculateMoneyAtRisk('long', d('200'), d('abc'), d('2'))).toEqual({ ok: false, reason: 'invalid-decimal' });
    expect(calculateMoneyAtRiskFromPrice('long', d('100'), d('abc'), d('2'))).toEqual({ ok: false, reason: 'invalid-decimal' });
  });
});
