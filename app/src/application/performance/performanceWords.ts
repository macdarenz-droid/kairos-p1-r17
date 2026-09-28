/**
 * U4 (P11.A1, D194): the plain words for a trade's money at risk and its closed part. Words only: every number comes from its owner as given.
 */

import type { TradeClosedPart } from './tradeClosedPart';
import type { TradeMoneyAtRisk, TradeMoneyAtRiskReason } from './tradeRisk';

const NOT_GIVEN: Readonly<Record<TradeMoneyAtRiskReason, string>> = Object.freeze({
  'no-stop': 'Not available: no stop',
  'no-entry': 'Not available: no entry price',
  'no-size': 'Not available: no size',
  'stop-at-entry': 'Not available: the stop is not on the losing side',
  'stop-not-on-loss-side': 'Not available: the stop is not on the losing side',
  'invalid-decimal': 'Not available',
});

export function describeMoneyAtRisk(value: TradeMoneyAtRisk): string {
  if (!value.available) return NOT_GIVEN[value.reason];
  const amount = value.currency ? `${value.amount} ${value.currency}` : value.amount;
  return value.basis === 'as-planned' ? `${amount}, as planned` : amount;
}

export function describeClosedPart(value: Extract<TradeClosedPart, { available: true }>): string {
  const rest = value.rest === 'still-open'
    ? 'The rest is still open.'
    : `Kairos has no exit for the other ${value.openQuantity}: add it to see the full result.`;
  const fees = value.feesSoFar === null ? '' : ` Fees so far: ${value.feesSoFar.amount} ${value.feesSoFar.currency}.`;
  return `${value.closedQuantity} of ${value.enteredQuantity} closed, before fees. ${rest} Kairos closes your oldest entries first.${fees}`;
}
