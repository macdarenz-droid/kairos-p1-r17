/**
 * U4 (P11.A1, D194): the plain words for a trade's money at risk and its closed part. Words only: every number comes from its owner as given.
 */

import type { ContractSize } from '../../domain/calculations/contractSize';
import type { PriceMove } from './priceMove';
import type { TradeClosedPart } from './tradeClosedPart';
import type { TradeMoneyAtRisk, TradeMoneyAtRiskReason } from './tradeRisk';

const NOT_GIVEN: Readonly<Record<TradeMoneyAtRiskReason, string>> = Object.freeze({
  'no-stop': 'Not available: no stop',
  'no-entry': 'Not available: no entry price',
  'no-size': 'Not available: no size',
  'stop-at-entry': 'Not available: the stop is not on the losing side',
  'stop-not-on-loss-side': 'Not available: the stop is not on the losing side',
  'needs-contract-size': 'Not available: add how much one point is worth',
  'invalid-decimal': 'Not available',
});

/** D237: shown where a futures or options result would be when the trade has no "how much one point is worth". */
export const NEEDS_CONTRACT_SIZE_WORDS = 'Add how much one point is worth to see this result.';
export const CLOSED_PART_NEEDS_CONTRACT_SIZE_WORDS = 'Closed part: add how much one point is worth to see its result.';

/** "50 USD", "1 USDT (crypto perpetual)" or "Not saved yet" for futures and options; null where a point is simply one unit (D237). */
export function describePointValue(contractSize: ContractSize, priceCurrency: string | null): string | null {
  if (!contractSize.ok) return 'Not saved yet';
  if (contractSize.basis === 'not-needed') return null;
  const amount = priceCurrency ? `${contractSize.value} ${priceCurrency}` : contractSize.value;
  return contractSize.basis === 'stablecoin' ? `${amount} (crypto perpetual)` : amount;
}

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

/** U6 (D192): how far price went for and against you, from your average entry; null when it is not known. Amounts as the owner shows them. */
export function describePriceMove(move: PriceMove): string | null {
  if (!move.available) return null;
  const forYou = `${move.forYouIsAbout ? 'about ' : ''}${move.shownForYou}`;
  const againstYou = `${move.againstYouIsAbout ? 'about ' : ''}${move.shownAgainstYou}`;
  return `From your average entry, price went ${forYou} for you and ${againstYou} against you${move.soFar ? ' so far' : ''}.`;
}
