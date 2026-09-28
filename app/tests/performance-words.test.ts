import { describe, expect, it } from 'vitest';
import { describeClosedPart, describeMoneyAtRisk } from '../src/application/performance/performanceWords';
import type { TradeClosedPart } from '../src/application/performance/tradeClosedPart';
import type { TradeMoneyAtRisk } from '../src/application/performance/tradeRisk';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
const atRisk = (basis: 'as-traded' | 'as-planned', currency: string | null): TradeMoneyAtRisk =>
  ({ available: true, basis, entryPrice: d('102'), stopPrice: d('90'), size: d('2'), amount: d('24'), currency });
const part = (rest: 'still-open' | 'exit-missing', feesSoFar: Readonly<{ amount: DecimalString; currency: string }> | null): Extract<TradeClosedPart, { available: true }> =>
  ({ available: true, outcome: 'profit', resultBeforeFees: d('8'), currency: 'USDT', closedQuantity: d('1'), enteredQuantity: d('2.5'), openQuantity: d('1.5'), rest, feesSoFar });

describe('U4 words for money at risk and the closed part', () => {
  it('says money at risk as traded, as planned, and why it is not given', () => {
    expect(describeMoneyAtRisk(atRisk('as-traded', 'USDT'))).toBe('24 USDT');
    expect(describeMoneyAtRisk(atRisk('as-traded', null))).toBe('24');
    expect(describeMoneyAtRisk(atRisk('as-planned', 'USDT'))).toBe('24 USDT, as planned');
    const not = (reason: Extract<TradeMoneyAtRisk, { available: false }>['reason']) => describeMoneyAtRisk({ available: false, basis: 'as-traded', reason });
    expect(not('no-stop')).toBe('Not available: no stop');
    expect(not('no-entry')).toBe('Not available: no entry price');
    expect(not('no-size')).toBe('Not available: no size');
    expect(not('stop-at-entry')).toBe('Not available: the stop is not on the losing side');
    expect(not('stop-not-on-loss-side')).toBe('Not available: the stop is not on the losing side');
    expect(not('invalid-decimal')).toBe('Not available');
  });

  it('says what part of the trade is closed, for both rests, with and without fees', () => {
    expect(describeClosedPart(part('still-open', null))).toBe('1 of 2.5 closed, before fees. The rest is still open. Kairos closes your oldest entries first.');
    expect(describeClosedPart(part('still-open', { amount: d('0.3'), currency: 'USDT' })))
      .toBe('1 of 2.5 closed, before fees. The rest is still open. Kairos closes your oldest entries first. Fees so far: 0.3 USDT.');
    expect(describeClosedPart(part('exit-missing', null)))
      .toBe('1 of 2.5 closed, before fees. Kairos has no exit for the other 1.5: add it to see the full result. Kairos closes your oldest entries first.');
    expect(describeClosedPart(part('exit-missing', { amount: d('0.3'), currency: 'USDT' })))
      .toBe('1 of 2.5 closed, before fees. Kairos has no exit for the other 1.5: add it to see the full result. Kairos closes your oldest entries first. Fees so far: 0.3 USDT.');
  });
});
